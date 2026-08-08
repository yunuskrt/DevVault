/**
 * Which Git stage holds *this computer's* version of a conflicted file.
 *
 * This is the most dangerous 20 lines in the series. Getting it backwards
 * silently discards the user's work — the spec calls it "the worst failure this
 * whole series can produce" — so the table below was **measured against Git
 * 2.39.3**, not reasoned about. Every row was produced by driving the real
 * command and reading `git show :2:` / `:3:` back.
 *
 * | State                     | marker             | stage 2 (`--ours`) | stage 3 (`--theirs`) | mine |
 * | ------------------------- | ------------------ | ------------------ | -------------------- | ---- |
 * | `git merge`               | `MERGE_HEAD`       | **mine**           | incoming             | 2    |
 * | `git cherry-pick`         | `CHERRY_PICK_HEAD` | **mine** (HEAD)    | picked commit        | 2    |
 * | `git revert`              | `REVERT_HEAD`      | **mine** (HEAD)    | reverted commit      | 2    |
 * | `git pull --rebase`       | `rebase-merge/`    | other computer     | **mine**             | 3    |
 * | autostash restore failed  | *(none)*           | other computer     | **mine**             | 3    |
 *
 * **Stage 2 is always the HEAD side.** That single fact explains the whole
 * table: `merge`, `cherry-pick` and `revert` apply someone else's patch on top
 * of *our* branch, so HEAD is ours. A rebase is the other way round — Git checks
 * out the upstream and replays our commits onto it, so HEAD is *theirs*.
 *
 * The last row is the one that makes "invert during a rebase" — the rule the
 * spec states, and the obvious implementation — actively unsafe. When
 * `--autostash` or `merge.autoStash` cannot reapply the user's uncommitted edits
 * (spec 6: Git prints "Applying autostash resulted in conflicts" and **exits
 * 0**), the rebase is already finished, so there is no marker left. HEAD is the
 * post-pull content and the user's own edit is the stashed side, stage 3 — the
 * same inversion as a rebase, arrived at with `operation === null`. Keying on
 * the marker alone would hand "Keep mine" the other computer's file and throw
 * the user's uncommitted work away without a word.
 *
 * Pure and free of `server-only`, following `commit-message.ts`: the rule is
 * worth testing directly against a literal, without a repository in the way.
 */

import type { ConflictSide, GitOperation } from '@/lib/git/types'

/*
 * `ConflictSide` is `'mine' | 'theirs'` and deliberately never `'ours'`. The
 * spec requires the UI to read "Keep this computer's version" rather than a Git
 * flag name, and typing the seam that way carries the guarantee all the way
 * down: no caller can pass a raw `--ours` by mistake, because the type does not
 * accept one. The translation happens once, below.
 */

/** Git's numbered merge stages, as `git show :N:<path>` addresses them. */
export type ConflictStage = 2 | 3

/**
 * Whether HEAD is our own work in this state — the whole of the table above.
 *
 * `null` covers the autostash-restore case and is deliberately grouped with
 * `rebase` rather than defaulting to the `merge` behaviour. If a state ever
 * reaches here that is neither, the conservative reading is still the right
 * one: DevVault only ever produces conflicts by syncing, and every sync path it
 * has leaves our work on stage 3.
 */
const headIsMine = (operation: GitOperation | null): boolean =>
  operation === 'merge' || operation === 'cherry-pick' || operation === 'revert'

/** The stage holding `side`'s content, given what the repository is doing. */
export const stageFor = (
  operation: GitOperation | null,
  side: ConflictSide,
): ConflictStage => {
  const mine: ConflictStage = headIsMine(operation) ? 2 : 3
  return side === 'mine' ? mine : mine === 2 ? 3 : 2
}

/**
 * The `git checkout` flag that writes `side` into the working tree.
 *
 * Derived from `stageFor` rather than written out again, so the two cannot
 * disagree: `--ours` *is* stage 2 and `--theirs` *is* stage 3, by definition.
 */
export const checkoutFlagFor = (
  operation: GitOperation | null,
  side: ConflictSide,
): '--ours' | '--theirs' =>
  stageFor(operation, side) === 2 ? '--ours' : '--theirs'
