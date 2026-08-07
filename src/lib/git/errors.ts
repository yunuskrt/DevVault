/**
 * Engine failures, translated.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. **Raw stderr never reaches the browser.** `coding-standards.md` forbids
 *    exposing internals, and Git's stderr is a wall of text that will read like
 *    a DevVault bug. Every failure becomes a `GitErrorCode` plus one of the
 *    §7.6 sentences, written to name the fix.
 * 2. **Credentials never reach a log or a screen.** A remote URL can embed
 *    one (`https://user:token@host/…`), and Git echoes remote URLs into its
 *    error output freely.
 */

import type { GitErrorCode } from '@/lib/git/types'

export class GitError extends Error {
  readonly code: GitErrorCode

  constructor(code: GitErrorCode, message: string) {
    super(message)
    this.name = 'GitError'
    this.code = code
  }
}

/**
 * Strips the userinfo out of any URL in `text`.
 *
 * Deliberately redacts a bare `user@` as well as `user:token@` — a token is
 * just as often carried as the username alone (`https://ghp_xxx@github.com/…`),
 * and there is nothing in the string to tell the two apart. The cost is that a
 * harmless `ssh://git@host` also comes back redacted, which is noise rather
 * than a loss.
 */
export const redactCredentials = (text: string): string =>
  text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1***@')

/** The §7.6 table. These strings are the whole user-facing error surface. */
const MESSAGES: Record<GitErrorCode, string> = {
  GIT_NOT_INSTALLED:
    'Git is not installed. Install Git and restart DevVault.',
  NOT_A_REPOSITORY:
    'This vault is not a Git repository yet. Run `git init` inside it to start versioning your items.',
  IDENTITY_UNSET:
    'Git needs your name and email. Run `git config --global user.email "you@example.com"` and `git config --global user.name "Your Name"`.',
  INDEX_LOCKED:
    'Another Git operation is in progress. Try again in a moment.',
  TIMEOUT:
    'Git took too long to respond. Check whether an operation is waiting on a password prompt.',
  AUTH_FAILED:
    'Could not authenticate with the remote. Check your Git credentials.',
  REMOTE_UNREACHABLE:
    'Could not reach the remote. Check your connection and the remote URL.',
  OPERATION_IN_PROGRESS:
    'Your vault is in the middle of a rebase or merge. Finish it, or run `git rebase --abort` in your vault, before syncing again.',
  // Both of the below are handled before they reach a user in normal use — the
  // caller falls back to the filesystem, or reports "nothing to commit" as the
  // ordinary state it is. They carry a sentence anyway because `messageFor` is
  // total over the union and a code with no message would be a silent blank.
  UNTRACKED_PATH:
    'Git is not tracking that file yet.',
  NOTHING_TO_COMMIT:
    'There is nothing to commit — the vault has no uncommitted changes.',
  GIT_FAILED:
    'Git reported an error. Run `git status` in your vault for details.',
}

export const messageFor = (code: GitErrorCode): string => MESSAGES[code]

/**
 * Patterns matched against the engine's own message, most specific first.
 *
 * Matching on text is unlovely, but `simple-git` surfaces the underlying
 * failure only as stderr — there is no structured code to branch on. Anything
 * unmatched falls through to `GIT_FAILED`, which is safe: the user gets a
 * generic sentence rather than a leak.
 */
const PATTERNS: ReadonlyArray<[RegExp, GitErrorCode]> = [
  [/ENOENT|command not found|spawn git/i, 'GIT_NOT_INSTALLED'],
  [/not a git repository/i, 'NOT_A_REPOSITORY'],
  // `git rm` and `git mv` on a file Git has never seen. The wordings differ
  // between the two commands and between Git versions, hence the alternation.
  [
    /did not match any files|not under version control|pathspec .* did not match/i,
    'UNTRACKED_PATH',
  ],
  [/nothing to commit|no changes added to commit/i, 'NOTHING_TO_COMMIT'],
  [/please tell me who you are|empty ident|user\.(name|email)/i, 'IDENTITY_UNSET'],
  [/index\.lock/i, 'INDEX_LOCKED'],
  [/timeout|timed out/i, 'TIMEOUT'],
  [
    /rebase in progress|already a rebase-(merge|apply) directory|you are in the middle of|cherry-pick is already in progress|revert is already in progress|you have unmerged files/i,
    'OPERATION_IN_PROGRESS',
  ],
  /*
   * Authentication before unreachability, and the order is load-bearing: an SSH
   * key rejection prints "Permission denied (publickey)" *and* "Could not read
   * from remote repository", so a pattern generous enough to catch a dead host
   * would swallow the auth case and send the user to check their network when
   * the fix is their key. For the same reason "could not read from remote
   * repository" appears in neither pattern — it is common to both and decides
   * nothing.
   */
  [
    /authentication failed|could not read username|could not read password|permission denied \(publickey\)|invalid username or password|access denied/i,
    'AUTH_FAILED',
  ],
  [
    /could not resolve host|could not resolve hostname|connection refused|network is unreachable|no route to host|failed to connect|unable to access|does not appear to be a git repository|repository not found/i,
    'REMOTE_UNREACHABLE',
  ],
]

export const classifyGitError = (error: unknown): GitErrorCode => {
  const raw = error instanceof Error ? `${error.message}` : String(error)
  const hit = PATTERNS.find(([pattern]) => pattern.test(raw))
  return hit ? hit[1] : 'GIT_FAILED'
}

/**
 * The one conversion every Git call site funnels through: whatever the engine
 * threw becomes a `GitError` carrying a code and a safe sentence.
 */
export const toGitError = (error: unknown): GitError => {
  if (error instanceof GitError) return error
  const code = classifyGitError(error)
  return new GitError(code, messageFor(code))
}

/**
 * What goes in the server log when a Git call fails. Redacted, and kept to one
 * line so it does not read like a crash — the user already has the friendly
 * sentence in the UI; this is for whoever is debugging.
 */
export const describeForLog = (error: unknown): string =>
  redactCredentials(error instanceof Error ? error.message : String(error))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
