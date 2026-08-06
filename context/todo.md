# TODO

Ordered roadmap. Each numbered phase becomes one or more `/feature` specs in
`features/`. Nothing here is started.

---

## 1. Git repository as source of truth

Replace `src/lib/mock-data.ts` with real reads from a vault on disk. This is the
blocker for everything below it — search, CLI and AI all sit on top of it.

**Build**

- `src/lib/filesystem/` — vault path resolution, read/write, `.devvault/config.json`
- `src/lib/markdown/` — frontmatter parse + serialize
- `src/lib/git/` — `isomorphic-git`; add/commit/pull/push, status, conflict detection
- Zod schemas at the boundary, matching the `Item` union in `src/types/vault.ts`
- Wire `GitSyncPanel` to real branch/status instead of hardcoded `main` / `Synced` / `2m ago`

**Decide first — the file structure is the whole design**

- Directory layout: the spec tree in `project-overview.md` groups by type
  (`snippets/`, `notes/`, …). Confirm or change.
- **Collection ↔ item is many-to-many.** `collectionIds[]` lives on the item and
  should stay there (it travels in the item's own file, no index to merge-conflict).
  But collections need their own home for name + description + `updatedAt`:
  one `.md` per collection, or entries in `.devvault/config.json`?
- Item `id` vs filename vs path — is the path the id, or is `id` in frontmatter?
  Decide what happens on rename and on slug collision.
- `pinned` / `favorite` / `createdAt` / `updatedAt` in frontmatter — yes?
- Binary items (`image`, `file`): the asset plus a sidecar `.md` for metadata?
- `vault-index.ts` builds its maps at module scope, valid only while data is
  static. Move to request scope and decide cache invalidation on disk change.
- Commit granularity: per save, or explicit "Commit changes" (see the drawer
  footer in `screenshots/dashboard-ui-drawer.png`)?

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
