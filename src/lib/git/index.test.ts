import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VaultError } from '@/lib/errors'
import { loadGitStatus } from '@/lib/git'
import { messageFor } from '@/lib/git/errors'
import { resetGitCaches } from '@/lib/git/simple-git-service'

/*
 * `loadGitStatus` is where the preflight order lives. What it must never do is
 * throw for a Git reason — every failure below is a state `GitSyncPanel` has to
 * render, and an exception here would take the whole layout down with it and
 * hide the user's items over a missing `user.email`.
 *
 * There is deliberately no test that the React `cache()` wrapper dedupes.
 * Outside a React request `cache()` falls through to the raw function, so such
 * a test would pass whether or not the wrapper were there. It was verified
 * against a running server instead: one request to `/` produced exactly one
 * vault read.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeDir = async (prefix: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirs.push(dir)
  return dir
}

const withVault = async <T>(root: string | undefined, run: () => Promise<T>) => {
  const previous = process.env.DEVVAULT_PATH
  if (root === undefined) delete process.env.DEVVAULT_PATH
  else process.env.DEVVAULT_PATH = root

  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.DEVVAULT_PATH
    else process.env.DEVVAULT_PATH = previous
  }
}

beforeEach(() => {
  resetGitCaches()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('loadGitStatus — states the panel renders', () => {
  it('reports a vault that is not a repository', async () => {
    // The state of every freshly seeded vault: the seed script does not init.
    const root = await makeDir('devvault-plain-')

    const result = await withVault(root, loadGitStatus)

    expect(result).toEqual({
      ok: false,
      code: 'NOT_A_REPOSITORY',
      message: messageFor('NOT_A_REPOSITORY'),
    })
  })

  it('reports a repository with no identity configured', async () => {
    const root = await makeDir('devvault-noident-')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.email', '')
    git(root, 'config', 'user.name', '')

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('IDENTITY_UNSET')
    // §7.6: the message has to name the fix, not just the problem.
    expect(result.message).toContain('git config --global user.email')
  })

  it('checks for a repository before it checks for an identity', async () => {
    /*
     * Order matters: a plain directory has no identity either, and telling the
     * user to run `git config` when what they need is `git init` sends them
     * somewhere useless.
     */
    const root = await makeDir('devvault-order-')

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe('NOT_A_REPOSITORY')
  })

  it('returns status and the last commit for a working repository', async () => {
    const root = await makeDir('devvault-ok-')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
    await fs.writeFile(path.join(root, 'a.md'), 'a', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status.branch).toBe('main')
    expect(result.status.isClean).toBe(true)
    expect(result.lastCommit?.message).toBe('first')
    // Spec 6 additions. A vault with no remote must not offer Sync, and one
    // that is not mid-anything must not show the paused state.
    expect(result.hasRemote).toBe(false)
    expect(result.operation).toBeNull()
  })

  it('reports a configured remote, which `tracking` alone cannot', async () => {
    /*
     * `status.tracking` is null both here and with no remote at all, so without
     * this field the panel cannot tell "never pushed" from "nothing to push
     * to" — and would hide Sync in exactly the state `push -u` exists for.
     */
    const root = await makeDir('devvault-remote-')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
    await fs.writeFile(path.join(root, 'a.md'), 'a', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')
    git(root, 'remote', 'add', 'origin', path.join(root, 'unused.git'))

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.status.tracking).toBeNull()
    expect(result.hasRemote).toBe(true)
  })

  it('surfaces a vault left suspended mid-rebase (§9.7)', async () => {
    const root = await makeDir('devvault-rebasing-')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
    await fs.writeFile(path.join(root, 'a.md'), 'base', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'base')
    git(root, 'checkout', '-b', 'side')
    await fs.writeFile(path.join(root, 'a.md'), 'side', 'utf8')
    git(root, 'commit', '-am', 'side')
    git(root, 'checkout', 'main')
    await fs.writeFile(path.join(root, 'a.md'), 'main', 'utf8')
    git(root, 'commit', '-am', 'main')
    try {
      git(root, 'rebase', 'side')
    } catch {
      /* stops on the conflict, which is the state under test */
    }

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.operation).toBe('rebase')
  })

  it('returns a null last commit for a repository with nothing committed', async () => {
    // Straight after `git init`, where `git log` exits non-zero. The panel
    // shows "No commits yet" rather than an error.
    const root = await makeDir('devvault-empty-')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
    await fs.writeFile(path.join(root, 'a.md'), 'a', 'utf8')

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lastCommit).toBeNull()
    expect(result.status.untracked).toEqual(['a.md'])
  })
})

describe('loadGitStatus — what it does and does not throw', () => {
  it('lets a missing vault propagate, since that is not a Git problem', async () => {
    /*
     * The one error that must escape. `layout.tsx` catches `VaultError` and
     * renders the setup screen; swallowing it here would show a Git panel for
     * a vault that does not exist.
     */
    await withVault(undefined, async () => {
      await expect(loadGitStatus()).rejects.toBeInstanceOf(VaultError)
    })
  })

  it('never leaks a repository path into a rendered message', async () => {
    // The messages reach the browser, and `coding-standards.md` forbids
    // exposing filesystem paths there.
    const root = await makeDir('devvault-leak-')

    const result = await withVault(root, loadGitStatus)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toContain(root)
    expect(result.message).not.toContain(os.tmpdir())
  })
})
