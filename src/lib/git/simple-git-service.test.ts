import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkRepository,
  createGitService,
  isGitInstalled,
  resetGitCaches,
} from '@/lib/git/simple-git-service'

/*
 * These run against real repositories in a temp directory rather than a mocked
 * engine. The point of this spec is the subprocess plumbing — the environment
 * it spawns with, how `simple-git`'s output maps onto `GitStatus`, which
 * failures are normal — and none of that is exercised by a double.
 *
 * The service is read-only, so nothing here can damage anything: `status` and
 * `log` only observe. The setup below uses `git` directly so the code under
 * test is never also the thing arranging the fixture.
 */

const temporaryDirs: string[] = []

/*
 * `stdio` is pinned because `execFileSync` inherits the parent's stderr by
 * default, and Git narrates ordinary success there ("Switched to a new
 * branch") — which would print over the test output. Piping keeps it captured
 * and still attached to the thrown error when a setup command genuinely fails.
 */
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeRepo = async (options: { identity?: boolean } = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-git-'))
  temporaryDirs.push(root)

  git(root, 'init', '-b', 'main')
  // Local config only, so a machine's global identity never affects a result.
  if (options.identity !== false) {
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
  }

  return root
}

const write = async (root: string, file: string, body: string): Promise<void> => {
  await fs.writeFile(path.join(root, file), body, 'utf8')
}

const commitAll = (root: string, message: string): void => {
  git(root, 'add', '-A')
  git(root, 'commit', '-m', message)
}

beforeEach(() => {
  // `isGitInstalled` caches for the process; without this the first result
  // would decide every later case.
  resetGitCaches()
})

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('isGitInstalled', () => {
  it('finds the git binary', async () => {
    const root = await makeRepo()

    expect(await isGitInstalled(root)).toBe(true)
  })

  it('still finds it when the environment carries GIT_EDITOR', async () => {
    /*
     * A regression guard with a real bug behind it. `simple-git` refuses to
     * spawn when handed an explicit environment containing any of GIT_EDITOR,
     * GIT_SSH_COMMAND, GIT_ASKPASS, GIT_PAGER or GIT_CONFIG_*, so the obvious
     * `.env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })` fails with "Use of
     * GIT_EDITOR is not permitted" on any machine where the user exports one —
     * and the panel then reports "Git missing" with Git installed and working.
     *
     * The service sets the variable on its own process and passes no explicit
     * environment instead, which is also what keeps SSH keys and credential
     * helpers working (§2.2).
     */
    const root = await makeRepo()
    const previous = process.env.GIT_EDITOR
    process.env.GIT_EDITOR = 'true'

    try {
      expect(await isGitInstalled(root)).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.GIT_EDITOR
      else process.env.GIT_EDITOR = previous
    }
  })

  it('sets GIT_TERMINAL_PROMPT so a remote cannot block on a hidden prompt', async () => {
    // §5.9. The subprocess inherits our environment, so the flag has to be on
    // it by the time the module has loaded.
    await makeRepo()

    expect(process.env.GIT_TERMINAL_PROMPT).toBe('0')
  })
})

describe('checkRepository', () => {
  it('reports a plain directory as not a repository', async () => {
    // The normal state of a seeded vault: spec 1's seed script does not init.
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-plain-'))
    temporaryDirs.push(root)

    expect(await checkRepository(root)).toEqual({
      isRepo: false,
      hasIdentity: false,
    })
  })

  it('reports a configured repository as ready', async () => {
    expect(await checkRepository(await makeRepo())).toEqual({
      isRepo: true,
      hasIdentity: true,
    })
  })

  it('reports a repository whose identity is blank as lacking one', async () => {
    // An empty value is what a user ends up with more often than a truly unset
    // key, and `git commit` rejects both.
    const root = await makeRepo()
    git(root, 'config', 'user.email', '')

    expect(await checkRepository(root)).toEqual({
      isRepo: true,
      hasIdentity: false,
    })
  })
})

describe('status', () => {
  it('maps a fresh repository: branch, no upstream, every file untracked', async () => {
    const root = await makeRepo()
    await write(root, 'a.md', 'a')
    await write(root, 'b.md', 'b')

    const status = await createGitService(root).status()

    expect(status.branch).toBe('main')
    expect(status.tracking).toBeNull()
    expect(status.isClean).toBe(false)
    // The field §4.3 does not have. Without it this state counts zero files.
    expect(status.untracked.sort()).toEqual(['a.md', 'b.md'])
    expect(status.staged).toEqual([])
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
  })

  it('maps a committed repository as clean', async () => {
    const root = await makeRepo()
    await write(root, 'a.md', 'a')
    commitAll(root, 'first')

    const status = await createGitService(root).status()

    expect(status.isClean).toBe(true)
    expect(status.untracked).toEqual([])
    expect(status.modified).toEqual([])
  })

  it('separates staged, modified and untracked work', async () => {
    const root = await makeRepo()
    await write(root, 'tracked.md', 'one')
    commitAll(root, 'first')

    await write(root, 'staged.md', 'new')
    git(root, 'add', 'staged.md')
    await write(root, 'tracked.md', 'two')
    await write(root, 'loose.md', 'new')

    const status = await createGitService(root).status()

    expect(status.staged).toContain('staged.md')
    expect(status.modified).toContain('tracked.md')
    expect(status.untracked).toContain('loose.md')
    expect(status.isClean).toBe(false)
  })

  it('counts ahead and behind against a real upstream', async () => {
    /*
     * The three numbers driving the panel's ahead / behind / diverged states.
     * A bare repository stands in for the remote — no network, but a genuine
     * upstream with genuine ref counting.
     */
    const remote = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-remote-'))
    temporaryDirs.push(remote)
    execFileSync('git', ['init', '--bare', '-b', 'main', remote], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const root = await makeRepo()
    await write(root, 'a.md', 'a')
    commitAll(root, 'first')
    git(root, 'remote', 'add', 'origin', remote)
    git(root, 'push', '-u', 'origin', 'main')

    const service = createGitService(root)
    const synced = await service.status()
    expect(synced.tracking).toBe('origin/main')
    expect([synced.ahead, synced.behind]).toEqual([0, 0])

    await write(root, 'b.md', 'b')
    commitAll(root, 'second')

    const ahead = await service.status()
    expect([ahead.ahead, ahead.behind]).toEqual([1, 0])
  })

  it('reports conflicted paths during a merge', async () => {
    const root = await makeRepo()
    await write(root, 'a.md', 'base\n')
    commitAll(root, 'base')

    git(root, 'checkout', '-b', 'other')
    await write(root, 'a.md', 'other side\n')
    commitAll(root, 'other')

    git(root, 'checkout', 'main')
    await write(root, 'a.md', 'main side\n')
    commitAll(root, 'main')

    // Expected to exit non-zero: that is what a conflict is.
    try {
      git(root, 'merge', 'other')
    } catch {
      /* the conflict is the fixture */
    }

    const status = await createGitService(root).status()

    expect(status.conflicted).toEqual(['a.md'])
    expect(status.isClean).toBe(false)
  })
})

describe('log', () => {
  it('returns an empty list for a repository with no commits', async () => {
    /*
     * `git log` exits non-zero here, and this is a state the panel renders
     * rather than an error — straight after `git init`. Treating it as a
     * failure would put "Git error" in the footer of a brand new vault.
     */
    const root = await makeRepo()
    await write(root, 'a.md', 'a')

    expect(await createGitService(root).log()).toEqual([])
  })

  it('returns commits newest first, in the shape the panel needs', async () => {
    const root = await makeRepo()
    await write(root, 'a.md', 'a')
    commitAll(root, 'first')
    await write(root, 'a.md', 'aa')
    commitAll(root, 'second')

    const commits = await createGitService(root).log()

    expect(commits.map((c) => c.message)).toEqual(['second', 'first'])
    expect(commits[0].author).toBe('Vault Tester')
    expect(commits[0].hash).toMatch(/^[0-9a-f]{40}$/)
    /*
     * The reason `log` overrides the engine's default format. `formatRelativeTime`
     * calls `new Date()` on this, and simple-git's default date format is not
     * ISO — an unparseable value would render "just now" forever.
     */
    expect(commits[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(Date.parse(commits[0].date))).toBe(false)
  })

  it('honours the limit, which is how the panel asks for just the last one', async () => {
    const root = await makeRepo()
    for (const message of ['first', 'second', 'third']) {
      await write(root, 'a.md', message)
      commitAll(root, message)
    }

    const commits = await createGitService(root).log({ limit: 1 })

    expect(commits).toHaveLength(1)
    expect(commits[0].message).toBe('third')
  })

  it('follows a path across a rename', async () => {
    /*
     * §3.2 lets an item's path change when its title does, so its history has
     * to survive the rename. simple-git adds `--follow` itself whenever `file`
     * is set; without a path it must not, since `--follow` needs one.
     */
    const root = await makeRepo()
    await write(root, 'old.md', 'a')
    commitAll(root, 'create')
    git(root, 'mv', 'old.md', 'new.md')
    commitAll(root, 'rename')
    // An unrelated commit, so this asserts more than "every commit in the
    // repo". Without the path filter the answer would include it; with the
    // path but no `--follow` it would stop at the rename.
    await write(root, 'unrelated.md', 'x')
    commitAll(root, 'unrelated')

    const commits = await createGitService(root).log({ path: 'new.md' })

    expect(commits.map((c) => c.message)).toEqual(['rename', 'create'])
  })

  it('reports only the commits touching the given path', async () => {
    const root = await makeRepo()
    await write(root, 'a.md', 'a')
    commitAll(root, 'touches a')
    await write(root, 'b.md', 'b')
    commitAll(root, 'touches b')

    const commits = await createGitService(root).log({ path: 'a.md' })

    expect(commits.map((c) => c.message)).toEqual(['touches a'])
  })
})

describe('unimplemented operations', () => {
  it('throws rather than silently doing nothing', async () => {
    /*
     * Specs 6 and 7 fill these in. A no-op would be the dangerous shape: a
     * caller would believe it had synced. `stage`, `commit`, `discard` and
     * `fileAtRevision` landed in spec 5 and are covered by their own tests.
     */
    const service = createGitService(await makeRepo())

    expect(() => service.sync()).toThrow(/not available yet/)
    expect(() => service.resolve('a.md', 'ours')).toThrow(/not available yet/)
  })
})
