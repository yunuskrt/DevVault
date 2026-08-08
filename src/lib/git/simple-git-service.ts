import 'server-only'

import { simpleGit, type SimpleGit } from 'simple-git'

import { checkoutFlagFor, stageFor } from '@/lib/git/conflict-sides'
import { GitError, messageFor, toGitError } from '@/lib/git/errors'
import {
  assertIndexUnlocked,
  enqueueGitWrite,
  resetGitQueue,
} from '@/lib/git/queue'
import { readGitOperation } from '@/lib/git/repo-state'
import type {
  ConflictSide,
  ConflictSides,
  ContinueOutcome,
  GitCommit,
  GitOperation,
  GitService,
  GitStatus,
  SyncOutcome,
} from '@/lib/git/types'

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

/*
 * `rebase --continue` and `merge` open an editor for the commit message, and a
 * Next.js server has no terminal to open one in — Git would block until the 20s
 * timeout and then report something unrelated. `true` is the builtin that exits
 * 0 immediately, so Git keeps the message it already has.
 *
 * Set here rather than passed as `-c core.editor=true`, which is the obvious
 * way and does not work: `@simple-git/argv-parser` rejects it outright with
 * "Configuring core.editor is not permitted without enabling allowUnsafeEditor".
 * That is the same guard the note above describes, reached from the other
 * direction — and the same fix applies, because the parser inspects only what
 * is *explicitly supplied* and never the environment we inherit from.
 *
 * `GIT_TERMINAL_PROMPT=0` does not cover this: it governs credential prompts,
 * not the editor.
 */
process.env.GIT_EDITOR = 'true'

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

  /**
   * Hoisted out of the object literal because `sync` calls it several times and
   * `this` inside a returned literal is not something to rely on.
   */
  const readStatus = async (): Promise<GitStatus> => {
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
  }

  /**
   * The unmerged paths, read straight out of the index.
   *
   * **Deliberately not `status()`.** `git status` opportunistically refreshes
   * the index and writes it back, which takes `.git/index.lock` — so calling it
   * from outside the write queue makes a concurrent queued command fail its
   * `assertIndexUnlocked` precheck. That is not theoretical: adding a
   * `status()` call to the mutation layer's conflict guard broke spec 5's
   * concurrency test, where ten simultaneous creates started colliding on the
   * lock again.
   *
   * `ls-files --unmerged` is a plain index read that takes no lock. `-z` so a
   * path containing a quote or a newline is not mangled by Git's default
   * quoting. Each unmerged path appears once per stage, hence the `Set`.
   */
  const conflictedPaths = async (): Promise<string[]> => {
    try {
      const raw = await git.raw(['ls-files', '--unmerged', '-z'])

      return [
        ...new Set(
          raw
            .split('\0')
            .filter(Boolean)
            .map((entry) => entry.slice(entry.indexOf('\t') + 1)),
        ),
      ]
    } catch (error) {
      throw toGitError(error)
    }
  }

  const listRemotes = async (): Promise<string[]> => {
    try {
      return (await git.getRemotes(false)).map((remote) => remote.name)
    } catch (error) {
      throw toGitError(error)
    }
  }

  /**
   * How many commits `branch` has that the remote does not.
   *
   * The fallback is for the first push, where there is no `origin/<branch>` to
   * subtract because the push is what creates it. It measures against *every*
   * ref the remote has rather than against nothing: a new branch cut from an
   * already-pushed `main` is one commit ahead of the remote, not the length of
   * its whole history, and reporting "Pushed 12 commits" for a single note was
   * how this surfaced.
   *
   * A remote with no refs at all — a bare repository that has never been pushed
   * to — matches nothing, so the count is the whole history, which is correct
   * there.
   */
  const countAhead = async (
    branch: string,
    remote: string,
    upstream: string,
  ): Promise<number> => {
    const count = async (args: string[]): Promise<number> =>
      Number.parseInt((await git.raw(args)).trim(), 10)

    try {
      return await count(['rev-list', '--count', branch, `^${upstream}`])
    } catch {
      try {
        return await count([
          'rev-list',
          '--count',
          branch,
          '--not',
          `--remotes=${remote}`,
        ])
      } catch {
        // No commits on the branch at all — a repository that has been
        // `git init`ed and never committed to.
        return 0
      }
    }
  }

  /**
   * Conflicts a step left behind **despite exiting zero**.
   *
   * `--autostash` and `merge.autoStash` stash the user's uncommitted edits,
   * complete the pull, and then try to restore them. When that restore
   * conflicts — the edit and the incoming commits touched the same file — Git
   * prints "Applying autostash resulted in conflicts", leaves `UU` entries in
   * the working tree, **and exits 0**. Verified against Git 2.39.3 on both the
   * `merge --ff-only` and the `pull --rebase` path.
   *
   * So the `catch` blocks alone are not enough: without this, a sync that left
   * conflict markers sitting in a vault file would be reported as a success,
   * which is the §7.5 lie the whole feature is supposed to avoid.
   */
  const conflictsInWorkingTree = async (): Promise<SyncOutcome | null> => {
    const after = await readStatus()

    return after.conflicted.length > 0
      ? { kind: 'conflict', paths: after.conflicted }
      : null
  }

  /**
   * Fetch, inspect, then decide (§5.6).
   *
   * The whole sequence is one queued unit rather than a queued command per
   * step: between the fetch and the merge, a concurrent commit would change
   * `ahead` out from under the decision that was just made on it, and the
   * branch taken would no longer match the repository it is applied to.
   */
  const sync = (): Promise<SyncOutcome> =>
    write(async () => {
      /*
       * Refused up front rather than left to Git. A vault suspended mid-rebase
       * fails every one of the commands below with a different message, none of
       * which says "you are mid-rebase, here is how to get out" — which is the
       * only thing the user needs to know (§9.7).
       */
      const suspended = await readGitOperation(root)
      if (suspended) {
        throw new GitError(
          'OPERATION_IN_PROGRESS',
          messageFor('OPERATION_IN_PROGRESS'),
        )
      }

      const remotes = await listRemotes()
      if (remotes.length === 0) return { kind: 'no-remote' }

      // `origin` by convention, but a vault cloned with `-o upstream` is
      // perfectly valid and there is no reason to refuse it.
      const remote = remotes.includes('origin') ? 'origin' : remotes[0]

      await git.fetch(remote)

      const status = await readStatus()

      /*
       * A remote exists but this branch has never been pushed. §5.5: detect it
       * and send `-u`, rather than letting a plain push fail with Git's
       * "set-upstream" suggestion string, which is advice the user cannot act
       * on from inside DevVault.
       */
      if (!status.tracking) {
        if (!status.branch) {
          throw new GitError(
            'GIT_FAILED',
            'Your vault is not on a branch (detached HEAD). Check it out onto a branch before syncing.',
          )
        }

        const commits = await countAhead(
          status.branch,
          remote,
          `${remote}/${status.branch}`,
        )
        if (commits === 0) return { kind: 'up-to-date' }

        await git.push(['-u', remote, status.branch])
        return { kind: 'pushed', commits }
      }

      const { ahead, behind, tracking } = status

      if (ahead === 0 && behind === 0) return { kind: 'up-to-date' }

      /*
       * The case worth isolating: a fast-forward **cannot** conflict, and on a
       * single-user vault it is the overwhelmingly common sync. Routing it
       * through a path with no failure mode is most of the reliability this
       * feature will ever have.
       *
       * `merge.autoStash` covers the one way the merge can still be refused —
       * uncommitted edits to a file the incoming commits also touch, which Git
       * declines to overwrite. Verification item 6 is exactly this, and the
       * `--autostash` on the diverged path below does not reach here.
       */
      if (behind > 0 && ahead === 0) {
        await git.raw([
          '-c',
          'merge.autoStash=true',
          'merge',
          '--ff-only',
          tracking,
        ])
        return (await conflictsInWorkingTree()) ?? { kind: 'pulled', commits: behind }
      }

      if (ahead > 0 && behind === 0) {
        await git.push()
        return { kind: 'pushed', commits: ahead }
      }

      /*
       * Diverged. Rebase rather than merge: a vault is one person's notes on
       * two machines, so replaying the local commits on top gives linear,
       * readable history instead of merge commits littering a knowledge repo.
       */
      try {
        await git.raw(['pull', '--rebase', '--autostash'])
      } catch (error) {
        const [operation, after] = await Promise.all([
          readGitOperation(root),
          readStatus(),
        ])

        /*
         * Detect and stop cleanly — resolution is spec 7.
         *
         * The `conflicted` half is the one that carries a real case: a working
         * tree already holding `UU` entries from an earlier failed autostash
         * makes `git pull` refuse outright, with no rebase started. The
         * `operation` half is defensive and has no test that fails without it —
         * every way `git pull --rebase` is known to stop leaves conflicts too,
         * and a rebase that skips an identical commit does not stop at all
         * (checked, not assumed). It is kept because the alternative is a
         * *toast* on a vault left mid-rebase, which §7.3 rules out; the panel
         * would still show the paused state either way, since `loadGitStatus`
         * reads the marker itself rather than trusting this outcome.
         */
        if (operation === 'rebase' || after.conflicted.length > 0) {
          return { kind: 'conflict', paths: after.conflicted }
        }

        throw toGitError(error)
      }

      /*
       * The rebase itself succeeded, which does not mean the working tree is
       * clean — see `conflictsInWorkingTree`. Nothing is pushed in that case:
       * the commits are sound, but reporting a completed sync over a file full
       * of conflict markers would be the lie, and the next Sync pushes them
       * once the user has dealt with it.
       */
      const stalled = await conflictsInWorkingTree()
      if (stalled) return stalled

      // The rebase replayed our commits on top of theirs, so they are still
      // unpushed. Both counts are what the user gets told (§7.3).
      await git.push()
      return { kind: 'synced', pulled: behind, pushed: ahead }
    })

  return {
    status: readStatus,

    conflictedPaths,

    remotes: listRemotes,

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

    sync,

    /**
     * Resolve one file to one side, and stage it (§5.7).
     *
     * The operation is read *inside* the queued unit rather than passed in, so
     * the flag is chosen from the repository's state at the moment the checkout
     * runs. Deciding it earlier would leave a window in which a concurrent
     * resolve finished the rebase and inverted the answer — and the cost of
     * being wrong here is the user's work, silently.
     */
    resolve(path: string, side: ConflictSide): Promise<void> {
      return write(async () => {
        const operation = await readGitOperation(root)

        await git.raw(['checkout', checkoutFlagFor(operation, side), '--', path])
        await git.add([path])
      })
    },

    /**
     * Both sides, by meaning.
     *
     * Reads objects out of the store, so it takes no index lock and is not
     * queued. A stage can legitimately be absent — a file added on one side and
     * modified on the other has no common base — so a missing one reads as
     * empty rather than failing the whole call.
     */
    async readConflictSides(path: string): Promise<ConflictSides> {
      try {
        const operation = await readGitOperation(root)

        const read = async (side: ConflictSide): Promise<string> => {
          try {
            return await git.show([`:${stageFor(operation, side)}:${path}`])
          } catch {
            return ''
          }
        }

        const [mine, theirs] = await Promise.all([read('mine'), read('theirs')])
        return { mine, theirs }
      } catch (error) {
        throw toGitError(error)
      }
    },

    continueOperation(): Promise<ContinueOutcome> {
      return write(async () => {
        const operation = await readGitOperation(root)

        /*
         * Checked here rather than left to Git: `rebase --continue` on an
         * unresolved tree fails with "You must edit all merge conflicts",
         * which is advice for someone at a terminal, not for someone looking
         * at a dialog listing the files.
         */
        const { conflicted } = await readStatus()
        if (conflicted.length > 0) {
          throw new GitError(
            'OPERATION_IN_PROGRESS',
            `${conflicted.length === 1 ? 'One file is' : `${conflicted.length} files are`} still in conflict. Resolve everything before finishing.`,
          )
        }

        if (operation === null) {
          // An autostash restore that conflicted leaves nothing in progress —
          // the resolved files are simply staged, ready for an ordinary commit.
          return { kind: 'nothing-to-continue' }
        }

        if (operation === 'merge') {
          // A merge has no `--continue` worth using: the conclusion of a merge
          // is the merge commit itself, and `--no-edit` keeps Git's generated
          // message rather than opening an editor nobody can see.
          await git.raw(['commit', '--no-edit'])
        } else {
          // Relies on `GIT_EDITOR=true` being set on this process — see the
          // note at the top of the file for why it cannot be passed as `-c`.
          await git.raw([operation, '--continue'])
        }

        return { kind: 'continued', operation }
      })
    },

    abortOperation(): Promise<GitOperation | null> {
      return write(async () => {
        const operation = await readGitOperation(root)
        if (operation === null) return null

        await git.raw([operation, '--abort'])
        return operation
      })
    },
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
