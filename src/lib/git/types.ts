/**
 * The seam between DevVault and whichever Git engine it runs on.
 *
 * **Nothing in this file may import `simple-git`.** Everything above the
 * service codes against these types, so revisiting the engine decision
 * (§2.5) is one file — `simple-git-service.ts` — and a test double has
 * somewhere to plug in.
 *
 * This file is type-only, so it carries no `server-only` guard and is safe to
 * `import type` from anywhere.
 */

export type GitStatus = {
  branch: string
  /** The upstream branch, e.g. `origin/main`. Null when nothing is tracked. */
  tracking: string | null
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  created: string[]
  deleted: string[]
  conflicted: string[]
  /**
   * Untracked files. Not in the §4.3 shape, but without it a freshly
   * initialised repository reports `isClean: false` with nothing to point at —
   * every file is untracked, and none of the other arrays holds one.
   */
  untracked: string[]
  /**
   * Renames, likewise beyond §4.3 and likewise load-bearing. Git reports a
   * rename as its own porcelain status (`R  from -> to`) and the engine parses
   * it into neither `staged` nor `created` nor `deleted` — so without this
   * field a vault whose only change was a renamed item reads as `isClean:
   * false` with every array empty, and the panel offers to commit "0 files".
   *
   * §3.2 makes this ordinary rather than exotic: editing an item's title
   * renames its file.
   */
  renamed: { from: string; to: string }[]
  isClean: boolean
}

/**
 * One commit, flattened to the fields the UI needs. `date` is ISO 8601 from
 * `%cI` so it can go straight into `formatRelativeTime`; the engine's own
 * default log format is not ISO.
 */
export type GitCommit = {
  hash: string
  message: string
  author: string
  date: string
}

export type SyncOutcome =
  | { kind: 'up-to-date' }
  | { kind: 'pulled'; commits: number }
  | { kind: 'pushed'; commits: number }
  | { kind: 'synced'; pulled: number; pushed: number }
  | { kind: 'conflict'; paths: string[] }
  | { kind: 'no-remote' }

/**
 * A multi-step Git operation the working tree is currently suspended in.
 *
 * §9.7: uncommitted changes at startup are normal, a half-finished rebase is
 * not. A vault left here by a previous session has to be surfaced rather than
 * letting the next Sync fail confusingly — and every Git write is unsafe until
 * it is finished or abandoned.
 *
 * `cherry-pick` and `revert` are not states DevVault can create, but a user can
 * from a terminal, and they are just as unsafe to write over.
 */
export type GitOperation = 'rebase' | 'merge' | 'cherry-pick' | 'revert'

/**
 * `sync` and `resolve` remain unimplemented until specs 6 and 7; both throw.
 * They stay declared so those specs fill in a shape that already exists rather
 * than each inventing its own.
 *
 * Every method that touches the index — everything except `status`, `log` and
 * `fileAtRevision` — is serialized through the write queue by the
 * implementation (§5.9). Callers do not queue for themselves.
 */
export interface GitService {
  status(): Promise<GitStatus>
  log(opts?: { path?: string; limit?: number }): Promise<GitCommit[]>
  stage(paths: string[]): Promise<void>
  commit(message: string): Promise<{ hash: string }>
  /**
   * Configured remote names, in Git's own order.
   *
   * Separate from `status()` because it answers a different question and costs
   * its own subprocess: `git status` reports the *upstream branch*, which is
   * null both when no remote exists and when one exists but this branch has
   * never been pushed. §5.5 needs those apart — the first is a setup gap, the
   * second is a `push -u` away.
   */
  remotes(): Promise<string[]>
  /** Fetch, inspect, then decide (§5.6). Never a blind `git pull`. */
  sync(): Promise<SyncOutcome>
  fileAtRevision(path: string, hash: string): Promise<string>
  discard(paths: string[]): Promise<void>
  resolve(path: string, side: 'ours' | 'theirs'): Promise<void>
  /**
   * `git rm` — drops the file from disk *and* the index in one step (§5.4),
   * rather than `fs.unlink` followed by a stage.
   *
   * Throws `UNTRACKED_PATH` when Git does not track the file, which is a
   * routine state for an item created but never committed. The caller falls
   * back to a plain filesystem delete.
   */
  remove(paths: string[]): Promise<void>
  /**
   * `git mv` — moves the file and records the rename, so `log --follow` keeps
   * the item's history across a title edit (§3.2).
   *
   * Throws `UNTRACKED_PATH` on an untracked source, same as `remove`.
   */
  move(from: string, to: string): Promise<void>
}

/**
 * What a caller gets back when it asks for the vault's Git state.
 *
 * A union rather than an exception because every failure here is a state the
 * panel has to *render* — no Git installed, no repository, no identity — not
 * an exceptional condition that should take a page down with it.
 */
export type GitStatusResult =
  | {
      ok: true
      status: GitStatus
      lastCommit: GitCommit | null
      /**
       * Whether *any* remote is configured, which `status.tracking` cannot
       * answer on its own — see `GitService.remotes`. Drives whether Sync is
       * offered at all: a branch with no upstream but a remote to push to is
       * the ordinary state of a vault that has never been pushed.
       */
      hasRemote: boolean
      /** Non-null when the vault is suspended mid-rebase or mid-merge (§9.7). */
      operation: GitOperation | null
    }
  | { ok: false; code: GitErrorCode; message: string }

export type GitErrorCode =
  /** The `git` binary is not on PATH. */
  | 'GIT_NOT_INSTALLED'
  /** The vault directory exists but is not a Git repository. */
  | 'NOT_A_REPOSITORY'
  /** `user.name` and/or `user.email` are unset. */
  | 'IDENTITY_UNSET'
  /** `.git/index.lock` is held — another Git process, or a stale lock. */
  | 'INDEX_LOCKED'
  /** The command exceeded its block timeout. */
  | 'TIMEOUT'
  /** The remote rejected the credentials. */
  | 'AUTH_FAILED'
  /** The remote could not be reached at all — offline, bad URL, DNS. */
  | 'REMOTE_UNREACHABLE'
  /**
   * A rebase, merge, cherry-pick or revert is suspended. Every write is refused
   * until it is finished or abandoned, because Git would refuse anyway and with
   * a far less actionable message.
   */
  | 'OPERATION_IN_PROGRESS'
  /**
   * `rm` or `mv` was asked about a file Git does not track. Not a user-facing
   * failure — an item written but never committed is exactly this — so the
   * caller falls back to the filesystem rather than surfacing it.
   */
  | 'UNTRACKED_PATH'
  /** Nothing was staged, so there was nothing to commit. */
  | 'NOTHING_TO_COMMIT'
  /** Anything else the engine reported. */
  | 'GIT_FAILED'
