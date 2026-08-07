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
 * Only `status` and `log` are implemented in this spec. The rest are declared
 * now so specs 5–7 fill in a shape that already exists rather than each
 * inventing its own; every unimplemented method throws until then.
 */
export interface GitService {
  status(): Promise<GitStatus>
  log(opts?: { path?: string; limit?: number }): Promise<GitCommit[]>
  stage(paths: string[]): Promise<void>
  commit(message: string): Promise<{ hash: string }>
  sync(): Promise<SyncOutcome>
  fileAtRevision(path: string, hash: string): Promise<string>
  discard(paths: string[]): Promise<void>
  resolve(path: string, side: 'ours' | 'theirs'): Promise<void>
}

/**
 * What a caller gets back when it asks for the vault's Git state.
 *
 * A union rather than an exception because every failure here is a state the
 * panel has to *render* — no Git installed, no repository, no identity — not
 * an exceptional condition that should take a page down with it.
 */
export type GitStatusResult =
  | { ok: true; status: GitStatus; lastCommit: GitCommit | null }
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
  /** Anything else the engine reported. */
  | 'GIT_FAILED'
