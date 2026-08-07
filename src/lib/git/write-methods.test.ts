import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GitError } from '@/lib/git/errors'
import { createGitService, resetGitCaches } from '@/lib/git/simple-git-service'

/*
 * The writing half of the service, against real repositories.
 *
 * These are separate from `simple-git-service.test.ts` for one reason: that
 * file's repositories are read-only, and its opening comment says so. These
 * mutate, so keeping them apart preserves that guarantee where it was made.
 *
 * As there, `git` is driven directly for setup and assertion so the code under
 * test is never also the thing arranging the fixture.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeRepo = async (options: { identity?: boolean } = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-write-'))
  temporaryDirs.push(root)

  git(root, 'init', '-b', 'main')
  if (options.identity !== false) {
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
  }

  return root
}

const write = async (root: string, file: string, body: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), body, 'utf8')
}

const porcelain = (root: string): string[] =>
  git(root, 'status', '--porcelain', '-u').trim().split('\n').filter(Boolean)

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

describe('stage', () => {
  it('stages exactly the paths it was given (§5.4)', async () => {
    // The whole point: the vault repository is the user's own and may hold
    // files DevVault did not put there. `git add -A` would sweep them into a
    // commit labelled `Add note: …`.
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')
    await write(root, 'scratch.txt', 'not ours')

    await createGitService(root).stage(['notes/a.md'])

    expect(porcelain(root)).toEqual(['A  notes/a.md', '?? scratch.txt'])
  })

  it('stages a deletion as well as a modification', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    await fs.rm(path.join(root, 'notes/a.md'))
    await createGitService(root).stage(['notes/a.md'])

    expect(porcelain(root)).toEqual(['D  notes/a.md'])
  })

  it('does nothing when handed no paths', async () => {
    // An empty array must not become a bare `git add`, which would stage the
    // whole working tree.
    const root = await makeRepo()
    await write(root, 'scratch.txt', 'not ours')

    await createGitService(root).stage([])

    expect(porcelain(root)).toEqual(['?? scratch.txt'])
  })
})

describe('commit', () => {
  it('commits staged changes and returns the hash', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')

    const service = createGitService(root)
    await service.stage(['notes/a.md'])
    const { hash } = await service.commit('Add note: A')

    expect(hash).toMatch(/^[0-9a-f]{7,40}$/)
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe('Add note: A')
    expect(porcelain(root)).toEqual([])
  })

  it('reports an empty commit rather than resolving silently', async () => {
    // simple-git *resolves* when nothing was staged, so this has to be caught
    // from the summary. A silent success would tell the user their work was
    // committed when it was not.
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    const error = await createGitService(root)
      .commit('nothing staged')
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('NOTHING_TO_COMMIT')
    expect(git(root, 'log', '--oneline').trim().split('\n')).toHaveLength(1)
  })

  it('surfaces an unset identity as IDENTITY_UNSET and writes nothing', async () => {
    // Verification item 7: a useful message, and a working tree left untouched.
    const root = await makeRepo({ identity: false })
    // Simply omitting the local identity is not enough — a developer machine's
    // *global* config would satisfy Git, and so would `useConfigOnly`, which
    // only disables auto-detection. Setting the local values empty is what
    // actually reproduces the state a new user is in.
    git(root, 'config', 'user.email', '')
    git(root, 'config', 'user.name', '')
    await write(root, 'notes/a.md', 'a')

    const service = createGitService(root)
    await service.stage(['notes/a.md'])
    const error = await service.commit('Add note: A').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('IDENTITY_UNSET')
    expect((error as GitError).message).toContain('git config --global user.email')
    // Still staged, still on disk — nothing was lost.
    expect(porcelain(root)).toEqual(['A  notes/a.md'])
  })
})

describe('remove', () => {
  it('drops the file from disk and the index in one step (§5.4)', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    await createGitService(root).remove(['notes/a.md'])

    expect(await fs.access(path.join(root, 'notes/a.md')).catch(() => 'gone')).toBe(
      'gone',
    )
    expect(porcelain(root)).toEqual(['D  notes/a.md'])
  })

  it('reports UNTRACKED_PATH for a file Git never saw', async () => {
    // The routine case for an item created and deleted without an intervening
    // commit. The caller falls back to a filesystem delete, so this must be
    // distinguishable from a real failure rather than collapsing to GIT_FAILED.
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')

    const error = await createGitService(root)
      .remove(['notes/a.md'])
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('UNTRACKED_PATH')
  })
})

describe('move', () => {
  it('records a rename so history follows the file (§3.2)', async () => {
    const root = await makeRepo()
    await write(root, 'notes/docker-networking.md', 'body')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    await createGitService(root).move(
      'notes/docker-networking.md',
      'notes/docker-dns.md',
    )

    expect(porcelain(root)).toEqual([
      'R  notes/docker-networking.md -> notes/docker-dns.md',
    ])

    git(root, 'commit', '-m', 'Update note: Docker DNS')

    // The payoff: the item's history survives the title edit.
    const history = git(
      root,
      'log',
      '--follow',
      '--format=%s',
      '--',
      'notes/docker-dns.md',
    )
      .trim()
      .split('\n')

    expect(history).toEqual(['Update note: Docker DNS', 'first'])
  })

  it('reports UNTRACKED_PATH for an untracked source', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')

    const error = await createGitService(root)
      .move('notes/a.md', 'notes/b.md')
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('UNTRACKED_PATH')
  })

  it('surfaces the rename through GitStatus.renamed, and nowhere else', async () => {
    /*
     * The seam this whole field exists for, tested against the engine rather
     * than a literal.
     *
     * `git-panel.test.ts` covers the *counting* of renames, but only over a
     * hand-written `GitStatus` — so it would pass even if the service never
     * populated `renamed` at all. That is exactly the bug that shipped: the
     * engine parses `R from -> to` into its own array and into none of
     * `staged`, `created` or `deleted`, so a vault whose only pending change
     * was a renamed item read as dirty with every array empty.
     */
    const root = await makeRepo()
    await write(root, 'notes/docker-networking.md', 'body')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    const service = createGitService(root)
    await service.move('notes/docker-networking.md', 'notes/docker-dns.md')

    const status = await service.status()

    expect(status.renamed).toEqual([
      { from: 'notes/docker-networking.md', to: 'notes/docker-dns.md' },
    ])
    // The point: it is in none of the others, so anything summing only those
    // sees an empty vault.
    expect(status.staged).toEqual([])
    expect(status.created).toEqual([])
    expect(status.deleted).toEqual([])
    expect(status.modified).toEqual([])
    expect(status.untracked).toEqual([])
    // …while the repository is emphatically not clean.
    expect(status.isClean).toBe(false)
  })
})

describe('discard', () => {
  it('throws away uncommitted edits to the named paths', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'original')
    await write(root, 'notes/b.md', 'original')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    await write(root, 'notes/a.md', 'edited')
    await write(root, 'notes/b.md', 'edited')

    await createGitService(root).discard(['notes/a.md'])

    expect(await fs.readFile(path.join(root, 'notes/a.md'), 'utf8')).toBe(
      'original',
    )
    // Scoped: the path it was not given is untouched.
    expect(await fs.readFile(path.join(root, 'notes/b.md'), 'utf8')).toBe(
      'edited',
    )
  })
})

describe('fileAtRevision', () => {
  it('reads a file as it was at a commit', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'first version')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')
    const first = git(root, 'rev-parse', 'HEAD').trim()

    await write(root, 'notes/a.md', 'second version')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'second')

    const service = createGitService(root)

    expect(await service.fileAtRevision('notes/a.md', first)).toContain(
      'first version',
    )
    expect(await service.fileAtRevision('notes/a.md', 'HEAD')).toContain(
      'second version',
    )
  })
})

describe('the write queue, end to end', () => {
  it('two concurrent mutations both succeed (verification item 5)', async () => {
    /*
     * Without the queue these collide on `.git/index.lock` and one fails —
     * intermittently, which is what makes it worth an explicit test rather
     * than trusting the unit test of the queue in isolation.
     */
    const root = await makeRepo()
    const service = createGitService(root)

    await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        await write(root, `notes/item-${index}.md`, `body ${index}`)
        await service.stage([`notes/item-${index}.md`])
      }),
    )

    const staged = porcelain(root)
    expect(staged).toHaveLength(8)
    expect(staged.every((line) => line.startsWith('A  notes/item-'))).toBe(true)

    // And a commit racing further stages still produces one coherent commit.
    const [commit] = await Promise.all([
      service.commit('Update vault: 8 files'),
      service.stage([]),
    ])

    expect(commit.hash).toMatch(/^[0-9a-f]{7,40}$/)
    expect(porcelain(root)).toEqual([])
  })

  it('fails fast on a foreign index.lock rather than hanging', async () => {
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')
    // Simulates another Git process holding the lock right now.
    await fs.writeFile(path.join(root, '.git', 'index.lock'), '', 'utf8')

    const error = await createGitService(root)
      .stage(['notes/a.md'])
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('INDEX_LOCKED')
  })

  it('tells the user how to clear a stale lock (§5.9)', async () => {
    /*
     * This is what the precheck in `queue.ts` buys that Git does not: Git's own
     * "Unable to create index.lock" classifies to `INDEX_LOCKED` either way, so
     * the test above passes with or without it. A lock left by a *crashed*
     * process never clears on its own, and "try again in a moment" is useless
     * advice for it — only the precheck can tell the two apart, by age.
     */
    const root = await makeRepo()
    await write(root, 'notes/a.md', 'a')

    const lock = path.join(root, '.git', 'index.lock')
    await fs.writeFile(lock, '', 'utf8')
    const old = new Date(Date.now() - 120_000)
    await fs.utimes(lock, old, old)

    const error = await createGitService(root)
      .stage(['notes/a.md'])
      .catch((e: unknown) => e)

    expect((error as GitError).code).toBe('INDEX_LOCKED')
    expect((error as GitError).message).toContain('delete `.git/index.lock`')
  })
})
