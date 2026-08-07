import { describe, expect, it } from 'vitest'

import {
  GitError,
  classifyGitError,
  describeForLog,
  messageFor,
  redactCredentials,
  toGitError,
} from '@/lib/git/errors'
import type { GitErrorCode } from '@/lib/git/types'

const ALL_CODES: GitErrorCode[] = [
  'GIT_NOT_INSTALLED',
  'NOT_A_REPOSITORY',
  'IDENTITY_UNSET',
  'INDEX_LOCKED',
  'TIMEOUT',
  'AUTH_FAILED',
  'REMOTE_UNREACHABLE',
  'OPERATION_IN_PROGRESS',
  'GIT_FAILED',
]

describe('redactCredentials', () => {
  /*
   * Git echoes remote URLs into its own error output freely, and a remote URL
   * can carry a credential. This runs before anything is logged or shown, so a
   * miss here writes a live token to the server log.
   */

  it('redacts a token carried as the username', () => {
    // The common shape: no colon, so a `user:password`-only rule would miss it.
    expect(
      redactCredentials(
        "fatal: could not read from 'https://ghp_SECRET@github.com/me/vault.git'",
      ),
    ).toBe("fatal: could not read from 'https://***@github.com/me/vault.git'")
  })

  it('redacts a user:password pair', () => {
    expect(redactCredentials('https://user:tok_abc@gitlab.com/x.git')).toBe(
      'https://***@gitlab.com/x.git',
    )
  })

  it('leaves the host and path intact so the message still says which remote', () => {
    const out = redactCredentials('https://u:p@github.com/me/vault.git')

    expect(out).toContain('github.com/me/vault.git')
    expect(out).not.toContain('u:p')
  })

  it('redacts every occurrence, not just the first', () => {
    expect(
      redactCredentials('https://a:b@x.com/1.git and https://c:d@y.com/2.git'),
    ).toBe('https://***@x.com/1.git and https://***@y.com/2.git')
  })

  it('leaves an scp-style remote alone, having no userinfo to redact', () => {
    // `git@github.com:me/vault.git` carries no secret and no scheme, so the
    // pattern must not fire on it — mangling it would obscure a real message.
    expect(redactCredentials('git@github.com:me/vault.git')).toBe(
      'git@github.com:me/vault.git',
    )
  })

  it('leaves ordinary text and credential-free URLs untouched', () => {
    expect(redactCredentials('fatal: not a git repository')).toBe(
      'fatal: not a git repository',
    )
    expect(redactCredentials('https://github.com/me/vault.git')).toBe(
      'https://github.com/me/vault.git',
    )
  })
})

describe('classifyGitError', () => {
  /*
   * simple-git surfaces the underlying failure only as stderr text — there is
   * no structured code to branch on — so these patterns are matched against
   * real Git output. Each string below is what Git actually prints.
   */

  it.each([
    ['spawn git ENOENT', 'GIT_NOT_INSTALLED'],
    ['fatal: not a git repository (or any of the parent directories): .git', 'NOT_A_REPOSITORY'],
    ['*** Please tell me who you are.', 'IDENTITY_UNSET'],
    ['fatal: Unable to create \'/v/.git/index.lock\': File exists.', 'INDEX_LOCKED'],
    ['block timeout reached', 'TIMEOUT'],
    ["fatal: Authentication failed for 'https://github.com/me/vault.git/'", 'AUTH_FAILED'],
    ['fatal: could not read Username for \'https://github.com\'', 'AUTH_FAILED'],
    // `rm` and `mv` word this differently, and differently again across Git
    // versions — hence the alternation in the pattern.
    ["fatal: pathspec 'notes/a.md' did not match any files", 'UNTRACKED_PATH'],
    ['fatal: not under version control, source=notes/a.md, destination=notes/b.md', 'UNTRACKED_PATH'],
    ['error: the following file has no staged changes\nnothing to commit, working tree clean', 'NOTHING_TO_COMMIT'],
    // Spec 6. Network failures reach a user as often as auth ones, and until
    // now both fell through to "run `git status` for details".
    ["fatal: unable to access 'https://github.com/me/vault.git/': Could not resolve host: github.com", 'REMOTE_UNREACHABLE'],
    ['ssh: Could not resolve hostname github.com: nodename nor servname provided', 'REMOTE_UNREACHABLE'],
    ["fatal: '/tmp/gone.git' does not appear to be a git repository", 'REMOTE_UNREACHABLE'],
    ['fatal: unable to access: Failed to connect to github.com port 443: Connection refused', 'REMOTE_UNREACHABLE'],
    ['fatal: It seems that there is already a rebase-merge directory', 'OPERATION_IN_PROGRESS'],
    ['error: could not commit. You have unmerged files.', 'OPERATION_IN_PROGRESS'],
  ] as const)('maps %j', (message, expected) => {
    expect(classifyGitError(new Error(message))).toBe(expected)
  })

  it('classifies a rejected credential as auth, not as an unreachable remote', () => {
    /*
     * The order that matters most in this file, and the string is chosen so it
     * actually tests the order: an HTTPS rejection prints "unable to access"
     * — which the unreachability pattern matches — *and* "Authentication
     * failed". Whichever pattern is consulted first wins, so moving
     * `REMOTE_UNREACHABLE` above `AUTH_FAILED` would send the user to check
     * their network when the fix is their token.
     */
    expect(
      classifyGitError(
        new Error(
          "fatal: unable to access 'https://github.com/me/vault.git/': The requested URL returned error: 403\nfatal: Authentication failed for 'https://github.com/me/vault.git/'",
        ),
      ),
    ).toBe('AUTH_FAILED')

    // The same overlap from the SSH side.
    expect(
      classifyGitError(
        new Error(
          'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
        ),
      ),
    ).toBe('AUTH_FAILED')
  })

  it('classifies a missing repository before an unmatched pathspec', () => {
    // Order matters: `git rm` inside a non-repository reports both conditions,
    // and telling the user "Git is not tracking that file" would send them
    // looking for the wrong problem.
    expect(
      classifyGitError(
        new Error(
          "fatal: not a git repository (or any of the parent directories): .git\nfatal: pathspec 'a.md' did not match any files",
        ),
      ),
    ).toBe('NOT_A_REPOSITORY')
  })

  it('falls back to a generic code rather than guessing', () => {
    // The fallback is what keeps stderr out of the UI: an unrecognised failure
    // gets a safe sentence instead of being passed through.
    expect(classifyGitError(new Error('something nobody predicted'))).toBe(
      'GIT_FAILED',
    )
  })

  it('handles a throw that is not an Error at all', () => {
    expect(classifyGitError('git: command not found')).toBe('GIT_NOT_INSTALLED')
    expect(classifyGitError(undefined)).toBe('GIT_FAILED')
  })
})

describe('messageFor', () => {
  it('gives every code a message that names an action', () => {
    for (const code of ALL_CODES) {
      const message = messageFor(code)

      expect(message, code).toBeTruthy()
      // §7.6: the message exists to tell the user what to do about it.
      expect(message, code).toMatch(/[.!]$/)
    }
  })

  it('never leaks a path, a stack frame or raw stderr', () => {
    for (const code of ALL_CODES) {
      const message = messageFor(code)

      expect(message, code).not.toMatch(/\bat \w+ \(|node_modules|\.git\/|fatal:/)
    }
  })

  it('tells the user the exact command for the two setup failures', () => {
    // These are the states a new user actually hits, so the fix has to be
    // copy-pasteable rather than described.
    expect(messageFor('IDENTITY_UNSET')).toContain('git config --global user.email')
    expect(messageFor('NOT_A_REPOSITORY')).toContain('git init')
  })
})

describe('toGitError', () => {
  it('converts an engine failure into a coded error with a safe message', () => {
    const error = toGitError(
      new Error("fatal: Authentication failed for 'https://tok@github.com/x'"),
    )

    expect(error).toBeInstanceOf(GitError)
    expect(error.code).toBe('AUTH_FAILED')
    expect(error.message).toBe(messageFor('AUTH_FAILED'))
    // The whole point: the token in the original never reaches the message.
    expect(error.message).not.toContain('tok')
  })

  it('passes an already-classified error straight through', () => {
    // Otherwise a rethrow inside the service would re-classify its own
    // friendly message and land on GIT_FAILED.
    const original = new GitError('INDEX_LOCKED', messageFor('INDEX_LOCKED'))

    expect(toGitError(original)).toBe(original)
  })
})

describe('describeForLog', () => {
  it('redacts credentials before anything reaches the server log', () => {
    expect(
      describeForLog(new Error('remote: https://u:tok@github.com/x.git denied')),
    ).not.toContain('tok')
  })

  it('flattens multi-line stderr into one line so it does not read like a crash', () => {
    expect(
      describeForLog(new Error('fatal: one\n  fatal: two\n\n  fatal: three')),
    ).toBe('fatal: one fatal: two fatal: three')
  })
})
