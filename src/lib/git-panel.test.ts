import { describe, expect, it } from 'vitest'

import { toGitPanelState } from '@/lib/git-panel'
import { GIT_PANEL_ICONS } from '@/lib/nav-icons'
import type {
  GitOperation,
  GitStatus,
  GitStatusResult,
} from '@/lib/git/types'

/*
 * `toGitPanelState` is the §7.1 table. It takes a `GitStatusResult` and returns
 * finished strings, so it needs no repository, no subprocess and no clock —
 * which is exactly why the table lives in a pure function rather than in the
 * component.
 */

const NOW = Date.parse('2026-08-07T12:00:00Z')

const clean: GitStatus = {
  branch: 'main',
  tracking: 'origin/main',
  ahead: 0,
  behind: 0,
  staged: [],
  modified: [],
  created: [],
  deleted: [],
  conflicted: [],
  untracked: [],
  renamed: [],
  isClean: true,
}

const ok = (
  overrides: Partial<GitStatus>,
  lastCommit: { date: string } | null = null,
  extras: { hasRemote?: boolean; operation?: GitOperation | null } = {},
): GitStatusResult => ({
  ok: true,
  status: { ...clean, ...overrides },
  lastCommit: lastCommit
    ? { hash: 'abc', message: 'm', author: 'a', date: lastCommit.date }
    : null,
  /*
   * A tracked branch implies a remote; the interesting case is a remote with
   * *no* upstream, which the tests below pass explicitly.
   *
   * `in` rather than `??` on `overrides.tracking`: the whole point of most of
   * these cases is `tracking: null`, and `??` would read that as "not
   * overridden" and fall back to the tracked default.
   */
  hasRemote:
    extras.hasRemote ??
    ('tracking' in overrides ? overrides.tracking : clean.tracking) !== null,
  operation: extras.operation ?? null,
})

describe('toGitPanelState — repository states', () => {
  it('reports a clean tracked branch as synced', () => {
    const state = toGitPanelState(ok({}), NOW)

    expect(state.summary).toBe('Synced')
    expect(state.icon).toBe('synced')
    expect(state.tone).toBe('ok')
    expect(state.branch).toBe('main')
    expect(state.description).toBe('Branch main is up to date with origin/main.')
  })

  it('reports a clean untracked branch as local only, with no sync offered', () => {
    const state = toGitPanelState(ok({ tracking: null }), NOW)

    expect(state.summary).toBe('Local only')
    expect(state.icon).toBe('local-only')
    // Nothing to sync with, so the control must not render.
    expect(state.canSync).toBe(false)
  })

  it('distinguishes "no remote" from "never pushed" (§5.5)', () => {
    /*
     * `git status` reports these identically — no upstream either way — but one
     * needs `git remote add` and the other needs a click. Telling a user with a
     * perfectly good `origin` that their branch "has no remote" sends them to
     * fix something that is not broken. Caught in the browser on a fresh
     * branch, where the panel said exactly that.
     */
    const noRemote = toGitPanelState(ok({ tracking: null }), NOW)
    const neverPushed = toGitPanelState(
      ok({ branch: 'scratch', tracking: null }, null, { hasRemote: true }),
      NOW,
    )

    expect(noRemote.description).toContain('has no remote')
    expect(neverPushed.description).toBe(
      'Branch scratch has never been pushed. Sync to publish it to the remote.',
    )
    expect(neverPushed.summary).toBe('Not pushed')
    expect(neverPushed.description).not.toContain('has no remote')
  })

  it('offers sync whenever there is a remote, tracked or not', () => {
    expect(toGitPanelState(ok({}), NOW).canSync).toBe(true)
    expect(toGitPanelState(ok({ tracking: null }), NOW).canSync).toBe(false)

    /*
     * The case a `tracking !== null` test would get wrong. A vault with a
     * remote whose branch has never been pushed has no upstream — and that is
     * exactly the state `push -u` exists to fix (§5.5), so hiding Sync here
     * would leave the user no way to perform the first push at all.
     */
    expect(
      toGitPanelState(ok({ tracking: null }, null, { hasRemote: true }), NOW)
        .canSync,
    ).toBe(true)
  })

  it('withholds sync while an operation is suspended', () => {
    // Sync refuses outright mid-rebase (`OPERATION_IN_PROGRESS`), so offering
    // the control and then rejecting the click would be worse than hiding it.
    const state = toGitPanelState(ok({}, null, { operation: 'rebase' }), NOW)

    expect(state.canSync).toBe(false)
  })

  it('counts ahead and behind separately, with singular wording at one', () => {
    const ahead = toGitPanelState(ok({ ahead: 1 }), NOW)
    expect(ahead.summary).toBe('1 to push')
    expect(ahead.description).toBe(
      '1 commit on main not yet pushed to origin/main.',
    )

    const behind = toGitPanelState(ok({ behind: 3 }), NOW)
    expect(behind.summary).toBe('3 to pull')
    expect(behind.description).toBe(
      '3 commits on origin/main not yet pulled into main.',
    )
  })

  it('reports both directions at once as diverged', () => {
    const state = toGitPanelState(ok({ ahead: 2, behind: 1 }), NOW)

    expect(state.summary).toBe('2↑ 1↓')
    expect(state.icon).toBe('diverged')
    expect(state.description).toBe(
      'Branch main is 2 ahead and 1 behind origin/main.',
    )
  })

  it('names the branch when there is no upstream to name', () => {
    // `tracking` is null here, so the description must not say "null".
    const state = toGitPanelState(
      ok({ tracking: null, ahead: 1, isClean: true }),
      NOW,
    )

    expect(state.description).toBe('1 commit on main not yet pushed to the remote.')
  })

  it('falls back to a readable branch label on a detached HEAD', () => {
    // simple-git reports `current: null` when HEAD is detached, which maps to
    // an empty string. Rendering "Branch  is up to date" would be a bug.
    const state = toGitPanelState(ok({ branch: '' }), NOW)

    expect(state.branch).toBe('detached HEAD')
  })
})

describe('toGitPanelState — precedence', () => {
  /*
   * The §7.1 conditions overlap: a branch can be dirty *and* ahead *and*
   * behind at the same time, and a conflicted repository is always dirty too.
   * The table is therefore an ordered list, and these tests pin the order —
   * without them, a reordering of the `if` chain would silently change what
   * the panel reports on a real repository mid-merge.
   */

  it('puts a suspended operation above everything else, including conflicts', () => {
    /*
     * A conflicted file inside a rebase needs different advice than a
     * conflicted file on its own: committing is not available until the rebase
     * ends, and `git rebase --abort` undoes the whole sync. Reporting the plain
     * conflict state here would send the user to a control that cannot help.
     */
    const state = toGitPanelState(
      ok(
        {
          conflicted: ['notes/a.md'],
          modified: ['notes/a.md'],
          isClean: false,
          ahead: 1,
          behind: 1,
        },
        null,
        { operation: 'rebase' },
      ),
      NOW,
    )

    expect(state.summary).toBe('Rebase paused')
    expect(state.icon).toBe('paused')
    expect(state.tone).toBe('danger')
    expect(state.description).toContain('git rebase --abort')
    expect(state.description).toContain('1 file in conflict')
  })

  it('puts conflicts above everything else', () => {
    const state = toGitPanelState(
      ok({
        conflicted: ['notes/a.md'],
        modified: ['notes/a.md'],
        isClean: false,
        ahead: 1,
        behind: 1,
      }),
      NOW,
    )

    expect(state.summary).toBe('1 conflict')
    expect(state.tone).toBe('danger')
  })

  it('puts uncommitted work above ahead, behind and diverged', () => {
    const state = toGitPanelState(
      ok({ modified: ['notes/a.md'], isClean: false, ahead: 1, behind: 1 }),
      NOW,
    )

    expect(state.summary).toBe('1 uncommitted')
  })

  it('puts ahead and behind above local-only when a branch has both', () => {
    // An untracked branch cannot be ahead, but this pins that the tracking
    // check runs last rather than short-circuiting a real count.
    const state = toGitPanelState(ok({ ahead: 2 }), NOW)

    expect(state.summary).toBe('2 to push')
  })

  it('describes a suspended merge without conflicts, and names its own abort', () => {
    // A rebase stopped after the user staged their resolutions but before
    // `--continue`: nothing is conflicted, and the vault is still suspended.
    const state = toGitPanelState(ok({}, null, { operation: 'merge' }), NOW)

    expect(state.summary).toBe('Merge paused')
    expect(state.description).toBe(
      'Merge paused. Finish it, or run `git merge --abort` in your vault to undo it.',
    )
  })

  it('does not call a suspended rebase’s detached HEAD a branch', () => {
    /*
     * Git checks out a detached HEAD for the duration of a rebase and reports
     * the branch as the literal string `HEAD` — not the empty string the
     * fallback was written for. Caught in the browser, where the panel read
     * "1 file in conflict on HEAD".
     */
    const state = toGitPanelState(
      ok({ branch: 'HEAD', conflicted: ['notes/a.md'], isClean: false }, null, {
        operation: 'rebase',
      }),
      NOW,
    )

    expect(state.branch).toBe('detached HEAD')
    expect(state.description).not.toContain('HEAD')
    expect(state.description).toBe(
      'Rebase paused with 1 file in conflict. Resolve it, or run `git rebase --abort` in your vault to undo it.',
    )
  })
})

describe('toGitPanelState — uncommitted file count', () => {
  it('counts untracked files, which are all a fresh repository has', () => {
    /*
     * The reason `GitStatus` carries `untracked` at all. Straight after
     * `git init` every file is untracked and every other array is empty, so
     * without it the panel reports "0 uncommitted" while claiming the vault is
     * dirty. Verified against a real repository at 20 files.
     */
    const state = toGitPanelState(
      ok({
        untracked: ['notes/a.md', 'notes/b.md', 'snippets/c.md'],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).toBe('3 uncommitted')
    expect(state.description).toBe('3 files changed on main and not yet committed.')
  })

  it('ignores files DevVault does not manage', () => {
    /*
     * The bug this fixes, reported from a real vault: macOS wrote a `.DS_Store`
     * into it, the panel counted it and offered "1 uncommitted", and clicking
     * Commit answered "there is nothing to commit".
     *
     * §5.4 forbids staging files DevVault did not put there, so `commitAll`
     * had always filtered them — the count simply did not. The count and the
     * action have to describe the same set, and `isVaultManagedPath` is now
     * the single definition of it.
     */
    const state = toGitPanelState(
      ok({
        untracked: ['.DS_Store', 'scratch.txt', 'vendor/thing.md'],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).not.toBe('3 uncommitted')
    expect(state.icon).not.toBe('uncommitted')
  })

  it('counts only the managed files in a mixed set', () => {
    const state = toGitPanelState(
      ok({
        untracked: ['.DS_Store', 'notes/real.md', 'scratch.txt'],
        modified: ['snippets/other.md'],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).toBe('2 uncommitted')
  })

  it('reads as clean when only unmanaged files are dirty', () => {
    /*
     * Git calls the repository dirty; DevVault has nothing to commit. Falling
     * through to the ordinary states is what stops the button appearing with
     * no work to do — keying on `isClean` would have shown "0 uncommitted".
     */
    const state = toGitPanelState(
      ok({ untracked: ['.DS_Store'], isClean: false }),
      NOW,
    )

    expect(state.icon).toBe('synced')
    expect(state.summary).toBe('Synced')
  })

  it('counts a renamed file, which lands in no other array', () => {
    /*
     * The same class of bug as `untracked` above, and §3.2 makes it routine:
     * editing an item's title renames its file. The engine parses `R from ->
     * to` into a `renamed` array and into neither `staged`, `created` nor
     * `deleted`, so a vault whose only pending change is a renamed item would
     * otherwise offer to commit "0 files" while reporting itself dirty.
     */
    const state = toGitPanelState(
      ok({
        renamed: [{ from: 'notes/old.md', to: 'notes/new.md' }],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).toBe('1 uncommitted')
  })

  it('counts a rename as one file, not two', () => {
    // `git status` prints one line for it, and the user moved one item.
    const state = toGitPanelState(
      ok({
        renamed: [
          { from: 'notes/a.md', to: 'notes/b.md' },
          { from: 'notes/c.md', to: 'notes/d.md' },
        ],
        modified: ['notes/e.md'],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).toBe('3 uncommitted')
  })

  it('counts a file staged and then modified again only once', () => {
    // Git lists such a file in both arrays. Summing lengths would say 2.
    const state = toGitPanelState(
      ok({ staged: ['notes/a.md'], modified: ['notes/a.md'], isClean: false }),
      NOW,
    )

    expect(state.summary).toBe('1 uncommitted')
    expect(state.description).toBe('1 file changed on main and not yet committed.')
  })

  it('adds up distinct paths across every change kind', () => {
    const state = toGitPanelState(
      ok({
        staged: ['notes/a.md'],
        modified: ['snippets/b.md'],
        created: ['prompts/c.md'],
        deleted: ['commands/d.md'],
        untracked: ['collections/e.md'],
        isClean: false,
      }),
      NOW,
    )

    expect(state.summary).toBe('5 uncommitted')
  })
})

describe('toGitPanelState — last commit', () => {
  it('renders the commit date as a relative string against the given clock', () => {
    const state = toGitPanelState(
      ok({}, { date: '2026-08-07T10:00:00Z' }),
      NOW,
    )

    expect(state.detail).toBe('Last commit 2h ago')
  })

  it('says so when the repository has no commits yet', () => {
    // Real state: `git init` with nothing committed, where `git log` exits
    // non-zero and the service returns an empty array.
    expect(
      toGitPanelState(ok({ isClean: false, untracked: ['notes/a.md'] }), NOW).detail,
    ).toBe(
      'No commits yet',
    )
  })
})

describe('toGitPanelState — failures', () => {
  const failure = (
    code: Extract<GitStatusResult, { ok: false }>['code'],
  ): GitStatusResult => ({ ok: false, code, message: `message for ${code}` })

  it('passes the service message through untouched as the description', () => {
    // The §7.6 sentences are written once, in `errors.ts`. This mapper must not
    // paraphrase them — the tooltip is the only place the fix is spelled out.
    const state = toGitPanelState(failure('IDENTITY_UNSET'), NOW)

    expect(state.description).toBe('message for IDENTITY_UNSET')
    expect(state.summary).toBe('Setup needed')
  })

  it('treats a missing repository as a prompt rather than an error', () => {
    // Normal for a vault that was seeded but never `git init`ed, so it gets its
    // own icon instead of the alarming one.
    const state = toGitPanelState(failure('NOT_A_REPOSITORY'), NOW)

    expect(state.icon).toBe('no-repo')
    expect(state.summary).toBe('No repository')
  })

  it('escalates a missing Git binary to danger', () => {
    expect(toGitPanelState(failure('GIT_NOT_INSTALLED'), NOW).tone).toBe('danger')
  })

  it('offers no branch, no detail and no sync in any failure state', () => {
    const codes = [
      'GIT_NOT_INSTALLED',
      'NOT_A_REPOSITORY',
      'IDENTITY_UNSET',
      'INDEX_LOCKED',
      'TIMEOUT',
      'AUTH_FAILED',
      'GIT_FAILED',
    ] as const

    for (const code of codes) {
      const state = toGitPanelState(failure(code), NOW)

      expect(state.branch, code).toBeNull()
      expect(state.detail, code).toBeNull()
      expect(state.canSync, code).toBe(false)
      // Every code needs a label of its own; a blank footer is not a state.
      expect(state.summary, code).toBeTruthy()
    }
  })
})

describe('toGitPanelState — output contract', () => {
  it('only ever names an icon the sidebar can resolve', () => {
    // The icon crosses to the client as a key, so an unmapped one renders
    // nothing at all rather than failing loudly.
    const states = [
      toGitPanelState(ok({}), NOW),
      toGitPanelState(ok({ tracking: null }), NOW),
      toGitPanelState(ok({ ahead: 1 }), NOW),
      toGitPanelState(ok({ behind: 1 }), NOW),
      toGitPanelState(ok({ ahead: 1, behind: 1 }), NOW),
      toGitPanelState(ok({ isClean: false, untracked: ['notes/a.md'] }), NOW),
      toGitPanelState(ok({ isClean: false, conflicted: ['notes/a.md'] }), NOW),
      toGitPanelState(ok({}, null, { operation: 'rebase' }), NOW),
      toGitPanelState({ ok: false, code: 'NOT_A_REPOSITORY', message: 'm' }, NOW),
      toGitPanelState({ ok: false, code: 'GIT_FAILED', message: 'm' }, NOW),
    ]

    for (const state of states) {
      expect(GIT_PANEL_ICONS[state.icon], state.summary).toBeTruthy()
    }

    // Every icon reachable, so none of the map is dead weight.
    expect(new Set(states.map((s) => s.icon)).size).toBe(
      Object.keys(GIT_PANEL_ICONS).length,
    )
  })

  it('returns something Next.js can serialize into a client prop', () => {
    /*
     * The panel is a client component, so this object crosses the boundary.
     * Next.js catches a bad prop only at build time; this catches it in a unit
     * run and names the field. A `Date` or a `LucideIcon` slipping in here is
     * the realistic regression.
     */
    const state = toGitPanelState(ok({ ahead: 1 }, { date: '2026-08-07T10:00:00Z' }), NOW)

    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    for (const [key, value] of Object.entries(state)) {
      expect(['string', 'boolean'], key).toContain(
        value === null ? 'string' : typeof value,
      )
    }
  })
})
