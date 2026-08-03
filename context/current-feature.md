# Current Feature: Item Card UI Redesign

## Status

<!-- Not Started|In Progress|Completed -->

In Progress

## Goals

<!-- Goals & requirements -->

Redesign `ItemCard` only. Collection cards (`RecentCollections`) are explicitly out of scope.

- Keep the pin icon and star icon when the item is pinned or favorite.
- Keep the title in its current position.
- Remove the item type text and the collection names line (the `Note · DevOps & Commands` row).
- Show the item `description` where the content preview currently is, with proper overflow handling (clamped, no layout break).
- Keep the tags and the date text in their current positions.
- Add a copy icon in the bottom right, next to the date text. Clicking it copies the item and toasts "Content Copied To The Clipboard".
- Render the item-type icon in that type's color from `ITEM_TYPE_META` (currently monochrome `text-muted-foreground`).
- Give the card a left border in the item-type color, styled to look deliberate rather than a plain 4px stripe.

## Notes

<!-- Any extra notes -->

Files in play: [ItemCard.tsx](src/components/dashboard/ItemCard.tsx), [ItemPreview.tsx](src/components/dashboard/ItemPreview.tsx), [item-types.ts](src/lib/item-types.ts), [dashboard-data.ts](src/lib/dashboard-data.ts).

Decisions to make at `/feature start`:

- **Toast library.** Nothing is installed. shadcn's `sonner` is the natural fit and needs a `<Toaster />` in the root layout.
- **Copy makes the card a client component.** `ItemCard` is presentational today; the clipboard write and toast need `'use client'` (or a small client-only copy button child, which keeps the card a server component).
- **What "content" means for the copy.** Only some items have `content`. `url` items carry `url`, `file`/`image` carry `fileName`. Needs a defined fallback order so the copy button is never a no-op.
- **Missing descriptions.** 4 of 12 mock items have no `description`. Needs a decided fallback — content excerpt, nothing, or muted placeholder — so those cards don't collapse.
- **`ItemPreview` goes unused** in grid view once the description replaces the content preview. Decide whether to delete it or leave it for a future item detail view.
- **List view** currently renders no preview and no tags. Confirm the redesign applies to grid only, or define the list equivalent.

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

### Item Collections and Descriptions — 2026-08-04

Made item-to-collection membership many-to-many and gave items and collections an optional description.

`Item.collectionId: string` became `collectionIds: string[]` in `mock-data.ts`. An empty array is a normal state — an item filed nowhere — not an error. The relationship is stored on the item only; `Collection` deliberately did not gain an `itemIds` array. The reason is the Git storage model: items are files with YAML frontmatter, so membership stored on the item travels inside the item's own file. An `itemIds` index would be a separate file rewritten on every add, delete or move, which is exactly the merge-conflict magnet the multi-computer sync story has to avoid, and it could retain ids of deleted items. Deleting an item file now drops its memberships atomically. The cost is that per-collection counts are an O(items) filter; irrelevant over 12 mock items, and a derived index can be added later without changing the stored shape.

`description?: string` was added to both `Item` and `Collection`. It is data only — nothing renders it yet, since putting it on `ItemCard` or the Recent Collections card is a layout change that was not part of this feature.

Readers updated: `itemsInCollection` in `dashboard-nav.ts` and the collection filter in `dashboard-data.ts` match with `includes`; `DashboardItem.collectionName: string` became `collectionNames: string[]`; and `ItemCard` renders `[typeLabel, ...collectionNames].join(' · ')`, which degrades to the type label alone when the item is unfiled. The duplicate `itemsInCollection` call in `collectionNav` flagged in the previous feature was folded into a single pass while editing those lines.

Mock data now exercises all three cardinalities: two items in two collections (`Docker networking notes`, `Commit message writer`), two in none (`MongoDB index strategy`, `Tailwind config reference`), the rest in one. Five of six collections carry a description and eight of twelve items do, so the optional path is exercised too.

Verified from the rendered HTML on the dev server: cards read `Note · DevOps & Commands · Context Files`, `Prompt · AI Prompts · DevOps & Commands` and a bare `URL`; sidebar counts and derived dots are React Patterns 2 blue, AI Prompts 2 purple, DevOps & Commands 4 orange, plus Python Snippets 1 blue on the recent cards. `/collections` and `/items/note` both return 200 and the dev log was clean.

Known gaps and follow-ups:

- Descriptions render nowhere. Wiring them into `ItemCard` and the Recent Collections card is the obvious next step.
- `Resources & Links` is now empty, which is the only collection exercising the "no dominant type → muted dot" fallback. It sorts 6th by `updatedAt`, so it appears in neither the sidebar's top 3 nor the top 4 recent cards, and the muted dot is still not visible anywhere on the dashboard. `/collections` is the place it would show up once that page lists collections.
- Carried forward untouched: collection rows are still non-interactive `div`s, `/collections` and `/items/[type]` are still stubs, the sidebar's "Recent" count still means `items.length`, and `separator` is still installed and unused.
