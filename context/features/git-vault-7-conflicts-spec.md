# Git Vault 7 — Conflicts and Robustness

Spec 7 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

Close out phase 1: resolve merge conflicts from inside the app, surface vault
files that failed to parse, and notice when the vault changes underneath the
process.

`coding-standards.md` is unambiguous here — *"Handle Git conflicts explicitly and
never silently overwrite user changes"* — and until this spec ships, a conflicted
vault is a state the app can describe but not exit.

Requires spec 6.

## Requirements

### Conflict detection

`GitStatus.conflicted` is non-empty, or a merge/rebase command rejects.
`simple-git` throws `GitResponseError` carrying a parsed `MergeSummary` in
`err.git` (§5.7).

Map each conflicted path back to its item where possible, so the UI can say
*"useDebounce hook"* rather than *"snippets/use-debounce-hook.md"*. A conflicted
file may not parse — fall back to the path and do not crash on it.

### Resolution primitives

Add to `GitService` (§5.7):

| Method | Git |
| --- | --- |
| `resolve(path, 'ours')` | `git checkout --ours <path>` then `git add <path>` |
| `resolve(path, 'theirs')` | `git checkout --theirs <path>` then `git add <path>` |
| `readConflictSides(path)` | `git show :2:<path>` / `git show :3:<path>` |
| `abortMerge()` | `git merge --abort` / `git rebase --abort` |
| `continueRebase()` | `git rebase --continue` |

Note that "ours" and "theirs" **invert during a rebase** — your local commits are
being replayed, so `--ours` is the upstream side. Getting this backwards silently
discards the user's work, which is the worst failure this whole series can
produce. Verify it against a real rebase conflict rather than reasoning about it,
and label the UI by meaning ("Keep this computer's version") rather than by the
Git flag name.

### Conflict UI

A dedicated view — route or full-screen dialog — reached from the panel's
conflict state. Per conflicted file: the item title where resolvable, the path,
and **Keep mine** / **Keep theirs** / **Open in editor**. Footer: **Complete
merge**, enabled only when nothing remains conflicted, and **Abort**.

Showing both sides side by side is a nice-to-have. The three actions are the
requirement.

Because items are one file each with stable frontmatter serialization, a conflict
is nearly always "this item changed on both machines", which makes per-item
keep-mine/keep-theirs genuinely adequate. That is the payoff of the §3.4 decision
not to keep a central index file.

**While a conflict is open, block writes to the conflicted paths.** A conflict
resolved implicitly by a later save is exactly the silent overwrite the standards
forbid.

### Vault error surface

`VaultLoadResult.errors` has been populated since spec 1 and logged since spec 3.
Give it a persistent UI: an affordance in the sidebar showing a count, opening a
list of `{ path, message }`.

Persistent, not a toast. These are files the user must fix by hand in an editor,
and a message that vanishes after four seconds is useless for that.

Message quality matters here: *"`snippets/foo.md` could not be read: `type` is
missing"*, not a raw Zod dump.

### File watcher (optional)

`chokidar` on the vault root, ignoring `.git/` and `.devvault/cache/`, debounced
~300ms, calling `revalidatePath('/', 'layout')`.

`force-dynamic` already re-reads on every navigation, so this only matters for a
page sitting idle while the user edits the vault in another window. Judge whether
it earns its complexity.

Two traps if you build it: instantiate once behind a `globalThis` singleton or
the dev server's hot reload stacks watchers, and ignore `.git/` — it churns
constantly during every Git operation and would otherwise trigger a revalidation
storm mid-commit (§6.4).

### Robustness sweep

- Stale `index.lock` from a crashed process: detect and report, do not hang.
- Mid-operation vault at startup (`MERGE_HEAD` / `REBASE_HEAD`): surfaced from
  spec 6; make sure it routes into the conflict view built here.
- Every error path in §7.6 has a mapped, human message. Audit the table.
- Confirm no raw stderr, repository path or credential-bearing URL reaches the
  browser in any error state.

## Verification

Drive real conflicts against a second clone:

1. Edit the same item on both sides, sync: conflict view lists exactly that item,
   by title.
2. **Keep mine** resolves to the local content — verify by reading the file, not
   by trusting the label. Repeat for **Keep theirs**.
3. Do the same during a *rebase* conflict specifically, and confirm the sides are
   not inverted. This is the check the whole spec turns on.
4. Two conflicted files: **Complete merge** stays disabled until both are
   resolved.
5. **Abort** returns the vault to its pre-sync state with local commits intact.
6. Attempting to save an item while its file is conflicted is blocked with a
   clear message.
7. Corrupt two vault files by hand: the error affordance shows 2, names both
   paths with actionable messages, and the other 10 items still render.
8. Fix one by hand: the count drops to 1 without restarting the app.
9. If the watcher is built: edit a file in an editor with the app idle on `/`,
   and see the change without navigating.
10. Baseline counts hold for a clean vault.
11. `npm run build` passes, `tsc --noEmit` clean.

## Out of scope

- A three-way merge editor. Keep mine / keep theirs / open in editor is the
  scope; a diff view inside DevVault is not.
- Per-item history and version restore — todo phase 6.
- Multi-vault management — todo phase 6.
- `devvault init` — todo phase 4.

## After this spec

`context/todo.md` phase 1 is complete. Update it: mark the phase done, remove the
"Decide first" block (every question in it is answered in
@context/features/git-vault-0-overview.md and @docs/git-vault-architecture.md),
and confirm the carried-over gaps list is still accurate.

Phase 2 (the item detail drawer) then sits on a real data layer, and its
**Commit changes** footer already has an action to call.

## References

- @docs/git-vault-architecture.md — §5.7, §6.4, §7.4, §7.6, §9.7
- @context/features/git-vault-0-overview.md · @context/features/git-vault-6-sync-spec.md
- @context/coding-standards.md — "never silently overwrite user changes"
