# TODO

Ordered roadmap. Each numbered phase becomes one or more `/feature` specs in
`features/`. Nothing here is started.

---

## 1. Git repository as source of truth

Replace `src/lib/mock-data.ts` with real reads from a vault on disk. This is the
blocker for everything below it — search, CLI and AI all sit on top of it.

**Researched and specced.** Architecture: `docs/git-vault-architecture.md`.
Split into seven specs — see `features/git-vault-0-overview.md` for the series,
the decisions taken and the shared regression baseline.

| # | Spec | Delivers |
| --- | --- | --- |
| 1 | `features/git-vault-1-foundation-spec.md` | `lib/vault/`, `lib/filesystem/`, `lib/markdown/`, Zod, seed script |
| 2 | `features/git-vault-2-sidebar-data-spec.md` | Nav data off the client bundle, into props |
| 3 | `features/git-vault-3-read-model-spec.md` | App reads the vault; `mock-data.ts` deleted |
| 4 | `features/git-vault-4-git-read-spec.md` | `lib/git/`, `GitService`, real `GitSyncPanel` |
| 5 | `features/git-vault-5-write-commit-spec.md` | Server Actions that write; explicit commit |
| 6 | `features/git-vault-6-sync-spec.md` | Fetch / pull / push behind one Sync button |
| 7 | `features/git-vault-7-conflicts-spec.md` | Conflict resolution UI, vault-error surface |

**Decided** (was "decide first" — all open questions are now answered):

- **Engine: `simple-git`, not `isomorphic-git`.** It wraps the system `git`
  binary, so SSH keys and credential helpers work and DevVault stores no
  credentials. isomorphic-git has no SSH transport at all. Behind a `GitService`
  interface so the engine is one file. This supersedes the tech-stack row in
  `project-overview.md`; spec 4 corrects it.
- **Vault location:** the `DEVVAULT_PATH` env var. Unset is a setup error.
- **Layout:** type-grouped tree as in `project-overview.md`, plus
  `collections/` and `.devvault/`. Nested folders allowed, and are not collections.
- **Collections:** one `.md` per collection. `updatedAt` derived from member
  items, not stored — storing it means every item save rewrites collection files.
- **Item `id`:** a title slug in frontmatter, stable across later title edits,
  `-2`/`-3` on collision. The path may go stale; the id may not.
- **`pinned` / `favorite` / `createdAt` / `updatedAt`:** in frontmatter, yes.
- **Binary items:** the asset plus a sidecar `<filename>.md`.
- **`vault-index.ts`:** request-scoped via React `cache()`, `force-dynamic` on
  every vault-reading route. No cross-request cache until profiling asks for one.
- **Commit granularity:** write-through to disk, commit explicitly — the model
  the drawer footer already shows. `autoCommit` available as an opt-in setting.

---

## 2. Item detail drawer

Right-side drawer on item click. **No `/items/[type]/[id]` route.**
Reference: `screenshots/dashboard-ui-drawer.png`.

### 2a — UI only

- Header: type icon, title, `Snippet · React Patterns`, close button
- Action row: Copy / Favorite / Pin (display-only this phase)
- Content block with language label; four preview shapes by type
  (code, prose, URL, image) — the old `ItemPreview` was deleted, rebuild here
- TAGS section
- AI SUPERPOWERS block: Auto-tag, Summarize, Explain code, Ask AI (buttons inert until phase 5)
- Metadata table: Path, Created, Updated
- Footer: Commit changes
- Opens from every `ItemCard` — dashboard, `/items/[type]`, `/favorites`, `/collections/[id]`

**Decide:** shadcn `Sheet` (already installed) vs custom. URL state (`?item=id`)
so the drawer is linkable and back-button works, or pure local state?

### 2b — Actions

Copy, Favorite, Pin, Edit, Delete, Add/remove tag, Commit. Server Actions in
`src/actions/`, Zod-validated, returning `{ success, data, error }`.

This is also where the display-only controls elsewhere finally get handlers:
New Item, `New {Type}`, New Collection, `CollectionCardMenu` Edit/Delete.

**Decide:** inline edit in the drawer vs a separate editor mode. Markdown editor
choice (Tiptap?) and code editor (Monaco?) — neither is installed.

---

## 3. Search

- `src/lib/search/` — MiniSearch or FlexSearch (neither installed)
- Full-text across content, titles, tags, types
- Un-`readOnly` the input in `MainHeader.tsx` — it has been decorative since phase 1
- Decide: command palette (Raycast-style, per spec) as well as, or instead of, the bar?
- Decide: index built server-side per request, or shipped to the client?

---

## 4. CLI

Separate layer, Commander.js, sharing `src/lib/` — no duplicated git/fs logic.

- `devvault init` — create/configure a vault repo
- `devvault start` — run the app against the configured vault
- `devvault sync` — pull / commit / push
- Never print secrets. Clear, actionable errors.

**Decide:** where it lives (`cli/`, `packages/cli/`?) and how it imports from
`src/lib/` given Next's build.

---

## 5. AI features

OpenAI `gpt-5-nano`. **Not gated** — there is no auth and no pro tier in this app,
so drop the "Pro phase" framing from the spec.

- Auto-tag, Summarize, Explain code, Ask AI — wire the phase-2a drawer buttons
- Route handler(s), key from env, never exposed to the browser
- Decide: streaming responses? where does a summary get stored — frontmatter or discarded?

---

## 6. Additional — multi-repo and versioning (only after 1–5)

A page for managing vault repositories: switch between repos, view history,
handle conflicts. Reached from the Git panel in the sidebar.

---

## Carried-over gaps (small, unblocked)

- **UI has never been visually verified** — 9 features confirmed by reading markup
  only. The `ui-reviewer` agent has Playwright; one run clears the whole backlog.
- Sidebar Pinned and Recent rows are inert `div`s with mouse-only tooltips
- Sidebar "Recent" count is really `items.length`, not a recency filter
- A collection's `description` renders on its card but not on its own page
- `TYPE_LABELS` in `dashboard-mappers.ts` duplicates `itemTypes[].label` —
  flagged 4 features running; fix is `label` on `ITEM_TYPE_META`
- No lint script and no ESLint config
- No tests of any kind
