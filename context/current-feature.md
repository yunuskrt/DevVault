# Current Feature: Item Type Page

## Status

<!-- Not Started|In Progress|Completed -->

In Progress

## Goals

<!-- Goals & requirements -->

- Replace the `/items/[type]` stub with a real listing page for the items of that type.
- Keep the top section exactly as it is today: `MainHeader` with the type label, the `{count} items in your vault` subtitle, and the search bar.
- Add a toolbar at the top of the main area holding a sort control on the left and a `New {Item Type}` button on the right.
- Sort options (5): **Recently updated** (default), **Name A–Z**, **Name Z–A**, **Pinned first**, **Favorites first**.
- Below the toolbar, list every item of that type using the existing `ItemCard`, styled like the dashboard's `Pinned Items` section.
- Support both grid and list view with the same toggle pattern `ItemsBrowser` already uses.

## Notes

<!-- Any extra notes -->

Decisions taken at `/feature load`:

- **Sort set.** The user picked the six-option bundle minus "Recently created", leaving the five above. `Item` has `createdAt`, so that option can be added later with no structural change.
- **`New {Item Type}` is display-only.** No creation flow or mutation layer exists and mock data is static at module scope, so the button renders and is focusable but does nothing on click — same call as Edit/Delete on `CollectionCardMenu`.

Implementation notes:

- The page is one of seven statically prerendered routes (`generateStaticParams` over `typeNav`). Timestamps must stay server-computed and passed down as finished strings — `DashboardItem.updatedLabel` already does this, and a client-side `Date.now()` would trip a hydration mismatch.
- Sorting and the grid/list toggle are both client state, so they belong in one client component that receives serializable `DashboardItem[]` as props. `ItemCard` stays a server-renderable presentational component.
- `dashboard-data.ts` needs a type-filtered accessor (a `getItemsByType(type, now)` alongside the existing getters). Sort comparators live there too so the page and any future views share them.
- The existing sort helper is `byUpdatedAtDesc`, currently private to `dashboard-data.ts`.
- "Pinned first" / "Favorites first" are orderings, not filters — flagged items float to the top and the rest follow, tie-broken by `updatedAt` descending.
- Mock data has at least one item for all seven types (snippet 3, command 2, note 2, prompt 2, file 1, image 1, url 1), so the empty state will not appear on any current route but should still be handled.
- `ItemsBrowser` is dashboard-specific (it hardcodes the Pinned/Recent two-section layout). Decide at `/feature start` whether to generalise it or add a sibling component for this page.
- `separator` is installed and still unused — the toolbar is a plausible first use.



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

### Item Card UI Redesign — 2026-08-04

Rebuilt `ItemCard` around the description, added a clipboard copy button, and gave each card its item type's colour. Collection cards were explicitly out of scope and are untouched.

The content preview is gone: `ItemPreview` was deleted and `description` renders in its place. The type-and-collections line (`Note · DevOps & Commands`) was removed entirely, so `typeLabel` and `collectionNames` on `DashboardItem` are now unused by the card but kept on the type, since they cost nothing and the item detail view will want them.

Colour comes from the existing `ITEM_TYPE_META`, so nothing new was introduced to describe a type. Each card gets a 4px left accent — `linear-gradient(to bottom, color, color33)` rather than a flat stripe — and an icon chip tinted `color1f` with the icon itself in full colour. These are inline styles because the values are per-item hex from data; this follows the precedent `SidebarRow` already set for `iconColor`/`dotColor`. The card's `hover:border-ring/60` was a no-op — shadcn's `Card` uses `ring-1`, not `border` — so it became `hover:ring-ring/40`.

Equal card size was a requirement, and every varying-height element is pinned: the title truncates to one line, the description occupies a fixed `h-10` block (grid) or `h-5` line (list) that stays reserved when the item has none, and the footer sits on `mt-auto` as a single non-wrapping row. Tags clip rather than wrap for the same reason, with a `mask-image` fading the cut edge so a badge is never sliced in half; the mask sits over empty space when the tags already fit, so it is invisible in the normal case.

List view got the same treatment on a fixed column track after a first pass left it ragged: icon, then a stacked title-over-description block with the title at `sm:w-56` so the pin/star markers land at the same x on every row, then tags at `w-44`, then a `w-20` right-aligned date and the copy button. Without the fixed widths the markers floated with title length and nothing lined up row to row.

Decisions taken at `/feature start`:

- **Toast.** Added shadcn `sonner` with `<Toaster />` in the root layout. It pulled in `next-themes`, but the app has no `ThemeProvider` — `useTheme()` would have returned `system` and rendered a light toast against the hardcoded-dark app — so the Toaster is pinned to `theme="dark"` to match the `dark` class on `<html>` and `next-themes` was uninstalled. A comment marks where to revisit if a real theme provider lands.
- **Copy source.** `copyText` on `DashboardItem` resolves `content ?? url ?? fileName ?? title` in `dashboard-data.ts`. Only some types store a payload in `content`; url items carry `url` and file/image items carry `fileName`, so without the chain the button would have been a no-op on four of twelve items.
- **`CopyButton` is the only new client component.** Keeping the clipboard write and toast in a small child leaves `ItemCard` a server component. A failed `navigator.clipboard.writeText` toasts an error rather than failing silently.
- **Missing descriptions render nothing** (user's call), with the reserved-height blocks above making that invisible in the layout.

Verified by build and by the rendered HTML on the dev server: 13 cards each carry the correct per-type gradient and icon tint (4 blue, 3 purple, 2 pink, 1 each green/grey/yellow/orange), descriptions render, the type-and-collection line is absent, and all 13 copy buttons have distinct `Copy <title>` labels. `npm run build` passes and the dev log is clean.

Known gaps and follow-ups:

- **Not visually verified.** No Playwright was available in the session, so the accent gradient, the tag fade mask and the toast were confirmed structurally rather than by eye. Worth a look before building on top of this.
- `typeLabel` and `collectionNames` are computed on every `DashboardItem` but nothing renders them now. Leave them until the detail view exists, then decide.
- The `mask-image` tag fade has no `-webkit-` fallback; fine for current browsers, but Safari below 15.4 would clip hard instead of fading.
- List view hides tags below `lg` and the whole description column is only as wide as the row allows. Narrow desktop windows show a fairly bare row.
- Carried forward untouched: collection rows are still non-interactive `div`s, `/collections` and `/items/[type]` are still stubs, the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, and CLAUDE.md still documents a nonexistent `npm run lint`.

### Items-Only Pin and Favorite — 2026-08-04

Made pinning and favouriting item-only concepts. `favorite: boolean` is gone from `Collection` in `mock-data.ts` and from all six entries, with a comment on the type recording the rule so it does not get re-added. Collections keep `updatedAt`, which is what the recent-collections ordering actually needs; only the star was ever driven by `favorite`.

Two readers followed. `RecentCollections` drops the amber `Star` marker and its `lucide-react` import, so a collection card is now name, dot, count and relative date. In `dashboard-data.ts` the fourth stat card changed from `favorite-collections` / `Favorite Collections` to `pinned-items` / `Pinned Items`, counting `items.filter(item => item.pinned)`. That keeps the four-card row intact and makes both of the remaining flag stats read off items, matching the sidebar's Favorites row and the main area's Pinned Items section rather than sitting alongside them counting a different kind of thing.

`DashboardCollection` still spreads `Collection`, so it lost `favorite` automatically with no change at the type site. Nothing else referenced it — the remaining `favorite` hits in `src/` are all `Item.favorite` (`ItemCard`, the `favorite-items` stat, the sidebar's Favorites count).

Verified: `grep -rn favorite src/` returns only item-level uses, and `npm run build` passes with all 12 routes prerendering.

Known gaps and follow-ups:

- The dashboard now shows the pinned count in two places — the stat card and the "Pinned Items" section heading's list. They agree today because both read `item.pinned`, but the section caps its list while the stat does not; if a limit ever bites, the numbers will diverge.
- Not visually verified. The stat-card label change and the removed star were confirmed by build and grep, not by eye.
- Carried forward untouched: collection rows are still non-interactive `div`s, `/collections` and `/items/[type]` are still stubs, the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, and CLAUDE.md still documents a nonexistent `npm run lint`.

### Collection Card UI Redesign — 2026-08-04

Rebuilt the Recent Collections card around the description and the collection's dominant item types, and gave it an actions menu. `/collections` was explicitly out of scope and still renders its stub, but the card is now a standalone component ready for it. Added shadcn `dropdown-menu`.

`getDominantTypeColor` in `item-types.ts` answered the wrong question for this card. The footer needs *every* type a collection holds most of, not just the winner, so `getDominantTypes` now returns all tied types ordered by `TYPE_PRIORITY` and `getDominantTypeColor` became a two-line wrapper over it. Keeping the wrapper meant `dashboard-nav.ts` and the sidebar dot were untouched, and — more usefully — the sidebar dot and the card dot are now provably the same value rather than two implementations that agree by coincidence.

`DashboardCollection.color?: string` became `dominantTypes: ItemTypeId[]`. One field drives both the dot colour (first entry) and the footer icons, so the requirement that the dot match the leftmost icon holds by construction instead of by two lookups staying in sync. `TYPE_LABELS` was exported from `dashboard-data.ts` to give the footer icons accessible names; the icons carry `role="img"` as well, since lucide only skips its default `aria-hidden` when a label is present and a bare `aria-label` on an `svg` is not reliably exposed.

`CollectionCard` is a server component and `CollectionCardMenu` is the only client one, following the `CopyButton` precedent from the item card rather than the spec note's assumption that the whole card would need `'use client'`. Layout mirrors `ItemCard`: `h-full` in the grid, a one-line truncated title, a fixed `h-10` two-line description block that stays reserved when a collection has none, and a `mt-auto` footer, so the bottom row lands at the same y on every card.

Decisions taken at `/feature start`:

- **Edit and Delete are display-only** (user's call). No collection route, detail view or mutation layer exists, and mock data is static at module scope, so a real delete could not persist and the counts elsewhere would disagree with it.

Two overrides were verified against `tailwind-merge` rather than assumed, because both fail silently: `w-36` beats the dropdown's base `w-(--radix-dropdown-menu-trigger-width)` (which would have rendered a menu the width of the 24px trigger), and `p-4` beats the card's base `py-(--card-spacing)`.

Verified from the rendered HTML on the dev server. The recent-4 only exercise the single-dominant-type path, so `RECENT_COLLECTION_LIMIT` was temporarily raised to 6 and reverted: React Patterns `#3b82f6` Snippet / 2 items, AI Prompts `#a855f7` Prompt / 2 items, DevOps & Commands `#f59553` Command / 4 items, Python Snippets `#3b82f6` Snippet / **1 item** (singular), Context Files `#eab308` with Note → File → Image on a three-way tie, and Resources & Links with a muted dot, no icons and 0 items. `npm run build` and `tsc --noEmit` pass and the dev log is clean.

Known gaps and follow-ups:

- **Not visually verified.** Third feature running with this caveat — no Playwright in the session, so colours, the two-line clamp and the open menu were confirmed structurally. Worth clearing before more card work.
- Clicking Edit or Delete closes the menu with no feedback at all, so "not built yet" is indistinguishable from "it broke". Fine while nothing on the dashboard mutates; revisit with the first mutation.
- `TYPE_LABELS` in `dashboard-data.ts` duplicates `itemTypes[].label` in `mock-data.ts`. Pre-existing, but exporting it makes the duplication load-bearing in a second file. `ITEM_TYPE_META` is the natural home for a label.
- The tie and empty cases render nowhere on the dashboard — Context Files and Resources & Links sort 5th and 6th by `updatedAt`, outside the top 4. `/collections` is where they become visible.
- Carried forward untouched: sidebar collection rows are still non-interactive `div`s, `/collections` and `/items/[type]` are still stubs, the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, and CLAUDE.md still documents a nonexistent `npm run lint`.
