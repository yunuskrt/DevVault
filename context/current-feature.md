# Current Feature

Item Collections and Descriptions

## Status

<!-- Not Started|In Progress|Completed -->

In Progress

## Goals

<!-- Goals & requirements -->

Let an item belong to any number of collections instead of exactly one, and give both items and collections an optional description.

### 1. Membership is many-to-many

Replace `collectionId: string` on `Item` with `collectionIds: string[]`. An empty array means the item is filed nowhere, which is a normal state rather than an error.

The relationship is stored on the item only. `Collection` does not gain an `itemIds` array.

### 2. Optional descriptions

Add `description?: string` to both `Item` and `Collection`.

### 3. Logic updates

- `itemsInCollection` in `dashboard-nav.ts` and the collection filter in `dashboard-data.ts` match with `includes` instead of equality.
- `DashboardItem.collectionName: string` becomes `collectionNames: string[]`.
- `ItemCard` renders the type label joined with every collection name, and the type label alone when there are none.

## Notes

<!-- Any extra notes -->

- Membership lives on the item because Git is the source of truth and items are files with YAML frontmatter: the membership travels inside the item's own file. An `itemIds` index on `Collection` would be a separate file rewritten on every add, delete or move — a merge-conflict magnet for the two-computer sync story — and could hold ids of deleted items. Deleting an item file drops its memberships atomically.
- The cost is that per-collection counts are an O(items) filter. Irrelevant over 12 mock items; a derived index can be added later without changing the stored shape.
- Descriptions are data only for now. Nothing renders them yet.

## History

<!-- Keep this updated. Earliest to latest -->

### Mock Data for Dashboard UI — 2026-08-03

Added `src/lib/mock-data.ts` as the single source of truth for dashboard mock data until Git-backed storage is implemented. Exports `itemTypes` (7), `collections` (6) and `items` (12), matching the counts in `context/screenshots/dashboard-ui-main.png` (5 favorites, 3 pinned). Items carry frontmatter-mappable fields (`id`, `title`, `type`, `tags`, `createdAt`, `updatedAt`) plus `content`, `language`, `url` and `fileName` where the type needs them; items reference collections by `collectionId`. Domain types are exported from the same file since the spec limited the change to one file. No auth data, database, persistence, helpers or Git logic. Spec: `context/features/mock-data-spec.md`.

### Dashboard UI Phase 1 — 2026-08-03

Built the dashboard shell at `/`. Initialized shadcn/ui (`components.json`, `src/lib/utils.ts`) and installed `button`, `input`, `separator` and `scroll-area`. Theme tokens live in `src/app/globals.css` via `@theme inline` plus `:root`/`.dark` custom properties; primary is a green accent matching the reference screenshot. `src/app/layout.tsx` sets `className="dark"` on `<html>` so dark mode is the default while light tokens stay available.

`src/app/page.tsx` composes the shell: `TopBar` above a flex row of `Sidebar` and `MainArea`, with `h-dvh` on the outer wrapper so only the main region scrolls. `TopBar` holds a read-only search `Input` with a `lucide-react` search icon and a display-only "New Item" `Button` — no behavior this phase. `Sidebar` and `MainArea` are placeholders with `h2` headings only; the sidebar is `hidden md:block` since the mobile drawer is phase 2 scope.

Followed the spec's top-bar placement over the screenshot's (search in the main column, "New Item" in the sidebar); phase 2 may move them. `npm run build` passes and the rendered page was verified against the dev server.

Review fixes applied before merge: the search input got an `aria-label` (a placeholder is not an accessible name), and `shadcn` (a CLI) plus `tw-animate-css` moved to `devDependencies` to match how `tailwindcss` is declared — the `@import "shadcn/tailwind.css"` in `globals.css` still resolves at build time.

Carried into phase 2: `separator` and `scroll-area` are installed but unused, awaiting the sidebar. The shell currently lives in `page.tsx`; once `/items/[type]` exists it needs to move to a `layout.tsx` so both routes share it. `Sidebar` is `hidden md:block`, so mobile has no navigation until the drawer lands. CLAUDE.md documents `npm run lint`, but no such script exists in `package.json`.

### Dashboard UI Phase 2 — 2026-08-03

Built the real sidebar and moved the shell into the root layout. Added `sheet` and `tooltip` from shadcn.

`src/lib/dashboard-nav.ts` is the seam between mock data and the sidebar: it derives every count from `items` at module scope, maps each `ItemTypeId` to a lucide icon, and builds the `/items/[type]` hrefs. Nothing in the UI hardcodes a number, so swapping mock data for Git-backed storage later only touches this file. All 17 rendered counts were verified against the reference screenshot.

`DashboardShell` is the only stateful component — it owns `collapsed` and `mobileOpen` and lives in `src/app/layout.tsx`, so sidebar state survives navigation between `/` and `/items/[type]`. `Sidebar` renders a desktop `aside` (`w-64` ↔ `w-16`) and a mobile `Sheet` from the same `SidebarContent`, so there is one nav implementation rather than two. `SidebarRow` is the shared row primitive covering icon-or-color-dot, count, active state via `usePathname`, and the collapsed-state tooltip. `GitSyncPanel` renders the footer.

Decisions taken at `/feature start` (see above): Git sync panel instead of the spec's user avatar, singular `/items/snippet` routes matching `ItemTypeId`, stub type pages so no link 404s, and `TopBar` removed with search relocated to `MainHeader` in the main column.

Known gaps carried into phase 3:

- Favorites, Pinned, Recent and the six collection rows render as non-interactive `div`s — no routes were specced for them. Because a `div` is not focusable, their collapsed-state tooltips are mouse-only. Give them routes or make them buttons when those views exist.
- The spec asked for "favorite collections" and "most recent collections", but `Collection` in `mock-data.ts` has no favorite or recency field, so neither is derivable. Built the flat COLLECTIONS list the screenshot shows instead.
- `separator` is still installed and unused; the sidebar uses spacing rather than rules.
- The grid/list toggle in the screenshot's main header is not built — it is not in the phase 2 spec.
- CLAUDE.md still documents `npm run lint` with no such script in `package.json`.

### Dashboard UI Phase 3 — 2026-08-03

Filled in the main area at `/`, completing the three-phase dashboard UI. Added `card`, `badge` and `toggle-group` from shadcn.

`Collection` in `mock-data.ts` gained `favorite` and `updatedAt`. Phase 2 had to skip "favorite collections" and "recent collections" because neither was derivable; rather than infer them from item favorites, both are now explicit fields. The three collections holding favorite items are marked favorite, and each `updatedAt` is seeded from that collection's newest item so the two representations agree.

`src/lib/dashboard-data.ts` is the phase 3 counterpart to `dashboard-nav.ts` — `getDashboardStats`, `getRecentCollections`, `getPinnedItems` and `getRecentItems`. Each takes an optional `now` so the page can thread a single clock through every timestamp. `src/lib/format.ts` holds `formatRelativeTime`.

Timestamps are computed on the server and passed down as finished strings. `/` prerenders statically, so a client-side `Date.now()` would read a different clock at hydration than at build and trip a mismatch. This is why `DashboardItem` carries `updatedLabel` rather than the components formatting `updatedAt` themselves.

`ItemsBrowser` is the only client component — it owns the grid/list toggle and receives plain serializable item data as props. `ItemCard` and `ItemPreview` are presentational; `ItemPreview` branches on item type for the four preview shapes (code block, prose, URL, image placeholder). `StatCards` and `RecentCollections` stay server components.

Verified against the running app: stats read 12/6/5/3, recent collections lists the correct 4 in `updatedAt` order, pinned shows exactly 3, recent items shows 10 of 12 cutting the two oldest, and the dev log had no hydration warnings.

Known gaps and follow-ups:

- The sidebar's "Recent" count is `items.length`, not a real recency filter. It matches the screenshot's 12, but it means something different from the main area's "Recent Items", which genuinely sorts by `updatedAt` and caps at 10. Reconcile these when recency gets a definition.
- `RECENT_COLLECTION_LIMIT = 4` and `RECENT_ITEM_LIMIT = 10` live in `dashboard-data.ts`. The item limit comes from the spec; the collection limit was a judgement call, as neither the spec nor the screenshot specifies one.
- The view toggle sits on the "Pinned Items" heading row and controls both item sections. The screenshot places it top-right of the page header, but that header is shared with `/items/[type]` and the state has to live alongside the lists it drives.
- All counts are evaluated once at module scope and `/` is statically prerendered. Moving to Git-backed storage means moving these into a request-time or filesystem-read path.
- Carried forward untouched: the non-interactive sidebar rows with mouse-only collapsed tooltips, `separator` still unused, and CLAUDE.md's nonexistent `npm run lint`.
- `/items/[type]` still renders the phase 2 stub. Now that `ItemCard` exists, those pages could list their items with almost no new code.

### Sidebar UI Improvements — 2026-08-04

Gave item types their own icons and colors, made collection colors derived rather than stored, restructured the sidebar into two collapsible sections, and pinned the header and Git sync panel so only the middle scrolls.

`src/lib/item-types.ts` is the new home for item-type presentation. `ITEM_TYPE_META` maps each `ItemTypeId` to both an icon and a hex color, replacing `TYPE_ICONS` in `dashboard-nav.ts`; `note` moved `FileText` → `NotebookPen` and `file` moved `File` → `FileText`. It sits below `dashboard-nav.ts` and `dashboard-data.ts` in the import graph so both can read it without a cycle. Type rows render their icon in the assigned color via a new `iconColor` prop on `SidebarRow`; `ItemCard` reads the same map so it picks up the icon changes while its chip stays monochrome.

`getDominantTypeColor` lives alongside the meta map: a collection's dot is the color of its most common item type, with `TYPE_PRIORITY` (snippet → prompt → command → note → file → image → url) breaking ties and `undefined` for an empty collection. `color` is gone from `Collection` in `mock-data.ts` and from all six entries; `collectionNav` and `getRecentCollections` compute it instead. `SidebarRow` gained an explicit `dot` prop because the marker used to be chosen by `dotColor` being present, which no longer works now that a colorless collection still needs a (muted) dot.

`SidebarSection` owns the collapsible heading — a real `button` with `aria-expanded`/`aria-controls`, returning children unwrapped when the rail is collapsed so icon-only mode still shows every row. TYPES now sits above COLLECTIONS, and `collectionNav` caps at `SIDEBAR_COLLECTION_LIMIT = 3` sorted by `updatedAt` descending, followed by a "View all collections" link to the new `/collections` stub. The screenshot's PRO badges and FAVORITES / ALL COLLECTIONS split were deliberately dropped.

Layout is now header / scroll / footer: `shrink-0` on the header, New Item button and `GitSyncPanel`, with `min-h-0` on the flex column and the `ScrollArea` so the middle actually scrolls instead of pushing the panel off-screen. The sync panel lost its card treatment for a plain top divider and smaller muted text.

Known gaps and follow-ups:

- Collection rows are still non-interactive `div`s with mouse-only collapsed tooltips, unchanged from phase 2. `/collections` now exists, so per-collection routes are the natural next step.
- Section collapse state is local to `SidebarContent`, so the desktop aside and the mobile sheet track it independently. Only one is visible at a time, so this is invisible in practice.
- `/collections` and `/items/[type]` are both stubs; `/collections` renders only a `MainHeader` and a placeholder heading.
- `getDominantTypeColor` is called twice per collection in `dashboard-nav.ts` (once for color, once via a second `itemsInCollection` pass for the count). Fine at module scope over 12 mock items; revisit when data comes from the filesystem.
- Carried forward untouched: the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, and the type/collection counts are still evaluated once at module scope.
