import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GitError } from '@/lib/git/errors'
import { readGitOperation } from '@/lib/git/repo-state'
import { createGitService, resetGitCaches } from '@/lib/git/simple-git-service'

/*
 * `sync` against real repositories with a real bare remote, because every
 * interesting thing about this feature is behaviour Git owns: whether a
 * fast-forward can conflict, what `--autostash` restores, what a stopped rebase
 * leaves on disk, what `push -u` does to a branch with no upstream. A test
 * double would assert only that this file calls the functions this file calls.
 *
 * The fixture is the spec's verification setup in miniature: a bare repo as
 * `origin`, and a second clone standing in for the other computer.
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

type World = {
  /** The vault DevVault is pointed at. */
  local: string
  /** The bare repository standing in for GitHub. */
  remote: string
  /** A second clone — the "other computer". */
  other: string
}

const temp = async (label: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `devvault-${label}-`))
  temporaryDirs.push(dir)
  return dir
}

/**
 * A local vault with one commit, pushed to a bare remote, plus a second clone.
 *
 * `--bare` rather than a second working tree: pushing to a non-bare repository's
 * checked-out branch is refused by Git, and working around that would make the
 * fixture less like a real remote rather than more.
 */
const makeWorld = async (): Promise<World> => {
  const base = await temp('sync')
  const local = path.join(base, 'vault')
  const remote = path.join(base, 'remote.git')
  const other = path.join(base, 'other')

  await fs.mkdir(local, { recursive: true })
  git(base, 'init', '--bare', '-b', 'main', remote)

  git(local, 'init', '-b', 'main')
  identify(local)
  await fs.mkdir(path.join(local, 'notes'), { recursive: true })
  await fs.writeFile(path.join(local, 'notes/a.md'), 'one\n', 'utf8')
  git(local, 'add', '-A')
  git(local, 'commit', '-m', 'first')
  git(local, 'remote', 'add', 'origin', remote)
  git(local, 'push', '-u', 'origin', 'main')

  git(base, 'clone', remote, other)
  identify(other)

  return { local, remote, other }
}

/** Commits a change in a clone and pushes it — the "other computer" acting. */
const pushFrom = async (
  root: string,
  file: string,
  body: string,
  message: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), body, 'utf8')
  git(root, 'add', '-A')
  git(root, 'commit', '-m', message)
  git(root, 'push')
}

const commitLocally = async (
  root: string,
  file: string,
  body: string,
  message: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
  await fs.writeFile(path.join(root, file), body, 'utf8')
  git(root, 'add', '-A')
  git(root, 'commit', '-m', message)
}

const read = (root: string, file: string): Promise<string> =>
  fs.readFile(path.join(root, file), 'utf8')

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

describe('sync — the §5.6 decision table', () => {
  it('reports up-to-date without creating a commit (verification 1)', async () => {
    const { local } = await makeWorld()
    const before = git(local, 'rev-parse', 'HEAD').trim()

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'up-to-date' })
    // The failure this guards against is a sync that "helpfully" commits or
    // merges when there was nothing to do.
    expect(git(local, 'rev-parse', 'HEAD').trim()).toBe(before)
  })

  it('fast-forwards when behind, and brings the file with it (verification 2)', async () => {
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/b.md', 'from the other machine\n', 'add b')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'pulled', commits: 1 })
    await expect(read(local, 'notes/b.md')).resolves.toBe(
      'from the other machine\n',
    )
  })

  it('takes the ff-only path, never a merge commit', async () => {
    /*
     * The point of isolating this case is that it *cannot* conflict. A merge
     * commit appearing here would mean the branch went through a path that can,
     * so the reliability argument for the whole feature would be false.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/b.md', 'b\n', 'add b')
    await pushFrom(other, 'notes/c.md', 'c\n', 'add c')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'pulled', commits: 2 })
    expect(git(local, 'log', '--merges', '--oneline').trim()).toBe('')
  })

  it('pushes when ahead, and the other clone can see it (verification 3)', async () => {
    const { local, other } = await makeWorld()
    await commitLocally(local, 'notes/local.md', 'mine\n', 'add local')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'pushed', commits: 1 })

    git(other, 'pull')
    await expect(read(other, 'notes/local.md')).resolves.toBe('mine\n')
  })

  it('rebases a clean divergence into linear history (verification 4)', async () => {
    const { local, other } = await makeWorld()
    // Different files, so the rebase has nothing to conflict over. The counts
    // are deliberately asymmetric — at 1 and 1 the two fields of `synced` are
    // indistinguishable, and swapping them would pass.
    await pushFrom(other, 'notes/theirs.md', 'theirs\n', 'add theirs')
    await pushFrom(other, 'notes/theirs2.md', 'theirs again\n', 'add theirs 2')
    await commitLocally(local, 'notes/mine.md', 'mine\n', 'add mine')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'synced', pulled: 2, pushed: 1 })

    // Both changes present…
    await expect(read(local, 'notes/theirs.md')).resolves.toBe('theirs\n')
    await expect(read(local, 'notes/mine.md')).resolves.toBe('mine\n')
    // …and no merge commit: `git log --graph` stays a straight line.
    expect(git(local, 'log', '--merges', '--oneline').trim()).toBe('')
    // The push half of `synced` really happened.
    expect(git(local, 'status', '-sb')).not.toContain('ahead')
  })

  it('returns no-remote rather than failing when none is configured (verification 7)', async () => {
    const root = await temp('no-remote')
    git(root, 'init', '-b', 'main')
    identify(root)
    await fs.writeFile(path.join(root, 'notes.md'), 'x\n', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'first')

    await expect(createGitService(root).sync()).resolves.toEqual({
      kind: 'no-remote',
    })
  })
})

describe('sync — first push (§5.5)', () => {
  it('sets the upstream on a branch that has never been pushed (verification 9)', async () => {
    const base = await temp('firstpush')
    const remote = path.join(base, 'remote.git')
    const local = path.join(base, 'vault')

    git(base, 'init', '--bare', '-b', 'main', remote)
    await fs.mkdir(local, { recursive: true })
    git(local, 'init', '-b', 'main')
    identify(local)
    await fs.writeFile(path.join(local, 'notes.md'), 'x\n', 'utf8')
    git(local, 'add', '-A')
    git(local, 'commit', '-m', 'first')
    // A remote, but no upstream — `status.tracking` is null here just as it is
    // with no remote at all, which is why `hasRemote` has to be asked
    // separately.
    git(local, 'remote', 'add', 'origin', remote)

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'pushed', commits: 1 })
    expect(git(local, 'rev-parse', '--abbrev-ref', 'main@{upstream}').trim()).toBe(
      'origin/main',
    )
  })

  it('does not treat a repository with no commits as something to push', async () => {
    // `git init` then Sync, before anything has been committed. `rev-list`
    // exits non-zero on an unborn HEAD, and pushing would fail outright.
    const base = await temp('unborn')
    const remote = path.join(base, 'remote.git')
    const local = path.join(base, 'vault')

    git(base, 'init', '--bare', '-b', 'main', remote)
    await fs.mkdir(local, { recursive: true })
    git(local, 'init', '-b', 'main')
    identify(local)
    git(local, 'remote', 'add', 'origin', remote)

    await expect(createGitService(local).sync()).resolves.toEqual({
      kind: 'up-to-date',
    })
  })

  it('counts only what the remote lacks when pushing a new branch', async () => {
    /*
     * A branch cut from an already-pushed `main` has no `origin/<branch>` to
     * measure against. Falling back to its whole history reported "Pushed 12
     * commits" for a single new note in the browser — true of the ref, wildly
     * untrue of what crossed the wire. Measuring against every remote ref gives
     * the one commit the remote actually does not have.
     */
    const { local } = await makeWorld()
    git(local, 'checkout', '-b', 'scratch')
    await commitLocally(local, 'notes/new.md', 'new\n', 'add new')

    await expect(createGitService(local).sync()).resolves.toEqual({
      kind: 'pushed',
      commits: 1,
    })
  })

  it('uses the remote it finds when it is not called origin', async () => {
    const base = await temp('upstream-name')
    const remote = path.join(base, 'remote.git')
    const local = path.join(base, 'vault')

    git(base, 'init', '--bare', '-b', 'main', remote)
    await fs.mkdir(local, { recursive: true })
    git(local, 'init', '-b', 'main')
    identify(local)
    await fs.writeFile(path.join(local, 'notes.md'), 'x\n', 'utf8')
    git(local, 'add', '-A')
    git(local, 'commit', '-m', 'first')
    git(local, 'remote', 'add', 'upstream', remote)

    await expect(createGitService(local).sync()).resolves.toEqual({
      kind: 'pushed',
      commits: 1,
    })
    expect(
      git(local, 'rev-parse', '--abbrev-ref', 'main@{upstream}').trim(),
    ).toBe('upstream/main')
  })
})

describe('sync — conflicts (verification 5)', () => {
  it('detects a stopped rebase and reports the conflicted paths', async () => {
    const { local, other } = await makeWorld()
    // The same file on both sides, so the replay cannot apply cleanly.
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    await commitLocally(local, 'notes/a.md', 'my version\n', 'my edit')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'conflict', paths: ['notes/a.md'] })
  })

  it('leaves the vault in a state the panel can describe, and abort recovers', async () => {
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    await commitLocally(local, 'notes/a.md', 'my version\n', 'my edit')
    const mine = git(local, 'rev-parse', 'HEAD').trim()

    await createGitService(local).sync()

    // Mid-rebase, which is exactly what the panel keys on to show its paused
    // state rather than a plain conflict.
    await expect(readGitOperation(local)).resolves.toBe('rebase')

    git(local, 'rebase', '--abort')

    await expect(readGitOperation(local)).resolves.toBeNull()
    // Back to precisely where the user was before pressing Sync.
    expect(git(local, 'rev-parse', 'HEAD').trim()).toBe(mine)
    await expect(read(local, 'notes/a.md')).resolves.toBe('my version\n')
  })

  it('reports a conflict when the rebase succeeds but the autostash cannot reapply', async () => {
    /*
     * The case the `conflicted.length` half of the check exists for. The rebase
     * itself replays cleanly — the local commit touches a different file — and
     * *then* `--autostash` tries to restore an uncommitted edit onto a file the
     * incoming commits changed underneath it. That leaves files in conflict
     * with **no rebase in progress**, so a check keyed only on the marker would
     * call this a success and let the panel report a clean sync over a working
     * tree full of conflict markers.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    await commitLocally(local, 'notes/mine.md', 'mine\n', 'add mine')
    // Uncommitted, to the same file the incoming commit rewrote.
    await fs.writeFile(path.join(local, 'notes/a.md'), 'my scratch\n', 'utf8')

    const outcome = await createGitService(local).sync()

    expect(outcome.kind).toBe('conflict')
    expect(await readGitOperation(local)).toBeNull()
  })

  it('reports a conflict when a fast-forward’s autostash cannot reapply', async () => {
    /*
     * The same trap on the path that "cannot conflict". The *merge* genuinely
     * cannot — but restoring the stashed edit afterwards can, and Git exits 0
     * either way. Nothing before this returned non-zero, so a check that only
     * wrapped the command in `try`/`catch` would have called this a clean pull.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    await fs.writeFile(path.join(local, 'notes/a.md'), 'my scratch\n', 'utf8')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'conflict', paths: ['notes/a.md'] })
    // Git keeps the stash on a failed restore, and so must we: it is the only
    // remaining copy of the user's uncommitted work.
    expect(git(local, 'stash', 'list')).toContain('autostash')
  })

  it('reports the conflict again when Sync is pressed over an unmerged tree', async () => {
    /*
     * The follow-on from the two cases above, and the reason the `catch` tests
     * `conflicted` as well as the rebase marker. A pop conflict leaves `UU`
     * entries with **no rebase in progress**, so the mid-operation precheck
     * lets this through — and then `git pull` refuses outright ("Pulling is not
     * possible because you have unmerged files") and exits non-zero. Without
     * the `conflicted` disjunct that would surface as a generic Git failure
     * instead of the conflict the user is actually looking at.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    // The local commit is made *first*, and touches a different file: after the
    // conflict exists, any `git add -A` would stage the conflict markers and
    // mark them resolved, which is the opposite of the state under test.
    await commitLocally(local, 'notes/mine.md', 'mine\n', 'add mine')
    await fs.writeFile(path.join(local, 'notes/a.md'), 'my scratch\n', 'utf8')

    const service = createGitService(local)
    // Rebase succeeds, the autostash restore does not — leaving `UU` with no
    // rebase in progress, and the local commit still unpushed.
    expect((await service.sync()).kind).toBe('conflict')
    expect(await readGitOperation(local)).toBeNull()

    // The other machine moves on, so the next Sync is a real divergence rather
    // than a no-op.
    await pushFrom(other, 'notes/b.md', 'more\n', 'add b')

    const outcome = await service.sync()

    expect(outcome).toEqual({ kind: 'conflict', paths: ['notes/a.md'] })
  })

  it('refuses to sync again while suspended, with advice rather than Git’s', async () => {
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/a.md', 'their version\n', 'their edit')
    await commitLocally(local, 'notes/a.md', 'my version\n', 'my edit')

    const service = createGitService(local)
    await service.sync()

    const error = await service.sync().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('OPERATION_IN_PROGRESS')
    expect((error as GitError).message).toContain('git rebase --abort')
  })
})

describe('sync — uncommitted work (verification 6)', () => {
  it('restores uncommitted edits after a fast-forward pull', async () => {
    /*
     * `--autostash` is on the *rebase* path, and this is the ff-only path — so
     * without `-c merge.autoStash=true` Git refuses the merge outright with
     * "Your local changes would be overwritten". The edit is to the same file
     * the incoming commit touches, which is the only case where that happens.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/b.md', 'from them\n', 'add b')
    await fs.writeFile(path.join(local, 'notes/a.md'), 'work in progress\n', 'utf8')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'pulled', commits: 1 })
    // The pull landed…
    await expect(read(local, 'notes/b.md')).resolves.toBe('from them\n')
    // …and the uncommitted edit is still there, not stashed away or discarded.
    await expect(read(local, 'notes/a.md')).resolves.toBe('work in progress\n')
    expect(git(local, 'stash', 'list').trim()).toBe('')
  })

  it('restores uncommitted edits across a rebase', async () => {
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/theirs.md', 'theirs\n', 'add theirs')
    await commitLocally(local, 'notes/mine.md', 'mine\n', 'add mine')
    await fs.writeFile(path.join(local, 'notes/a.md'), 'scratch\n', 'utf8')

    const outcome = await createGitService(local).sync()

    expect(outcome).toEqual({ kind: 'synced', pulled: 1, pushed: 1 })
    await expect(read(local, 'notes/a.md')).resolves.toBe('scratch\n')
    expect(git(local, 'stash', 'list').trim()).toBe('')
  })
})

describe('sync — unreachable remotes (verification 8)', () => {
  it('maps a dead remote to a message about the remote, not a Git dump', async () => {
    const local = await temp('dead-remote')
    git(local, 'init', '-b', 'main')
    identify(local)
    await fs.writeFile(path.join(local, 'notes.md'), 'x\n', 'utf8')
    git(local, 'add', '-A')
    git(local, 'commit', '-m', 'first')
    git(local, 'remote', 'add', 'origin', path.join(local, 'does-not-exist.git'))

    const error = await createGitService(local).sync().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('REMOTE_UNREACHABLE')
  })

  it('never lets a credential in the remote URL reach the message', async () => {
    /*
     * The realistic leak: a user clones with a token in the URL, goes offline,
     * and Git echoes the whole URL into its error. `GitError` messages are
     * rendered verbatim in the browser.
     */
    const local = await temp('token-remote')
    git(local, 'init', '-b', 'main')
    identify(local)
    await fs.writeFile(path.join(local, 'notes.md'), 'x\n', 'utf8')
    git(local, 'add', '-A')
    git(local, 'commit', '-m', 'first')
    git(
      local,
      'remote',
      'add',
      'origin',
      'https://ghp_secrettokenvalue@nonexistent.invalid/user/vault.git',
    )

    const error = await createGitService(local).sync().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).message).not.toContain('ghp_secrettokenvalue')
    expect((error as GitError).message).not.toContain('nonexistent.invalid')
  })
})

describe('sync — serialization (verification 10)', () => {
  it('does not collide with a concurrent write on .git/index.lock', async () => {
    /*
     * Both go through the same per-root queue. Without it, the rebase or push
     * inside `sync` and the `add` inside `stage` can hold `.git/index.lock` at
     * the same moment, and Git fails the loser outright rather than waiting.
     */
    const { local, other } = await makeWorld()
    await pushFrom(other, 'notes/b.md', 'theirs\n', 'add b')
    await fs.writeFile(path.join(local, 'notes/new.md'), 'new\n', 'utf8')

    const service = createGitService(local)
    const results = await Promise.allSettled([
      service.sync(),
      service.stage(['notes/new.md']),
      service.status(),
    ])

    expect(results.map((r) => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'fulfilled',
    ])
    await expect(fs.access(path.join(local, '.git/index.lock'))).rejects.toThrow()
  })
})

describe('remotes', () => {
  it('lists configured remotes and reports none as empty', async () => {
    const { local } = await makeWorld()
    await expect(createGitService(local).remotes()).resolves.toEqual(['origin'])

    const bare = await temp('bare-remote')
    git(bare, 'init', '-b', 'main')
    await expect(createGitService(bare).remotes()).resolves.toEqual([])
  })
})
