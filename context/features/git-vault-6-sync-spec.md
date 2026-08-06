# Git Vault 6 — Remote Synchronization

Spec 6 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

One **Sync** button that does the right thing: fetch, work out what state the
repository is in, and pull or push accordingly. This is what makes the vault
usable from a second computer, which is the feature the whole project exists for.

Requires spec 5 — there is nothing to push until commits happen.

## Requirements

### Never call `git pull` blind

Fetch, inspect, then decide (§5.6):

```ts
await git.fetch()
const { ahead, behind, tracking } = await git.status()

if (!tracking)          → { kind: 'no-remote' }
if (!ahead && !behind)  → { kind: 'up-to-date' }
if (behind && !ahead)   → merge --ff-only, then { kind: 'pulled', commits: behind }
if (ahead && !behind)   → push,           then { kind: 'pushed', commits: ahead }
if (ahead && behind)    → diverged, see below
```

Isolate the fast-forward case deliberately: **it cannot produce a conflict**.
On a single-user vault it is also the overwhelmingly common one, so routing it
through a path with no failure mode is most of the reliability this feature will
ever have.

### Diverged histories

`git pull --rebase --autostash`.

A DevVault vault is one person's notes on two machines. Rebase replays the local
commits on top of the remote's, giving linear, readable history rather than merge
commits littering a knowledge repository. `--autostash` covers the very likely
case that the user has uncommitted edits when they press Sync.

If the rebase stops on a conflict, this spec's job is to **detect it and stop
cleanly**, returning `{ kind: 'conflict', paths }`. Resolution is spec 7. Until
then, the honest behaviour is: report the conflict, tell the user the vault is
mid-rebase, and offer `git rebase --abort` as a way out. Do not leave them in a
state the UI cannot describe.

### First push

A branch with no upstream needs `push -u origin <branch>`. Detect it (`tracking`
is null but a remote exists) rather than letting the plain push fail with a Git
suggestion string.

Distinguish "no remote configured at all" from "remote exists, branch not
tracked" — they are different messages and different fixes.

### `syncVault` Server Action

`'use server'`, returning `{ success, data: SyncOutcome, error }`.

Goes through the same write queue as spec 5's mutations — a sync running
concurrently with a commit is exactly the `index.lock` collision the queue
exists for.

Sync can take seconds on a slow network. A Server Action is fine; the 20s
`timeout.block` from spec 4 bounds it. If clone-on-first-run ever needs a
progress bar, that is a streaming Route Handler (§6.2) and not this spec.

`revalidatePath('/', 'layout')` after any outcome that changed the working tree —
a pull changes the items themselves, so the whole app must re-read.

### The Sync button

`GitSyncPanel`'s `Sync` control becomes real. `useTransition` for pending,
spinner state from §7.1.

Outcomes reach the user as (§7.3):

| Outcome | UI |
| --- | --- |
| `up-to-date` | toast "Already up to date" |
| `pulled` | toast "Pulled N changes", app re-renders with new items |
| `pushed` | toast "Pushed N commits" |
| `synced` | toast with both counts |
| `no-remote` | toast "No remote configured" |
| `conflict` | **no toast** — route to the conflict state (spec 7) |
| error | toast with the mapped message; panel enters its error state |

A conflict must not be a toast. A toast vanishes, and a vault mid-rebase is a
state the user has to be told about until they resolve it.

**Do not make sync optimistic** (§7.5). A push that "succeeded" in the UI and
failed on disk is precisely the lie that makes a sync tool untrustworthy.

### Startup state check

Detect a vault left mid-operation by a previous session — `.git/MERGE_HEAD`,
`.git/REBASE_HEAD` — and surface it rather than letting the next Sync fail
confusingly. Uncommitted changes at startup are normal; a half-finished rebase
is not (§9.7).

## Verification

Set up a second clone of the seeded vault as the "other computer" and drive real
states:

1. Both in sync: Sync says "Already up to date", no commits created.
2. Commit in the other clone and push: Sync pulls, the item appears in the app,
   the toast count is right.
3. Commit locally: Sync pushes, the other clone sees it.
4. Commit on both sides without conflicting (different files): Sync rebases
   cleanly, history is linear (`git log --graph` has no merge commit), both
   changes present.
5. Commit on both sides **to the same item**: Sync returns `conflict`, the panel
   shows the conflict state, and the vault is in a describable state.
   `git rebase --abort` from the UI or the terminal recovers cleanly.
6. Uncommitted local edits during a pull: `--autostash` restores them afterwards
   — verify the edits are actually still there.
7. No remote: correct message, no crash.
8. Remote unreachable (bad URL or offline): mapped error message, no hang beyond
   the timeout, no credential leakage in the message.
9. Fresh branch with no upstream: first push sets it.
10. Sync and commit fired concurrently: both complete, no `index.lock` error.
11. `npm run build` passes, `tsc --noEmit` clean.

## Out of scope

- Resolving conflicts — spec 7. Detecting and reporting them is in scope.
- Clone / init / remote configuration UI. `devvault init` is todo phase 4; for
  now the vault is set up by hand in a terminal.
- Branch switching, multi-remote, multi-vault — todo phase 6.
- Background or scheduled auto-sync. Sync is user-initiated.

## References

- @docs/git-vault-architecture.md — §5.5–5.6, §5.9, §7.1, §7.3, §7.5, §9.7
- @context/features/git-vault-0-overview.md · @context/features/git-vault-4-git-read-spec.md
- @src/components/dashboard/GitSyncPanel.tsx
