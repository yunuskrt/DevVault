# Git Vault 4 — Git Service, Read Only

Spec 4 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

Introduce `src/lib/git/` and make `GitSyncPanel` tell the truth.

Read-only on purpose: this spec runs `status`, `log` and a few `config` reads and
nothing else. No commit, no push, no pull. Nothing in the user's repository can
be damaged by a bug in it, which makes it the right place to get the engine, the
error mapping and the subprocess plumbing wrong a few times.

Requires spec 3 — the vault must be a real repository before its status means
anything.

## Decisions this spec implements

**Engine: `simple-git`.** Reasoning in @docs/git-vault-architecture.md §2.2–2.5.
The short version: it wraps the system `git` binary, so SSH keys, `osxkeychain`,
`gh auth` and any configured `credential.helper` work untouched and **DevVault
stores no credentials at all**. `isomorphic-git` has no SSH transport whatsoever
and would require the app to own a token store.

This contradicts two existing documents. Correct them in this spec:

- `context/project-overview.md` — tech stack table, Git row currently reads
  `isomorphic-git / Git`.
- `context/todo.md` — phase 1 bullet naming `isomorphic-git`.

Leave `context/current-feature.md` history entries alone; they are a record of
what was true when written.

## Requirements

### Dependencies

Add `simple-git`. It is pure JS spawning a subprocess, so no `serverExternalPackages`
entry should be needed — but if Turbopack mis-bundles it, add it and note why
(§6.3).

### `src/lib/git/types.ts`

The seam. **No `simple-git` import in this file.** `GitStatus`, `GitCommit`,
`SyncOutcome` and the `GitService` interface exactly as in §4.3. Later specs code
against this interface, so a change of engine is one file and a test double has
somewhere to plug in.

This spec implements only `status()` and `log()`. Declare the rest on the
interface anyway — specs 5–7 fill them in, and having the shape visible now stops
each of those specs inventing its own.

### `src/lib/git/simple-git-service.ts`

`import 'server-only'` at the top.

Construct one instance per vault root:

```ts
simpleGit({
  baseDir: root,
  timeout: { block: 20_000 },
  config: [],
})
```

and set `GIT_TERMINAL_PROMPT=0` in the spawn environment so Git fails fast
instead of blocking a request on an invisible password prompt (§5.9).

- `status()` — one `git.status()` call mapped to `GitStatus`. `simple-git` runs
  `git status --porcelain=v2 --branch`, giving branch, upstream, ahead/behind and
  every changed path in a single subprocess.
- `log({ path?, limit? })` — for the panel's "last commit" timestamp and, later,
  item history. Use `--follow` when a path is given (§3.2 lets paths change).
- Repository preflight, run once and cached for the process: `git --version`
  present, `checkIsRepo()` true, `user.name` and `user.email` configured. A vault
  directory that is not a Git repository is a normal state (spec 1's seed script
  does not `git init`) and must be reported as such, not crashed on.

### `src/lib/git/errors.ts`

Map engine failures to a typed union and then to the user-facing strings in §7.6.
Never let raw stderr reach the browser, and redact credentials out of remote URLs
before anything is logged or displayed (`https://user:token@host/…`).

The cases that matter here: git not installed, not a repository, identity not
configured, stale `index.lock`, timeout.

### `GitSyncPanel`

Replace the hardcoded `main` / `Synced` / `Last push 2m ago`. States and their
conditions are tabulated in §7.1: clean-and-synced, uncommitted, ahead, behind,
diverged, conflict, no-remote, plus a not-a-repo state this spec adds.

`GitSyncPanel` renders inside `SidebarContent`, a client component, so status
arrives as a prop from the server `layout.tsx` — the same threading spec 2 built
for nav data. Extend `SidebarNav`, or add a sibling prop; do not fetch from the
client.

The collapsed rail variant currently shows one icon and an `sr-only` label. It
needs an equivalent one-icon summary per state, and the `sr-only` text must
describe the real state rather than the current hardcoded "Branch main, synced".

The `Sync` control stays **display-only** in this spec. Spec 6 wires it.

Recompute status on navigation and after mutations. **Do not poll on a timer.**

## Verification

Exercise real repository states against the seeded vault:

1. `git init` the vault, no commits: panel shows the uncommitted/untracked state
   with the right file count.
2. Commit everything: panel goes clean, branch name correct, last-commit time
   correct and relative.
3. No remote configured: `Local only`.
4. Add a remote and push manually from a terminal, then commit locally without
   pushing: panel shows ahead by 1.
5. Commit on the remote and `git fetch` from a terminal: panel shows behind by 1.
6. Both: diverged.
7. Point `DEVVAULT_PATH` at a plain directory that is not a repository: the panel
   says so and the app still renders every item.
8. Temporarily unset `user.email`: the error message names the fix, and nothing
   leaks a stack trace to the browser.
9. Collapse the rail: state is still distinguishable, `sr-only` text accurate.
10. Card counts across all routes unchanged from the baseline — this spec reads
    Git, not the vault, and must not disturb item rendering.
11. `npm run build` passes, `tsc --noEmit` clean.

## Out of scope

- Any operation that writes: stage, commit, push, pull, merge — specs 5 and 6.
- The Sync button doing anything.
- Conflict resolution UI — spec 7. Detecting the conflict *state* for the panel
  is in scope; acting on it is not.
- Per-item history UI — todo phase 6.

## References

- @docs/git-vault-architecture.md — §2 (engine), §4.3 (interface), §5.1–5.2, §5.9, §7.1, §7.6
- @context/features/git-vault-0-overview.md
- @src/components/dashboard/GitSyncPanel.tsx
- @context/screenshots/dashboard-ui-drawer.png — the panel in the sidebar
