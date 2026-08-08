import { describe, expect, it } from 'vitest'

import { checkoutFlagFor, stageFor } from '@/lib/git/conflict-sides'
import type { GitOperation } from '@/lib/git/types'

/**
 * The measured table from `conflict-sides.ts`, pinned.
 *
 * These assertions are *not* self-evident and must never be "corrected" by
 * reasoning: every row was produced by driving the real Git command and reading
 * `git show :2:` / `:3:` back on Git 2.39.3. `conflicts.test.ts` re-derives the
 * same answers from live repositories, so if Git's behaviour ever changed, that
 * suite would fail alongside this one rather than this one quietly encoding a
 * stale belief.
 *
 * Getting this backwards silently discards the user's work, which is the worst
 * failure the whole series can produce — hence a dedicated file for twenty
 * lines of logic.
 */

/** operation → the stage holding *this computer's* version. */
const MEASURED: [GitOperation | null, 2 | 3][] = [
  // HEAD is our own branch; the other side is being applied on top of it.
  ['merge', 2],
  ['cherry-pick', 2],
  ['revert', 2],
  // HEAD is the upstream and our commits are what get replayed onto it.
  ['rebase', 3],
  // A failed autostash restore. The rebase or fast-forward already finished, so
  // there is no marker left at all — HEAD is the post-pull content and the
  // user's uncommitted edit is the stashed side. This row is why the rule
  // cannot be "invert during a rebase".
  [null, 3],
]

describe('stageFor', () => {
  it.each(MEASURED)('with %s, mine is stage %i', (operation, mineStage) => {
    expect(stageFor(operation, 'mine')).toBe(mineStage)
  })

  it.each(MEASURED)('with %s, theirs is the other stage', (operation, mineStage) => {
    expect(stageFor(operation, 'theirs')).toBe(mineStage === 2 ? 3 : 2)
  })

  it('never maps both sides to the same stage', () => {
    // The failure that would silently resolve every conflict to one side.
    for (const [operation] of MEASURED) {
      expect(stageFor(operation, 'mine')).not.toBe(stageFor(operation, 'theirs'))
    }
  })
})

describe('checkoutFlagFor', () => {
  it('inverts against Git’s own flag names during a rebase', () => {
    // The headline hazard, stated as an assertion: the same user-facing
    // request maps to *opposite* Git flags depending on the operation.
    expect(checkoutFlagFor('merge', 'mine')).toBe('--ours')
    expect(checkoutFlagFor('rebase', 'mine')).toBe('--theirs')
  })

  it('treats a missing operation like a rebase, not like a merge', () => {
    // The autostash-restore case. If this ever flips to `--ours`, "Keep mine"
    // starts throwing the user's uncommitted edits away.
    expect(checkoutFlagFor(null, 'mine')).toBe('--theirs')
    expect(checkoutFlagFor(null, 'theirs')).toBe('--ours')
  })

  it('agrees with stageFor by construction', () => {
    const operations: (GitOperation | null)[] = [
      'merge',
      'rebase',
      'cherry-pick',
      'revert',
      null,
    ]

    for (const operation of operations) {
      for (const side of ['mine', 'theirs'] as const) {
        const expected = stageFor(operation, side) === 2 ? '--ours' : '--theirs'
        expect(checkoutFlagFor(operation, side)).toBe(expected)
      }
    }
  })
})
