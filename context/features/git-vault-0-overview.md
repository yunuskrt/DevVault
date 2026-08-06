# Git Vault — Spec Series Overview

`context/todo.md` phase 1 ("Git repository as source of truth") split into seven
specs. Each one is a separate `/feature` run, a separate branch and a separate
commit. Each leaves `npm run build` passing and the app usable.

Design reference for all seven: **@docs/git-vault-architecture.md**.
Section numbers cited in the specs (§3.2, §5.6, …) refer to that document.

---

## The sequence

| # | Spec | Delivers | App visibly changes? |
| --- | --- | --- | --- |
| 1 | @context/features/git-vault-1-foundation-spec.md | `lib/vault/`, `lib/filesystem/`, `lib/markdown/`, Zod schemas, seed script | No — mock data still renders the UI |
| 2 | @context/features/git-vault-2-sidebar-data-spec.md | Nav data threaded from `layout.tsx` into the client sidebar | No — pure refactor, identical output |
| 3 | @context/features/git-vault-3-read-model-spec.md | The app reads the vault off disk; `mock-data.ts` deleted | No — same 12 items, different source |
| 4 | @context/features/git-vault-4-git-read-spec.md | `lib/git/`, `GitService`, real `GitSyncPanel` | Yes — branch/status stop being hardcoded |
| 5 | @context/features/git-vault-5-write-commit-spec.md | Server Actions that write items, explicit commit | Yes — Commit control in the sidebar |
| 6 | @context/features/git-vault-6-sync-spec.md | Fetch / pull / push behind one Sync button | Yes — Sync works |
| 7 | @context/features/git-vault-7-conflicts-spec.md | Conflict detection + resolution UI, vault-error surface | Yes — conflict view |

Specs 1–3 touch no Git at all. Specs 4–7 touch no vault-format decisions.
That split is deliberate: the two hard problems never land in the same branch.

---

## Decisions already made

These were settled before the specs were written. Do not re-open them mid-series;
if one turns out to be wrong, stop and change it here first.

**Git engine: `simple-git`** (spawns the system `git` binary), behind a
`GitService` interface so the engine is one file. Reasoning in §2.2–2.5 — in
short, it is the only option where SSH keys and credential helpers work, so
DevVault never stores a token. **This overrides `context/project-overview.md`
and `context/todo.md`, which both name `isomorphic-git`.** Spec 4 carries the
requirement to correct those two files.

**Vault location: the `DEVVAULT_PATH` environment variable.** `.env.local`
during development; `devvault start` sets it once the CLI exists (todo phase 4).
Unset is a clear setup error, not a fallback to `process.cwd()` — the vault is a
different repository from this app.

**Item `id`: a slug derived from the title**, stable across later title edits,
`-2`/`-3` on collision. The filename is user-visible in the Git repo and that is
the point of being Git-native. §3.2.

**Seed data: today's 12 items and 6 collections**, written to disk as real
Markdown by a seed script. Every verification baseline recorded in
`context/current-feature.md` survives as a regression check across all seven
specs. §8.

**Vault layout, frontmatter, collection storage, binary sidecars:** §3.
**Commit granularity: write-through to disk, commit explicitly** (§7.2) — the
model the drawer screenshot already sells.

---

## The regression baseline

Every spec verifies against the same numbers, recorded in
`context/current-feature.md` and true of the app today. If a spec changes one of
them, that is a bug in the spec unless it says otherwise.

- Cards: `/` 21 · `/favorites` 5 · `/collections` 6 · `react-patterns` 2 ·
  `devops-commands` 4 · `context-files` 3 · `resources-links` 0 ·
  `/items/snippet` 3 · `command` 2 · `url` 1 · `image` 1
- Stats row: 12 items / 6 collections / 5 favorites / 3 pinned
- Sidebar: React Patterns `#3b82f6`, AI Prompts `#a855f7`,
  DevOps & Commands `#f59553`, in that order
- `/collections` dots: 3 × `#3b82f6`, 2 × `#a855f7`, 2 × `#f59553`,
  1 × `#eab308`, plus one muted
- 13 item-card accent gradients on `/` (4 blue, 3 purple, 2 pink,
  1 each green/grey/yellow/orange)
- `/collections/nope` 404s · "New Snippet" renders on exactly one route

---

## Standing constraints

From `context/coding-standards.md`, applying to every spec in the series:

- `lib/git/` and `lib/filesystem/` begin with `import 'server-only'`.
  Nothing in `src/components/` imports either, ever.
- Server Actions return `{ success, data, error }` and validate input with Zod.
- Never surface raw stderr, stack traces, repository paths or credentials to the
  browser. Remote URLs can embed tokens — redact before logging.
- Git conflicts are never resolved silently.
- Commit messages: `Add note: Docker networking`, `Update snippet: pandas filter`,
  `Delete prompt: code review`.
