import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GitError } from '@/lib/git/errors'
import { readGitOperation } from '@/lib/git/repo-state'
import { createGitService, resetGitCaches } from '@/lib/git/simple-git-service'

/*
 * Conflict resolution against real repositories, never a mocked engine.
 *
 * Everything interesting here is behaviour Git owns — which numbered stage
 * holds which side, what a stopped rebase leaves on disk, what `--abort`
 * restores. A double would assert only that this file calls the functions this
 * file calls, and the one bug that matters (resolving to the wrong side) is
 * precisely the one a double cannot catch.
 *
 * **Every resolution assertion reads the file back off disk.** The spec is
 * explicit: verify by reading the file, not by trusting the label. A test that
 * asserted `resolve` was called with `'mine'` would pass with the mapping
 * inverted, which is the failure mode the whole spec is written around.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const identify = (root: string): void => {
  git(root, 'config', 'user.name', 'Vault Tester')
  git(root, 'config', 'user.email', 'tester@example.com')
}

const temp = async (label: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `devvault-${label}-`))
  temporaryDirs.push(dir)
  return dir
}

const write = async (root: string, file: string, body: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), body, 'utf8')
}

const read = (root: string, file: string): Promise<string> =>
  fs.readFile(path.join(root, file), 'utf8')

const NOTE = 'notes/shared.md'

/** Content distinctive enough that a mixed-up side is unmistakable. */
const MINE = 'THIS-COMPUTER\n'
const THEIRS = 'OTHER-COMPUTER\n'

type World = { local: string; remote: string; other: string }

const makeWorld = async (): Promise<World> => {
  const base = await temp('conflicts')
  const local = path.join(base, 'vault')
  const remote = path.join(base, 'remote.git')
  const other = path.join(base, 'other')

  await fs.mkdir(local, { recursive: true })
  git(base, 'init', '--bare', '-b', 'main', remote)

  git(local, 'init', '-b', 'main')
  identify(local)
  await write(local, NOTE, 'base\n')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'first')
  git(local, 'remote', 'add', 'origin', remote)
  git(local, 'push', '-u', 'origin', 'main')

  git(base, 'clone', remote, other)
  identify(other)

  return { local, remote, other }
}

/** The other computer commits and pushes a change to the same file. */
const pushFromOther = async (world: World, body: string): Promise<void> => {
  await write(world.other, NOTE, body)
  git(world.other, 'add', '-A')
  git(world.other, 'commit', '-m', 'other computer edit')
  git(world.other, 'push')
}

/**
 * Diverged histories on the same file, then a sync — which takes the
 * `pull --rebase` path and stops on a conflict. This is the fixture the spec's
 * verification item 3 describes.
 */
const makeRebaseConflict = async (): Promise<World> => {
  const world = await makeWorld()

  await pushFromOther(world, THEIRS)
  await write(world.local, NOTE, MINE)
  git(world.local, 'commit', '-am', 'this computer edit')

  const outcome = await createGitService(world.local).sync()
  expect(outcome.kind).toBe('conflict')
  expect(await readGitOperation(world.local)).toBe('rebase')

  return world
}

/** A plain `git merge`, which DevVault never runs but a user can. */
const makeMergeConflict = async (): Promise<World> => {
  const world = await makeWorld()

  git(world.local, 'checkout', '-b', 'side')
  await write(world.local, NOTE, THEIRS)
  git(world.local, 'commit', '-am', 'side edit')
  git(world.local, 'checkout', 'main')
  await write(world.local, NOTE, MINE)
  git(world.local, 'commit', '-am', 'main edit')

  try {
    git(world.local, 'merge', 'side')
  } catch {
    // Expected: the merge stops on the conflict.
  }

  expect(await readGitOperation(world.local)).toBe('merge')
  return world
}

/**
 * A fast-forward whose autostash restore fails.
 *
 * Spec 6 found that Git prints "Applying autostash resulted in conflicts" and
 * **exits 0** here. It leaves conflicts with *no operation marker at all*,
 * which is the case that makes "invert during a rebase" the wrong rule.
 */
const makeAutostashConflict = async (): Promise<World> => {
  const world = await makeWorld()

  await pushFromOther(world, THEIRS)
  await write(world.local, NOTE, MINE) // uncommitted — gets autostashed

  const outcome = await createGitService(world.local).sync()
  expect(outcome.kind).toBe('conflict')
  expect(await readGitOperation(world.local)).toBeNull()

  return world
}

beforeEach(() => {
  resetGitCaches()
})

afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('resolve — the side that is kept is the side the user asked for', () => {
  /*
   * The three fixtures below cover the three *distinct* stage layouts DevVault
   * can produce. They are separate tests rather than a table because each one
   * is a different claim about Git, and a failure should name which.
   */

  it('keeps this computer’s version during a rebase (verification 3)', async () => {
    // THE check the spec says the whole thing turns on. Mid-rebase Git's own
    // `--ours` is the *other* computer, so an implementation that passed the
    // flag straight through would delete this file's content instead.
    const world = await makeRebaseConflict()

    await createGitService(world.local).resolve(NOTE, 'mine')

    expect(await read(world.local, NOTE)).toBe(MINE)
  })

  it('keeps the other computer’s version during a rebase', async () => {
    const world = await makeRebaseConflict()

    await createGitService(world.local).resolve(NOTE, 'theirs')

    expect(await read(world.local, NOTE)).toBe(THEIRS)
  })

  it('keeps this computer’s version during a merge', async () => {
    const world = await makeMergeConflict()

    await createGitService(world.local).resolve(NOTE, 'mine')

    expect(await read(world.local, NOTE)).toBe(MINE)
  })

  it('keeps the other computer’s version during a merge', async () => {
    const world = await makeMergeConflict()

    await createGitService(world.local).resolve(NOTE, 'theirs')

    expect(await read(world.local, NOTE)).toBe(THEIRS)
  })

  it('keeps the uncommitted edit when an autostash restore conflicted', async () => {
    // No operation marker here, yet the stages are laid out like a rebase. A
    // rule keyed on the marker alone throws the user's uncommitted work away.
    const world = await makeAutostashConflict()

    await createGitService(world.local).resolve(NOTE, 'mine')

    expect(await read(world.local, NOTE)).toBe(MINE)
  })

  it('keeps the pulled version when an autostash restore conflicted', async () => {
    const world = await makeAutostashConflict()

    await createGitService(world.local).resolve(NOTE, 'theirs')

    expect(await read(world.local, NOTE)).toBe(THEIRS)
  })

  it('stages the file, so it stops counting as conflicted', async () => {
    const world = await makeRebaseConflict()
    const service = createGitService(world.local)

    await service.resolve(NOTE, 'mine')

    // `checkout --ours` alone leaves the path unmerged; without the `git add`
    // the footer would never enable and `rebase --continue` would refuse.
    expect((await service.status()).conflicted).toEqual([])
  })
})

describe('conflictedPaths', () => {
  it('lists each unmerged path exactly once', async () => {
    // `ls-files --unmerged` prints one line per *stage*, so a single conflicted
    // file appears three times in the raw output.
    const world = await makeRebaseConflict()

    expect(await createGitService(world.local).conflictedPaths()).toEqual([NOTE])
  })

  it('is empty on a clean repository', async () => {
    const world = await makeWorld()

    expect(await createGitService(world.local).conflictedPaths()).toEqual([])
  })

  it('agrees with status().conflicted', async () => {
    // Two different Git commands answering the same question. They must not
    // drift, because the panel reads one and the write guard reads the other.
    const world = await makeRebaseConflict()
    const service = createGitService(world.local)

    expect(await service.conflictedPaths()).toEqual(
      (await service.status()).conflicted,
    )
  })

  it('does not write the index, and so never takes the lock', async () => {
    /*
     * The property the write guard depends on, asserted through the one
     * observable that settles it: whether Git rewrites `.git/index`.
     *
     * `git status` opportunistically refreshes a stale index and writes it
     * back, which means taking `.git/index.lock`. This read runs *outside* the
     * write queue, so doing that would let it collide with a queued command's
     * `assertIndexUnlocked` precheck — the collisions spec 5's queue exists to
     * eliminate.
     *
     * Measured rather than argued, because the collision itself is a race and
     * shows up only intermittently under concurrency: `status()` advanced the
     * index mtime on every run, `ls-files --unmerged` never did. The `status()`
     * half is asserted too, so this test proves the distinction exists rather
     * than merely that one side is quiet.
     */
    const world = await makeWorld()
    const index = path.join(world.local, '.git', 'index')
    const service = createGitService(world.local)

    const mtime = async (): Promise<number> => (await fs.stat(index)).mtimeMs

    // Touch every tracked file so the index is stale and Git wants to refresh.
    const stale = async (): Promise<void> => {
      const now = new Date()
      await fs.utimes(path.join(world.local, NOTE), now, now)
      await new Promise((resolve) => setTimeout(resolve, 1_100))
    }

    await stale()
    const before = await mtime()
    await service.conflictedPaths()
    expect(await mtime()).toBe(before)

    await stale()
    await service.status()
    expect(await mtime()).not.toBe(before)
  }, 15_000)
})

describe('readConflictSides', () => {
  it('labels both sides by meaning during a rebase', async () => {
    const world = await makeRebaseConflict()

    const sides = await createGitService(world.local).readConflictSides(NOTE)

    expect(sides.mine).toBe(MINE)
    expect(sides.theirs).toBe(THEIRS)
  })

  it('labels both sides by meaning during a merge', async () => {
    const world = await makeMergeConflict()

    const sides = await createGitService(world.local).readConflictSides(NOTE)

    expect(sides.mine).toBe(MINE)
    expect(sides.theirs).toBe(THEIRS)
  })

  it('returns empty strings for a path with no conflict stages', async () => {
    // A file that merged cleanly has no stage 2 or 3 at all. Reading it must
    // not throw — `loadVaultAlerts` asks about titles opportunistically.
    const world = await makeRebaseConflict()

    const sides = await createGitService(world.local).readConflictSides(
      'notes/absent.md',
    )

    expect(sides).toEqual({ mine: '', theirs: '' })
  })
})

describe('continueOperation', () => {
  it('refuses while anything is still conflicted', async () => {
    const world = await makeRebaseConflict()

    await expect(
      createGitService(world.local).continueOperation(),
    ).rejects.toThrow(/still in conflict/)
  })

  it('finishes a rebase once everything is resolved', async () => {
    const world = await makeRebaseConflict()
    const service = createGitService(world.local)

    await service.resolve(NOTE, 'mine')
    const outcome = await service.continueOperation()

    expect(outcome).toEqual({ kind: 'continued', operation: 'rebase' })
    // The rebase is over: no marker, back on a real branch, content kept.
    expect(await readGitOperation(world.local)).toBeNull()
    expect(git(world.local, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(
      'main',
    )
    expect(await read(world.local, NOTE)).toBe(MINE)
  })

  it('finishes a merge with a commit rather than a --continue', async () => {
    const world = await makeMergeConflict()
    const service = createGitService(world.local)

    await service.resolve(NOTE, 'mine')
    const outcome = await service.continueOperation()

    expect(outcome).toEqual({ kind: 'continued', operation: 'merge' })
    expect(await readGitOperation(world.local)).toBeNull()
    // A merge commit has two parents; that is what proves it concluded the
    // merge rather than committing on top of it.
    expect(
      git(world.local, 'rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' '),
    ).toHaveLength(3)
  })

  it('reports nothing-to-continue after an autostash restore', async () => {
    // Not a failure: there is no operation, only staged files for the ordinary
    // Commit button. Mapping this to an error would tell the user something
    // broke when nothing did.
    const world = await makeAutostashConflict()
    const service = createGitService(world.local)

    await service.resolve(NOTE, 'mine')

    expect(await service.continueOperation()).toEqual({
      kind: 'nothing-to-continue',
    })
  })
})

describe('abortOperation', () => {
  it('returns the vault to its pre-sync state with local commits intact (verification 5)', async () => {
    const world = await makeWorld()

    await pushFromOther(world, THEIRS)
    await write(world.local, NOTE, MINE)
    git(world.local, 'commit', '-am', 'this computer edit')

    const before = git(world.local, 'rev-parse', 'HEAD').trim()
    const messageBefore = git(world.local, 'log', '-1', '--format=%s').trim()

    await createGitService(world.local).sync()
    const aborted = await createGitService(world.local).abortOperation()

    expect(aborted).toBe('rebase')
    // Exactly where it started: same commit, same content, nothing suspended.
    expect(git(world.local, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(git(world.local, 'log', '-1', '--format=%s').trim()).toBe(messageBefore)
    expect(await read(world.local, NOTE)).toBe(MINE)
    expect(await readGitOperation(world.local)).toBeNull()
  })

  it('aborts a merge too', async () => {
    const world = await makeMergeConflict()

    expect(await createGitService(world.local).abortOperation()).toBe('merge')
    expect(await readGitOperation(world.local)).toBeNull()
    expect(await read(world.local, NOTE)).toBe(MINE)
  })

  it('returns null when nothing is in progress', async () => {
    // The autostash case, where there is no safe abort — the only thing to
    // undo would be the user's own uncommitted edits. Reporting honestly is
    // the point; inventing an abort here would destroy work.
    const world = await makeAutostashConflict()

    expect(await createGitService(world.local).abortOperation()).toBeNull()
  })

  it('does not throw on a clean repository', async () => {
    const world = await makeWorld()

    expect(await createGitService(world.local).abortOperation()).toBeNull()
  })
})

describe('the spawn environment', () => {
  it('sets GIT_EDITOR itself rather than inheriting one', async () => {
    /*
     * `rebase --continue` opens an editor for the commit message, and a
     * Next.js server has no terminal. Measured, not assumed — without an
     * editor Git exits 1 with:
     *
     *   error: Terminal is dumb, but EDITOR unset
     *   error: could not commit staged changes.
     *
     * The environment is cleared *before* the module is re-imported, because
     * the assignment is at module scope. Without that, this test would pass on
     * any developer machine that happens to export `GIT_EDITOR` — which is
     * exactly how it first went vacuous: the "finishes a rebase" test above
     * survived deleting the assignment entirely, because this shell already
     * had `GIT_EDITOR=true` set.
     */
    const original = process.env.GIT_EDITOR
    delete process.env.GIT_EDITOR
    vi.resetModules()

    try {
      await import('@/lib/git/simple-git-service')
      expect(process.env.GIT_EDITOR).toBe('true')
    } finally {
      if (original === undefined) delete process.env.GIT_EDITOR
      else process.env.GIT_EDITOR = original
      vi.resetModules()
    }
  })

  it('sets GIT_TERMINAL_PROMPT so a credential prompt cannot hang a request', async () => {
    const original = process.env.GIT_TERMINAL_PROMPT
    delete process.env.GIT_TERMINAL_PROMPT
    vi.resetModules()

    try {
      await import('@/lib/git/simple-git-service')
      expect(process.env.GIT_TERMINAL_PROMPT).toBe('0')
    } finally {
      if (original === undefined) delete process.env.GIT_TERMINAL_PROMPT
      else process.env.GIT_TERMINAL_PROMPT = original
      vi.resetModules()
    }
  })
})

describe('safety', () => {
  it('classifies a resolve on a non-repository rather than leaking stderr', async () => {
    const bare = await temp('not-a-repo')

    await expect(
      createGitService(bare).resolve('notes/a.md', 'mine'),
    ).rejects.toThrow(GitError)
  })
})
