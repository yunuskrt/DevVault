import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { readGitOperation } from '@/lib/git/repo-state'

/*
 * The markers are read straight off disk, so these drive real repositories into
 * each state rather than writing the files by hand. Which marker Git leaves is
 * the entire question — a hand-written fixture would only assert that this file
 * checks the paths this file checks.
 *
 * The failure this guards against is a *false positive*: a marker that survives
 * a clean rebase would strand the panel in "Rebase paused" with no Sync to
 * clear it, and no way out that DevVault can describe.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** Never throws — the conflicted cases below exit non-zero by design. */
const tryGit = (cwd: string, ...args: string[]): void => {
  try {
    git(cwd, ...args)
  } catch {
    /* expected for the commands that stop on a conflict */
  }
}

const temp = async (label: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `devvault-${label}-`))
  temporaryDirs.push(dir)
  return dir
}

const write = async (root: string, file: string, body: string): Promise<void> => {
  await fs.writeFile(path.join(root, file), body, 'utf8')
}

/**
 * A repository whose `main` and `side` branches both changed `f.txt`, so any
 * attempt to combine them stops.
 */
const makeDivergent = async (): Promise<string> => {
  const root = await temp('repo-state')

  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Vault Tester')
  git(root, 'config', 'user.email', 'tester@example.com')

  await write(root, 'f.txt', 'base\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-m', 'base')

  git(root, 'checkout', '-b', 'side')
  await write(root, 'f.txt', 'side\n')
  git(root, 'commit', '-am', 'side')

  git(root, 'checkout', 'main')
  await write(root, 'f.txt', 'main\n')
  git(root, 'commit', '-am', 'main')

  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('readGitOperation', () => {
  it('reports nothing for a clean repository', async () => {
    const root = await makeDivergent()

    await expect(readGitOperation(root)).resolves.toBeNull()
  })

  it('reports nothing for a directory that is not a repository', async () => {
    // A seeded vault before `git init` — a supported state, and not one that is
    // suspended in anything.
    const root = await temp('not-a-repo')

    await expect(readGitOperation(root)).resolves.toBeNull()
  })

  it('detects a rebase stopped on a conflict', async () => {
    const root = await makeDivergent()

    tryGit(root, 'rebase', 'side')

    await expect(readGitOperation(root)).resolves.toBe('rebase')
  })

  it('detects a rebase stopped under the apply backend', async () => {
    /*
     * `rebase-apply/` rather than `rebase-merge/`. Git's default backend has
     * been `merge` since 2.26, so nothing else in this suite produces this
     * directory — but `git am`, `git rebase --apply` and a user with
     * `rebase.backend=apply` all still do, and checking only one of the two
     * would report a suspended vault as clean.
     */
    const root = await makeDivergent()

    tryGit(root, 'rebase', '--apply', 'side')

    await expect(readGitOperation(root)).resolves.toBe('rebase')
  })

  it('detects a merge stopped on a conflict', async () => {
    const root = await makeDivergent()

    tryGit(root, 'merge', 'side')

    await expect(readGitOperation(root)).resolves.toBe('merge')
  })

  it('detects a cherry-pick stopped on a conflict', async () => {
    // Not a state DevVault creates, but a user can from a terminal, and it is
    // just as unsafe to run a sync over.
    const root = await makeDivergent()

    tryGit(root, 'cherry-pick', 'side')

    await expect(readGitOperation(root)).resolves.toBe('cherry-pick')
  })

  it('clears after the rebase is aborted', async () => {
    const root = await makeDivergent()
    tryGit(root, 'rebase', 'side')

    git(root, 'rebase', '--abort')

    await expect(readGitOperation(root)).resolves.toBeNull()
  })

  it('clears after the rebase is completed', async () => {
    const root = await makeDivergent()
    tryGit(root, 'rebase', 'side')

    await write(root, 'f.txt', 'resolved\n')
    git(root, 'add', 'f.txt')
    tryGit(root, '-c', 'core.editor=true', 'rebase', '--continue')

    await expect(readGitOperation(root)).resolves.toBeNull()
  })

  it('reports nothing after a rebase that never stopped', async () => {
    /*
     * The false positive that matters most. `.git/REBASE_HEAD` — the marker
     * §9.7 names — is a ref rather than a statement of progress, so this is the
     * case that decides whether keying on it would have been safe.
     */
    const root = await temp('clean-rebase')
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
    await write(root, 'base.txt', 'base\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'base')

    git(root, 'checkout', '-b', 'feature')
    await write(root, 'feature.txt', 'f\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'feature')

    git(root, 'checkout', 'main')
    await write(root, 'main.txt', 'm\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'main')

    git(root, 'checkout', 'feature')
    // Different files, so this completes without stopping.
    git(root, 'rebase', 'main')

    await expect(readGitOperation(root)).resolves.toBeNull()
  })

  it('follows a .git pointer file to the real git directory', async () => {
    /*
     * In a linked worktree `.git` is a file holding `gitdir: <path>`, and the
     * markers live at the target. Without following it this returns "no
     * operation" for every worktree, forever.
     */
    const root = await makeDivergent()
    const worktree = path.join(path.dirname(root), `${path.basename(root)}-wt`)
    temporaryDirs.push(worktree)

    git(root, 'worktree', 'add', '-b', 'wt', worktree, 'main')

    const pointer = await fs.stat(path.join(worktree, '.git'))
    expect(pointer.isFile()).toBe(true)

    await expect(readGitOperation(worktree)).resolves.toBeNull()

    tryGit(worktree, 'rebase', 'side')
    await expect(readGitOperation(worktree)).resolves.toBe('rebase')
  })
})
