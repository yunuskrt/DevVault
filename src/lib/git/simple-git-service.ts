import 'server-only'

import { simpleGit, type SimpleGit } from 'simple-git'

import { GitError, messageFor, toGitError } from '@/lib/git/errors'
import {
  assertIndexUnlocked,
  enqueueGitWrite,
  resetGitQueue,
} from '@/lib/git/queue'
import type { GitCommit, GitService, GitStatus, SyncOutcome } from '@/lib/git/types'

/** §5.9: a credential prompt on a remote must never hang a request forever. */
const BLOCK_TIMEOUT_MS = 20_000

/*
 * §5.9 wants `GIT_TERMINAL_PROMPT=0` in the spawn environment, and the obvious
 * way to get it there — `.env({ ...process.env, GIT_TERMINAL_PROMPT: '0' })` —
 * does not work with current `simple-git`.
 *
 * Handing it an explicit environment triggers `@simple-git/argv-parser`, which
 * refuses to spawn if that environment contains any of `GIT_EDITOR`,
 * `GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_PAGER`, `GIT_CONFIG_*` and friends
 * unless the matching `unsafe` flag is enabled. Spreading `process.env` copies
 * whatever the user happens to have exported, so on a developer machine this
 * fails with "Use of GIT_EDITOR is not permitted" before Git ever runs.
 *
 * Setting the variable on our own process instead means we pass no explicit
 * environment, so `child_process.spawn` inherits the parent's — which is the
 * behaviour §2.2 depends on. SSH keys, `osxkeychain`, `gh auth` and any
 * configured `credential.helper` need `PATH`, `HOME` and the agent socket to
 * survive, and a curated environment would have broken exactly the property
 * the engine was chosen for.
 *
 * Filtering the flagged variables out was the alternative and is worse: users
 * legitimately configure `GIT_SSH_COMMAND` to select a key, so stripping it
 * would break authentication for the people most likely to rely on it.
 */
process.env.GIT_TERMINAL_PROMPT = '0'

/**
 * One instance per vault root, reused for the life of the process.
 *
 * `simpleGit()` only builds a command runner — it touches nothing on disk — so
 * caching it is about not re-reading the environment on every call rather than
 * about correctness.
 */
const instances = new Map<string, SimpleGit>()

const gitFor = (root: string): SimpleGit => {
  const existing = instances.get(root)
  if (existing) return existing

  // No `.env()` call — see the note above. The subprocess inherits ours.
  const git = simpleGit({
    baseDir: root,
    timeout: { block: BLOCK_TIMEOUT_MS },
    config: [],
  })

  instances.set(root, git)
  return git
}

/**
 * Whether `git` exists at all.
 *
 * Cached for the process, and it is the *only* thing here that is: the binary
 * cannot appear or vanish while the server runs, whereas "is this a
 * repository" and "is an identity configured" both change under a user who is
 * mid-setup. Those are checked per request by the caller.
 */
let gitInstalled: Promise<boolean> | undefined

export const isGitInstalled = (root: string): Promise<boolean> => {
  gitInstalled ??= gitFor(root)
    .raw(['--version'])
    .then(() => true)
    .catch(() => false)

  return gitInstalled
}

/** Test seam — the process cache above would otherwise leak between cases. */
export const resetGitCaches = (): void => {
  gitInstalled = undefined
  instances.clear()
  // The queue is keyed by root and temp-directory roots are never reused, so
  // this is belt and braces — but a test that forgot it would leave a resolved
  // tail behind and the next case would chain onto a stranger's promise.
  resetGitQueue()
}

const notImplemented = (method: string): never => {
  throw new GitError(
    'GIT_FAILED',
    `This action is not available yet (${method}).`,
  )
}

export const createGitService = (root: string): GitService => {
  const git = gitFor(root)

  /**
   * The one path every index-touching command takes: queued behind any other
   * write to this vault, checked for a foreign `index.lock` first, and with
   * whatever the engine threw converted to a `GitError` (§5.9).
   *
   * Wrapping it here rather than at each call site is what makes "every
   * mutating call is serialized" a property of the module instead of a rule
   * six methods have to remember.
   */
  const write = <T>(task: () => Promise<T>): Promise<T> =>
    enqueueGitWrite(root, async () => {
      await assertIndexUnlocked(root)

      try {
        return await task()
      } catch (error) {
        throw toGitError(error)
      }
    })

  return {
    async status(): Promise<GitStatus> {
      try {
        // One `git status --porcelain -b -u` under the hood: branch, upstream,
        // ahead/behind and every changed path in a single subprocess.
        const raw = await git.status()

        return {
          branch: raw.current ?? '',
          tracking: raw.tracking ?? null,
          ahead: raw.ahead,
          behind: raw.behind,
          staged: raw.staged,
          modified: raw.modified,
          created: raw.created,
          deleted: raw.deleted,
          conflicted: raw.conflicted,
          untracked: raw.not_added,
          // The engine's own shape, narrowed: it types these loosely enough
          // that `from`/`to` are optional, but a rename always has both.
          renamed: raw.renamed.map((rename) => ({
            from: rename.from,
            to: rename.to,
          })),
          isClean: raw.isClean(),
        }
      } catch (error) {
        throw toGitError(error)
      }
    },

    async log({ path, limit }: { path?: string; limit?: number } = {}): Promise<
      GitCommit[]
    > {
      try {
        const result = await git.log({
          // `%cI` is committer date in ISO 8601. The engine's default format
          // is neither ISO nor committer date, and `formatRelativeTime` needs
          // something `new Date()` can parse.
          format: { hash: '%H', message: '%s', author: '%an', date: '%cI' },
          ...(limit === undefined ? {} : { maxCount: limit }),
          // simple-git adds `--follow` itself whenever `file` is set, which is
          // what §3.2 needs: an item's path changes when its title does, and
          // its history has to survive the rename.
          ...(path === undefined ? {} : { file: path }),
        })

        return result.all.map((commit) => ({
          hash: commit.hash,
          message: commit.message,
          author: commit.author,
          date: commit.date,
        }))
      } catch (error) {
        // A repository with no commits yet is a normal state, not a failure —
        // `git log` exits non-zero on it. Everything else is a real error.
        if (/does not have any commits|bad default revision/i.test(
          error instanceof Error ? error.message : '',
        )) {
          return []
        }

        throw toGitError(error)
      }
    },

    /**
     * §5.4: explicit paths, never `git add -A`. The vault repository is the
     * user's own and may hold files DevVault did not put there; sweeping them
     * into a commit labelled `Add note: …` would be a lie about what happened.
     */
    stage(paths: string[]): Promise<void> {
      return write(async () => {
        if (paths.length === 0) return
        await git.add(paths)
      })
    },

    commit(message: string): Promise<{ hash: string }> {
      return write(async () => {
        const result = await git.commit(message)

        // simple-git resolves rather than throws when there was nothing
        // staged, so the empty case has to be recognised from the summary.
        if (!result.commit) {
          throw new GitError(
            'NOTHING_TO_COMMIT',
            messageFor('NOTHING_TO_COMMIT'),
          )
        }

        return { hash: result.commit }
      })
    },

    /** `git checkout -- <paths>`: throws away uncommitted edits. */
    discard(paths: string[]): Promise<void> {
      return write(async () => {
        if (paths.length === 0) return
        await git.checkout(['--', ...paths])
      })
    },

    remove(paths: string[]): Promise<void> {
      return write(async () => {
        if (paths.length === 0) return
        await git.rm(paths)
      })
    },

    move(from: string, to: string): Promise<void> {
      return write(async () => {
        await git.mv(from, to)
      })
    },

    async fileAtRevision(path: string, hash: string): Promise<string> {
      try {
        // Reads an object out of the store; takes no index lock, so it is not
        // queued.
        return await git.show([`${hash}:${path}`])
      } catch (error) {
        throw toGitError(error)
      }
    },

    // Specs 6 and 7. Declared on the interface so those specs implement a
    // shape that already exists; calling one today is a bug, not a no-op.
    sync: (): Promise<SyncOutcome> => notImplemented('sync'),
    resolve: () => notImplemented('resolve'),
  }
}

/**
 * Is `root` inside a Git work tree, and is an identity configured?
 *
 * Both are read fresh every time — the caller decides the caching, and it
 * scopes them to the request so that `git init`-ing the vault or fixing
 * `user.email` shows up on the next reload rather than the next restart.
 */
export const checkRepository = async (
  root: string,
): Promise<{ isRepo: boolean; hasIdentity: boolean }> => {
  const git = gitFor(root)

  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) return { isRepo: false, hasIdentity: false }

  const [name, email] = await Promise.all([
    git.getConfig('user.name').catch(() => null),
    git.getConfig('user.email').catch(() => null),
  ])

  return {
    isRepo: true,
    hasIdentity: Boolean(name?.value?.trim() && email?.value?.trim()),
  }
}
