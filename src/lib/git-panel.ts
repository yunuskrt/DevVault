/**
 * `GitStatusResult` in, `GitPanelState` out — the §7.1 table as one pure
 * function.
 *
 * Lives beside `dashboard-mappers.ts` rather than inside `lib/git/` for the
 * same reason that module sits outside `lib/vault/`: everything in `lib/git/`
 * runs a subprocess and carries `import 'server-only'`, and this touches
 * neither Git nor the filesystem. Keeping it out means the rule "every module
 * in `lib/git/` is server-only" stays true without exception, and this stays
 * testable with a literal.
 */

import { formatRelativeTime, pluralize } from '@/lib/format'
import type { GitErrorCode, GitStatus, GitStatusResult } from '@/lib/git/types'
import type { GitPanelState } from '@/types/dashboard'

/**
 * How many files are uncommitted.
 *
 * A `Set` because the arrays overlap: a file that is staged *and* modified
 * since staging appears in both, and counting the arrays' lengths would report
 * it twice. Untracked files are included — on a freshly initialised vault they
 * are the only thing there is.
 */
const changedFileCount = (status: GitStatus): number =>
  new Set([
    ...status.staged,
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.untracked,
  ]).size

/**
 * The terse label each failure gets. Keyed by `GitErrorCode` rather than
 * `string`, so adding a code without deciding how it reads is a compile error.
 */
const FAILURE_SUMMARY: Record<GitErrorCode, string> = {
  GIT_NOT_INSTALLED: 'Git missing',
  NOT_A_REPOSITORY: 'No repository',
  IDENTITY_UNSET: 'Setup needed',
  INDEX_LOCKED: 'Git busy',
  TIMEOUT: 'Git timed out',
  AUTH_FAILED: 'Auth failed',
  GIT_FAILED: 'Git error',
}

export const toGitPanelState = (
  result: GitStatusResult,
  now: number = Date.now(),
): GitPanelState => {
  if (!result.ok) {
    return {
      // A missing repository is a normal state for a vault that was seeded but
      // never `git init`ed, so it reads as a prompt rather than a failure.
      icon: result.code === 'NOT_A_REPOSITORY' ? 'no-repo' : 'error',
      tone: result.code === 'GIT_NOT_INSTALLED' ? 'danger' : 'warn',
      branch: null,
      summary: FAILURE_SUMMARY[result.code],
      detail: null,
      description: result.message,
      canSync: false,
    }
  }

  const { status, lastCommit } = result
  const branch = status.branch || 'detached HEAD'
  const tracking = status.tracking ?? 'the remote'
  const detail = lastCommit
    ? `Last commit ${formatRelativeTime(lastCommit.date, now)}`
    : 'No commits yet'
  const base = { branch, detail, canSync: status.tracking !== null } as const

  /*
   * Precedence, most actionable first. The §7.1 conditions overlap freely — a
   * branch can be dirty *and* ahead *and* behind — so the table is read as an
   * ordered list rather than a set of exclusive cases.
   */

  if (status.conflicted.length > 0) {
    const count = status.conflicted.length
    return {
      ...base,
      icon: 'conflict',
      tone: 'danger',
      summary: pluralize(count, 'conflict'),
      description: `${pluralize(count, 'file')} in conflict on ${branch}. Resolve before committing.`,
    }
  }

  if (!status.isClean) {
    const count = changedFileCount(status)
    return {
      ...base,
      icon: 'uncommitted',
      tone: 'warn',
      summary: `${count} uncommitted`,
      description: `${pluralize(count, 'file')} changed on ${branch} and not yet committed.`,
    }
  }

  if (status.ahead > 0 && status.behind > 0) {
    return {
      ...base,
      icon: 'diverged',
      tone: 'warn',
      summary: `${status.ahead}↑ ${status.behind}↓`,
      description: `Branch ${branch} is ${status.ahead} ahead and ${status.behind} behind ${tracking}.`,
    }
  }

  if (status.ahead > 0) {
    return {
      ...base,
      icon: 'ahead',
      tone: 'info',
      summary: `${status.ahead} to push`,
      description: `${pluralize(status.ahead, 'commit')} on ${branch} not yet pushed to ${tracking}.`,
    }
  }

  if (status.behind > 0) {
    return {
      ...base,
      icon: 'behind',
      tone: 'info',
      summary: `${status.behind} to pull`,
      description: `${pluralize(status.behind, 'commit')} on ${tracking} not yet pulled into ${branch}.`,
    }
  }

  if (status.tracking === null) {
    return {
      ...base,
      icon: 'local-only',
      tone: 'info',
      summary: 'Local only',
      description: `Branch ${branch} has no remote. Commits stay on this machine.`,
    }
  }

  return {
    ...base,
    icon: 'synced',
    tone: 'ok',
    summary: 'Synced',
    description: `Branch ${branch} is up to date with ${tracking}.`,
  }
}
