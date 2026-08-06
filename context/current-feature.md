# Current Feature: Git Vault 2 — Sidebar Data Threading

## Status

<!-- Not Started|In Progress|Completed -->

In Progress

## Goals

<!-- Goals & requirements -->

- Break the `SidebarContent.tsx` (`'use client'`) → `dashboard-nav.ts` → `mock-data.ts` import chain, so filesystem reads never reach the browser when spec 3 lands.
- Convert `dashboard-nav.ts`'s module-scope constants `primaryNav`, `collectionNav`, `typeNav` into `getPrimaryNav()`, `getCollectionNav()`, `getTypeNav()`, returning the same shapes and staying synchronous.
- Keep `getTypeNavEntry(id)` working for `/items/[type]`'s 404 check and header label — pass the nav array in if that keeps the page simplest.
- Add a single `SidebarNav` type in `src/types/dashboard.ts` carrying all three lists; thread one prop `layout.tsx` (server) → `DashboardShell` → `Sidebar` → `SidebarContent`.
- Make everything crossing the client boundary serializable: pass icon **keys**, not `LucideIcon` components. Types resolve via `ITEM_TYPE_META`; `LayoutDashboard` and `Star` on the two primary rows need equivalent treatment.
- Acceptance: grep proves `SidebarContent.tsx` no longer imports `dashboard-nav`, and no `'use client'` file reaches `mock-data.ts` through any chain. Record the grep in history so spec 3 can rely on it.

## Notes

<!-- Any extra notes -->

Spec: `context/features/git-vault-2-sidebar-data-spec.md` (2 of 7). Series
overview: `context/features/git-vault-0-overview.md`. Design:
`docs/git-vault-architecture.md` §1.1.

**Pure refactor, zero behaviour change.** `mock-data.ts` still exists and is
still the source at the end of this spec. Doing the prop-threading here keeps it
out of spec 3's async conversion branch, and gives that branch an exact
regression baseline. Nothing here is Git-related.

Verification — every number is unchanged from today; any difference is a bug:

1. Sidebar collections: React Patterns `#3b82f6`, AI Prompts `#a855f7`, DevOps & Commands `#f59553`, in that order, counts 2 / 2 / 4.
2. Type rows: Snippet 3, Prompt 2, Note 2, Command 2, File 1, Image 1, URL 1 — each icon in its own colour, visually unchanged.
3. Primary rows: Dashboard 12, Favorites 5.
4. Collapsed rail still shows every row with tooltips intact.
5. Mobile sheet renders the same nav as the desktop aside.
6. `aria-current="page"` still lands on a collection route and on `/favorites`.
7. Card counts across all routes match the overview spec's baseline.
8. `npm run build` passes, `tsc --noEmit` clean, no hydration warnings.

Out of scope: changing the data source (spec 3), making anything async, the
inert Pinned/Recent sidebar rows, and `GitSyncPanel` (hardcoded until spec 4).

The fiddly part is the icons — the type row and the two primary rows must look
identical afterwards.

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

### Item Type Page — 2026-08-04

Replaced the `/items/[type]` stub with a real listing of that type's items, sortable and switchable between grid and list. `MainHeader` is untouched — same type label, same `{count} items in your vault`, same search bar. Added shadcn `select`.

`src/lib/item-sort.ts` holds the five orderings and `sortItems`. It deliberately imports nothing at all: a client component that pulled sort logic out of `dashboard-data.ts` would drag `mock-data.ts` into the browser bundle with it, since that module imports the vault at the top. `ItemSortId` is derived from `ITEM_SORT_OPTIONS` via `as const` plus an indexed access, so the option list and the union cannot drift apart. Comparators are keyed by id in a `Record`, and `sortItems` copies before sorting rather than mutating the caller's array. "Pinned first" and "Favorites first" are orderings, not filters — `Number(b[flag]) - Number(a[flag]) || byUpdatedAtDesc`. Name sorting pins the locale to `'en'` with `sensitivity: 'base'`, so the ordering does not shift with the runtime's default and case does not split the alphabet.

`getItemsByType` in `dashboard-data.ts` pre-sorts with the same `DEFAULT_ITEM_SORT` constant the client's `useState` initialises to, so the server render and the first client render agree by construction rather than by two places happening to say "recent".

`ItemTypeBrowser` is the only new client component; it owns sort and view state. Rather than generalise `ItemsBrowser` — whose shape *is* the dashboard's two-section Pinned/Recent layout — the two pieces both pages actually share were extracted: `ViewToggle` (the toggle group) and `ItemGrid` (the grid/list container, the `ItemCard` map, and the optional empty state). `ItemsBrowser` dropped from 66 lines to 33 and renders identically. The inline `'grid' | 'list'` union became `ItemView` in `src/types/items.ts`, the first file in that directory.

Two things surfaced during the build:

- **Radix `SelectValue` renders empty on the server.** It only learns an item's label once `SelectContent` mounts, so on a statically prerendered page the sort control would have shown a blank box on first paint and filled in at hydration. Passing the label as a child (`<SelectValue>{sortLabel}</SelectValue>`) puts the text in the prerendered HTML; confirmed present rather than assumed.
- `w-48` on the trigger had to beat the component's base `w-fit`. Checked in the rendered class list — `w-48` present, `w-fit` gone — the same silent-failure class as the `w-36`/`p-4` overrides on the collection card.

Toolbar is sort on the left, then view toggle and the `New {Type}` button on the right. All three controls are `h-7`, verified against the `sm` variants in `button.tsx`, `toggle.tsx` and `select.tsx`.

Decisions taken at `/feature load`:

- **Five sort options** (user's call): Recently updated (default), Name A–Z, Name Z–A, Pinned first, Favorites first — the six-option bundle minus "Recently created". `Item` still carries `createdAt`, so that option drops into `ITEM_SORT_OPTIONS` later with no structural change.
- **`New {Type}` is display-only** (user's call), matching Edit/Delete on `CollectionCardMenu`.

Verified: all nine routes return 200; snippet renders 3 cards, command 2, url 1, image 1, matching the sidebar counts; the dashboard still emits 21 cards (4 stats + 4 collections + 3 pinned + 10 recent), so the `ItemsBrowser` extraction changed nothing. The comparators were exercised against synthetic data covering mixed case and both flags — `recent` newest-first, `name-asc` `Apple, banana, cherry, Date` (so case does not split), `name-desc` its exact reverse, `pinned` and `favorites` floating flagged items with a date tie-break, and the input array unmutated. `npm run build` passes with all 12 routes prerendering and the dev log is clean.

Known gaps and follow-ups:

- **Not visually verified.** Fourth feature with this caveat — no Playwright in the session, so the toolbar alignment, the open select and the empty state were confirmed structurally. This is overdue.
- The `New {Type}` button gives no feedback on click, so "not built yet" looks the same as "broken" — the same gap the collection card's Edit/Delete has, now on a more prominent control.
- The empty state cannot be seen on any current route: all seven types have at least one item.
- `dashboard-data.ts` keeps its own generic `byUpdatedAtDesc` (it sorts collections too), so that comparator now exists in two files. Worth reconciling if collections gain a sort control.
- The search bar in `MainHeader` is still `readOnly` on this page, so the only way to narrow a long type list is the sort control.
- Carried forward untouched: sidebar collection rows are still non-interactive `div`s, `/collections` is still a stub, the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, and CLAUDE.md still documents a nonexistent `npm run lint`.

### Collection and Favorites Pages — 2026-08-04

Added `/collections/[collectionId]` and `/favorites`, both listing items the same way `/items/[type]` does, and wired every route that should reach them.

`ItemTypeBrowser` became `ItemBrowser`. The rename is the point: the component was never type-specific, only its props were. `emptyMessage` is now passed in rather than derived from a type label, and `createLabel` is optional — absent on the two new pages, so the create button simply does not render. One client component serves all three list pages instead of a third near-identical copy.

In `dashboard-data.ts` the three filtered accessors (`getItemsByType`, `getItemsByCollection`, `getFavoriteItems`) are one-liners over a private `getBrowserItems(matches, now)`. The invariant that matters — pre-sort with the same `DEFAULT_ITEM_SORT` the client's `useState` initialises to, so the server render and the first client render agree — is now stated once instead of copied per accessor. `getCollectionById` was added so the dynamic page does not reach into `mock-data` for a lookup.

Navigation, per the decision below, is a stretched link. `CollectionCard`'s title is the only anchor; `after:absolute after:inset-0` extends its hit area over the whole card, the `Card` gained `relative` to contain it, and `CollectionCardMenu` sits in a `relative z-10` wrapper so it stays clickable above the overlay. Verified in the rendered markup that the `</a>` closes before the menu's `<button>` — no interactive element nested inside an anchor. Sidebar wiring was exactly the three edits the spec predicted: `href` on the `favorites` entry in `primaryNav`, `href` on `CollectionNavEntry`, and `href`/`active`/`onNavigate` on the collection rows in `SidebarContent`.

Decisions taken at `/feature load`:

- **Stretched link on the title** (user's call), rather than wrapping the card in a `Link` — which would have nested the menu's button inside an anchor and made a menu click navigate.
- **`/collections` stays a stub** (user's call — next phase). Until it lands, the three collections outside the sidebar's top 3 are reachable only by URL.

Header wording was left open at load and decided here: collection pages read `{count} items in this collection`, `/favorites` reads `{count} favorite items in your vault`. The collection's `description` was deliberately not used as the subtitle — the count is the same kind of fact on all three list pages, and swapping it out per page would have made the header mean different things in different places.

Verified on the dev server: `/favorites` 5 cards, `react-patterns` 2, `devops-commands` 4, `resources-links` 0, all matching the sidebar counts; no create button on any of the four, while `/items/snippet` still renders "New Snippet". `/collections/nope` returns 404 and all six collections prerender. `aria-current="page"` lands correctly on both a collection route and `/favorites`. The stretched-link class appears exactly 4 times in markup (once per recent collection card; the other 4 hits are the RSC payload). The dashboard still emits 21 cards, so the rename changed nothing there. `npm run build` passes with 19 routes and the dev log is clean.

`Resources & Links` finally paid off: its page is the first place `ItemGrid`'s empty state has actually rendered, and it reads correctly.

Known gaps and follow-ups:

- **Not visually verified.** Fifth feature with this caveat. The stretched link is the one most likely to disappoint by eye — the overlay stacks against the card's hover ring, and that interaction was confirmed structurally, not by clicking. Clear this before `/collections` builds on the card.
- The sidebar's Pinned and Recent rows are still inert `div`s with mouse-only collapsed tooltips. The collection rows and Favorites lost that flaw here by gaining `href`s, so the remaining two are now the odd ones out rather than the norm.
- `/collections` is still a stub, so three of six collections have no clickable route to them.
- A collection's `description` renders on its card but nowhere on its own page.
- Carried forward untouched: the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, `MainHeader`'s search is still `readOnly`, `dashboard-data.ts` still keeps its own `byUpdatedAtDesc` alongside `item-sort.ts`, and CLAUDE.md still documents a nonexistent `npm run lint`.

### All Collections Page — 2026-08-05

Replaced the `/collections` stub with a grid of every collection and a sort control. `MainHeader` is untouched — same title, same `{count} collections in your vault`, same search bar. No new shadcn components; the page is assembled entirely from parts the previous three features built.

`src/lib/collection-sort.ts` is the sibling of `item-sort.ts` and follows it exactly: imports nothing at all (so the client component that pulls it in does not drag `mock-data.ts` into the browser bundle), options `as const` with `CollectionSortId` derived by indexed access, comparators keyed by id in a `Record`, and `sortCollections` copying before it sorts. Name sorting pins the locale to `'en'` with `sensitivity: 'base'` for the same reason it does there.

The interesting difference is what it sorts *on*. `item-sort.ts` is typed to `title`/`pinned`/`favorite`; a collection has none of those. Two of the five orderings sort on `count`, which is not a field on `Collection` — it is derived by filtering `items` — so `SortableCollection` is `name`/`updatedAt`/`count` and the sortable shape is `DashboardCollection`, not `Collection`. Both count orderings tie-break on `byUpdatedAtDesc` rather than leaving equal counts in arbitrary order; React Patterns and AI Prompts both hold 2, so the tie is live in current data, not hypothetical.

In `dashboard-data.ts` the `DashboardCollection` mapping was factored out of `getRecentCollections` into `toDashboardCollection`, the way `getBrowserItems` was factored out last feature, and `getAllCollections` is the unsliced accessor over it. `getRecentCollections` keeps its `RECENT_COLLECTION_LIMIT = 4` slice and renders identically. `getAllCollections` pre-sorts with the same `DEFAULT_COLLECTION_SORT` the client's `useState` initialises to, so the server render and the first client render agree by construction — the invariant the three item accessors already hold.

`CollectionBrowser` is the only new client component, owning sort state and nothing else. Both traps from the item page were carried over deliberately rather than rediscovered: `<SelectValue>{sortLabel}</SelectValue>` puts the trigger's text in the prerendered HTML (a bare `SelectValue` renders blank on a static page and fills in at hydration), and `w-48` on the trigger has to beat the component's base `w-fit`.

Decisions taken at `/feature load`:

- **Five sort options** (user's call): Recently updated (default), Name A–Z, Name Z–A, Most items, Fewest items. Collections have no `createdAt`, and pin/favorite are deliberately item-only, so the item pages' two flag orderings are replaced by the only other fact a collection carries.
- **Grid only, no view toggle** (user's call). `CollectionCard` has no fixed-column list branch the way `ItemCard` does, and adding one would change a component three other places already render. The toolbar holds the sort control alone.

Verified: `npm run build` passes with all 19 routes prerendering and TypeScript clean. The page renders 6 cards in the expected default order — React Patterns 2, AI Prompts 2, DevOps & Commands 4, Python Snippets 1, Context Files 3, Resources & Links 0 — accounting for 12 memberships across 12 items, two of which belong to two collections and two to none.

Two edge cases that had rendered nowhere until now are finally visible on this page: `Context Files` shows its three-way dominant-type tie (Note → File → Image) and `Resources & Links` shows the muted dot with no footer icons at 0 items. Both were previously confirmed only by temporarily raising `RECENT_COLLECTION_LIMIT`.

This closes the navigation dead end that has been carried forward since the sidebar was capped: every collection now has a clickable route, since `CollectionCard`'s stretched link already points at `/collections/[collectionId]`.

Known gaps and follow-ups:

- **Not visually verified.** Sixth feature with this caveat, and it now spans the whole card layer — the stretched link, the accent gradients, the tag fade and this grid have all been confirmed structurally. It is the single largest outstanding risk in the UI work and should be cleared before more card or layout work lands.
- The empty state in `CollectionBrowser` (`No collections in your vault yet.`) cannot be reached — `collections` is static and non-empty. It exists for when storage becomes real.
- `byUpdatedAtDesc` now exists in three files: `dashboard-data.ts`, `item-sort.ts` and `collection-sort.ts`. The last feature flagged this as worth reconciling "if collections gain a sort control" — they now have.
- `CollectionCardMenu`'s Edit and Delete are display-only, and this page multiplies them from 4 cards to 6. Clicking either still closes the menu with no feedback.
- Carried forward untouched: the sidebar's Pinned and Recent rows are still inert `div`s, the sidebar's "Recent" count still means `items.length`, `separator` is still installed and unused, `MainHeader`'s search is still `readOnly`, a collection's `description` still renders nowhere on its own page, and CLAUDE.md still documents a nonexistent `npm run lint`.

### Code Scan Follow-Ups — 2026-08-05

Closed out the code-scanner audit. No user-facing change: every route renders
exactly what it did before, verified card-for-card. Two new lib modules, one
component renamed, one unused shadcn component removed.

**`Item` is now a discriminated union.** `ItemBase` holds the fields every item
carries; `CodeItem` (`snippet` | `command`) requires `content` + `language`,
`TextItem` (`prompt` | `note`) requires `content`, `UrlItem` requires `url`,
`ImageItem` requires `fileName`, and `FileItem` requires `fileName` with
`content`/`language` optional. All twelve mock items already satisfied the
strict shape, so no data changed — the union only made the existing invariant
enforceable.

The payoff landed immediately and unprompted: `copyTextFor`'s old
`item.content ?? item.url ?? item.fileName ?? item.title` stopped compiling the
moment the union went in, because no single member has all four fields. It is
now an exhaustive `switch` returning `string` with no fallback, and a new item
type will fail to compile there until it declares what its copy button writes.
The title fallback is gone: it was unreachable for six of seven types and only
ever masked a missing payload.

**`vault-index.ts` holds the reverse indexes.** Membership is stored on the
item, which is right for Git-backed storage but made "the items in this
collection" an O(items) scan repeated per collection in three readers. A
`Map<collectionId, Item[]>` and a `Map<id, Collection>` are built once, and
`collectionNames`, `toDashboardCollection`, `getItemsByCollection`,
`getCollectionById` and the sidebar's `collectionNav` all read from them.
`getItemsInCollection` returns `readonly Item[]` because the array is the
index's own — that propagated to `getDominantTypes`, `getDominantTypeColor`,
`sortItems` and `sortCollections`, all of which already copied before sorting,
so the annotation documents an invariant that already held rather than
introducing one. `getBrowserItems` now takes the item array instead of a
predicate, which is what let the collection accessor use the index at all.

**`sort-utils.ts` holds `byUpdatedAtDesc` and `byTextAsc`.** It imports nothing,
so `item-sort.ts` and `collection-sort.ts` keep their no-`mock-data` guarantee
while depending on it. `byUpdatedAtDesc` was implemented three times and the
locale-pinned name comparator twice; both are now single definitions.
`dashboard-nav.ts` had a fourth inline copy in `collectionNav`'s `.sort()` that
the scan did not flag — it now uses the shared one too.

**`ItemCard`'s pin and star markers gained `role="img"`.** `CollectionCard`
already carried this fix with a comment explaining why; `ItemCard` never got
it, so pinned and favorite status was plausibly silent to screen readers on
every item card in the app. The comment is now duplicated at the second site
rather than referenced, since that is where someone would delete the attribute.

**`ItemsBrowser` is now `DashboardItemSections`**, renamed via `git mv` so the
history follows. It was one letter from `ItemBrowser` while doing something
entirely different — the dashboard's fixed Pinned/Recent pair rather than the
sortable single list. **`src/components/ui/separator.tsx`** was deleted; it had
been installed since dashboard phase 1 and never imported.

Decisions taken at feature start:

- **Strict per-type union** (user's call) over payload-only. This is what made
  `copyTextFor` exhaustive; the looser variant would have kept a fallback.
- **`MainHeader`'s `readOnly` search left as-is** (user's call). Real search is
  a spec'd core feature and belongs on its own branch; disabling the input in
  the meantime was judged worse than leaving it.
- The display-only controls (`CollectionCardMenu` Edit/Delete, New Item, New
  Collection, `New {Type}`) were explicitly excluded — their handlers land with
  the CRUD work.

The scan's fourth finding, CLAUDE.md documenting a nonexistent `npm run lint`,
**needed no change**: CLAUDE.md's Commands section already lists only `dev`,
`build` and `start`. The stale references live in this file's own history
entries, which were left alone rather than rewritten. There is still no lint
script, so the underlying gap stands — nothing documents it now.

Verified against the dev server after the change: `/` 21 cards, `/favorites` 5,
`/collections` 6, `react-patterns` 2, `devops-commands` 4, `context-files` 3,
`resources-links` 0, snippet 3, command 2, url 1, image 1 — every count
matching the baselines recorded in the previous entries. Collection dot colours
are unchanged (3 × `#3b82f6`, 2 × `#a855f7`, 2 × `#f59553`, 1 × `#eab308`),
`/collections/nope` still 404s, and every `aria-label="Pinned"` /
`"Favorite"` in the markup now carries `role="img"` with none bare. Each type's
`copyText` was read out of the RSC payload and confirmed to resolve to the same
value the old chain produced: content for snippet/command/prompt/note/file,
the URL for url, the filename for image. `npm run build` passes with all 19
routes prerendering, `tsc --noEmit` is clean, and the dev log has no errors or
warnings after the change.

Known gaps and follow-ups:

- **Still not visually verified.** Seventh feature with this caveat. This one is
  lower risk than the card work — the only visual-layer change is an ARIA
  attribute — but the backlog of unverified card and layout rendering is
  unchanged and still the largest outstanding risk in the UI.
- `vault-index.ts` builds both maps at module scope, which is correct only
  because the vault is static. Reading items from the filesystem means moving
  index construction into the request path and invalidating it when the vault
  changes on disk. The module comment says so.
- `TYPE_LABELS` in `dashboard-data.ts` still duplicates `itemTypes[].label` in
  `mock-data.ts`. Flagged two features ago, still open; `ITEM_TYPE_META` is the
  natural home.
- The `Item` union is compiler-enforced but not runtime-validated. The coding
  standards call for Zod at boundaries, and frontmatter parsing will be one —
  the union is the schema that validator has to match.
- There is no lint script and no ESLint config, so nothing mechanically catches
  the unused imports and dead exports these scans keep finding by hand.
- Carried forward untouched: the sidebar's Pinned and Recent rows are still
  inert `div`s, the sidebar's "Recent" count still means `items.length`,
  `MainHeader`'s search is still `readOnly`, a collection's `description` still
  renders nowhere on its own page, and the display-only controls still give no
  feedback on click.

### Component Deduplication — 2026-08-05

Closed out the refactor-scanner audit of `src/components/`. No user-facing
change: every route renders the same cards, counts, colours and text as before,
verified against the baselines the previous entries recorded. Five new files,
fourteen edited, and the component layer net −40 lines.

Six of the scan's nine findings were taken. Three were declined at spec time:
the interactive-card hover fragment (only `transition-shadow
hover:ring-ring/40` is genuinely shared; the rest of each class list is
per-variant layout, so extracting it would split one class list across two
files), splitting `SidebarContent` (readability only, no duplication, a single
composition rendered once), and `TYPE_LABELS` vs `itemTypes[].label` (real, but
a data question touching `mock-data.ts` rather than components).

**`pluralize` in `format.ts`** replaces five hand-rolled `count === 1 ? … : …`
ternaries — `CollectionCard` and the four list pages, each with its own noun
and one already inconsistent in wording. The third parameter takes an irregular
plural; every current caller uses the `${singular}s` default.

**`SortSelect`** is generic over the sort id union
(`<T extends string>`), which is what lets `onChange` hand back a narrowed
`ItemSortId`/`CollectionSortId` and removes the `next as ItemSortId` casts at
both call sites. `readonly` on both the array and its members is load-bearing:
`ITEM_SORT_OPTIONS` and `COLLECTION_SORT_OPTIONS` are `as const`, and a mutable
signature would not accept them. The `<SelectValue>{label}</SelectValue>` SSR
workaround — discovered on the item page, then copied verbatim into the
collections page — now lives in one place with its comment, so a third sortable
list cannot rediscover it the hard way.

**`EmptyState`** replaces the byte-identical dashed-border paragraph in
`ItemGrid` and `CollectionBrowser`. The grid wrapper became two named constants
in the new `src/lib/ui-classes.ts` rather than a `CardGrid` component,
because `StatCards` puts those classes on its own `<section>` — a wrapper would
have added a `<div>` inside it and changed the DOM. `ItemGrid` also lost a
`cn()` that wrapped a single ternary and did nothing.

**`ColorDot`** replaces the dot span in `SidebarRow` (`size-2`) and
`CollectionCard` (`size-2.5`), including the `!color && 'bg-muted-foreground'`
fallback that renders `Resources & Links`. It deliberately carries no
`'use client'`: `SidebarRow` is a client component and `CollectionCard` is a
server one, and both use it.

**`TypeIcon`** covers the tinted chip and the labelled bare icon behind a `chip`
flag. Its accessibility output is unchanged by design — the chip stays silent
(the card already names the item; labelling it now would be a behaviour change,
not a refactor) and the bare variant keeps `role="img"` with the comment
explaining why lucide needs it.

The one deviation from the spec here: `TypeIcon` takes its `label` as a prop
instead of importing `TYPE_LABELS`. Importing it would pull `dashboard-data` →
`mock-data` into `ItemCard`, which is client-bundled by way of `ItemBrowser`.
`CollectionCard` already imports `TYPE_LABELS` and passes the label down, so no
new client-bundle dependency was introduced.

The other deviation: `/favorites` uses `pluralize(n, 'favorite item')`. The spec
said to compose that subtitle by hand to protect its wording, but hand-composing
means writing the exact ternary being removed. The rendered string is identical.

**The sidebar buttons** now spell their label once. `{!collapsed && 'New Item'}`
plus `{collapsed && <span className="sr-only">New Item</span>}` became a single
`<span className={collapsed ? 'sr-only' : undefined}>`; `cn()` was tried first
but rendered a stray `class=""` when expanded.

Verified on the dev server after the change: card counts 21 / 5 / 6 /
`react-patterns` 2 / `devops-commands` 4 / `context-files` 3 /
`resources-links` 0 / snippet 3 / command 2 / url 1 / image 1, all matching the
recorded baselines. Dot colours unchanged at 3 × `#3b82f6`, 2 × `#a855f7`,
2 × `#f59553`, 1 × `#eab308`, plus the single muted `size-2.5` dot. Thirteen
accent gradients in the same per-type distribution as the card redesign
recorded (4 blue, 3 purple, 2 pink, 1 each green/grey/yellow/orange). Every
`Pinned` / `Favorite` / type-icon label carries `role="img"` with none bare
(17 / 7 / 7 / 4 across four routes) and the item chip is still unlabelled.
`w-48` still beats the trigger's base `w-fit` after the JSX moved into
`SortSelect`, and the sort label is still in the prerendered HTML rather than
appearing at hydration. `/collections/nope` still 404s, "New Snippet" still
renders on exactly one route, and the grid wrappers resolve to 2 × 3-col and
2 × 4-col on `/`. `npm run build` passes with 19 routes prerendering,
`tsc --noEmit` is clean, and the dev log is free of errors and hydration
warnings.

Known gaps and follow-ups:

- **Still not visually verified.** Eighth feature with this caveat. Playwright
  was not in the session's toolset again, so every check above is structural.
  The `ui-reviewer` agent does have it, which is the cheapest way to finally
  clear this backlog — worth doing before more card or layout work lands.
- `ColorDot` emits its classes in a different order than the two sites it
  replaced (`shrink-0 rounded-full size-2` rather than `size-2 shrink-0
  rounded-full`). The utilities do not conflict so the computed CSS is
  identical, but a `tailwind-merge` conflict introduced later would resolve
  differently than it used to.
- `TypeIcon`'s `label` is optional on the type, so the bare variant can be
  rendered without an accessible name and nothing catches it. A props union
  (`chip: true` | `label: string`) would make that unrepresentable; it was
  judged over-built for two call sites.
- `ui-classes.ts` has exactly two constants and no obvious third. If it does not
  grow, folding it back into whichever module ends up owning presentation
  concerns is reasonable.
- `TYPE_LABELS` duplicating `itemTypes[].label` is now flagged for the third
  feature running. `TypeIcon` made it slightly more visible — the label is now
  passed as a prop across a component boundary — without moving it.
- Carried forward untouched: the sidebar's Pinned and Recent rows are still
  inert `div`s, the sidebar's "Recent" count still means `items.length`,
  `MainHeader`'s search is still `readOnly`, a collection's `description` still
  renders nowhere on its own page, the display-only controls still give no
  feedback on click, and there is still no lint script or ESLint config.

### Lib Structure and Domain Types — 2026-08-05

Closed out the refactor-scanner audit of `src/lib/`. No user-facing change:
every route renders the same cards, counts, colours and text as before. Three
new files, sixteen edited, no deletions.

Six of the scan's nine findings were taken. Three structural questions were put
to the user before speccing and answered there: domain types consolidate under
`src/types/`, `dashboard-data.ts` splits both its types and its mappers out,
and `src/lib/` stays flat until the storage work gives the grouping a shape.

**`src/types/vault.ts` holds the domain types.** `ItemTypeId`, `ItemType`,
`Collection` and the whole `Item` union moved out of `mock-data.ts`, which now
imports them and exports only `itemTypes`, `collections` and `items` (333 → 260
lines). Six modules had been importing a module named "mock-data" purely for
types. The property that makes this worth having is measurable rather than
aesthetic: `mock-data.ts` now has exactly three importers — `vault-index`,
`dashboard-data`, `dashboard-nav` — and no page or component reaches into it at
all, so replacing mock arrays with filesystem reads is an edit to one module
instead of eight. `ItemView` stayed in `src/types/items.ts`; it is UI state, not
vault data, and the two files say so by being separate.

**`dashboard-data.ts` split three ways** and dropped from 182 lines to 104.
`DashboardStat`, `DashboardItem` and `DashboardCollection` went to
`src/types/dashboard.ts` — they are imported as types by 13 files and were never
an implementation detail of the accessors sitting beside them.
`toDashboardItem`, `toDashboardCollection`, `copyTextFor` and the renamed
`resolveCollectionNames` went to `src/lib/dashboard-mappers.ts`, which now
states the layering in its own header: vault types in, presentation types out,
and it never decides *which* records to show. What is left is ten accessors.

`TYPE_LABELS` had to move with the mappers rather than stay behind, because
`toDashboardItem` reads it and `dashboard-data.ts` imports the mappers — leaving
it would have created a cycle. `CollectionCard`'s import path changed with it.
A label map in a module called "mappers" is not the perfect home, but it is the
correct one until `ITEM_TYPE_META` grows a `label`. The resulting graph was
checked rather than assumed: nothing `dashboard-mappers` depends on
(`vault-index`, `format`, `item-types`, `types/*`) imports `dashboard-data`
back.

**`topCollectionsByRecency(limit)` in `vault-index.ts`** replaces the sort-slice
that `dashboard-nav.ts` and `dashboard-data.ts` each wrote for themselves. Both
asked "the N most recently updated collections" and differed only in N and in
the shape they mapped the answer to, so the query moved down a layer and both
limits stayed where they were — the duplication was the query, never the
numbers. It is named for what it returns rather than `getRecentCollections`,
which `dashboard-data.ts` already exports for the `DashboardCollection`
flavour; two functions a layer apart sharing a name and differing in return
type is a bug waiting to be written. It copies before sorting, since
`collections` is the vault's own array and every other module-scope reader
would otherwise see it reordered.

**`colorForType(type?)` in `item-types.ts`** replaces the identical
"first dominant type → its colour, else undefined" in `getDominantTypeColor`
and in `CollectionCard`, which had duplicated it only because one takes raw
`readonly Item[]` and the other already holds `dominantTypes`. The optional
parameter carries the `Resources & Links` muted-dot case: both callers index
into a possibly empty array.

**`getAllCollectionIds()` in `vault-index.ts`** lets
`collections/[collectionId]/page.tsx` stop importing `mock-data` for
`generateStaticParams`, which was the last crack in the encapsulation
`vault-index` exists to provide.

Implementation note: `dashboard-data.ts` was rewritten referencing
`topCollectionsByRecency` before that function existed, so findings 2 and 3
landed together rather than in the specced order. `tsc --noEmit` was clean at
the end of both.

Verified on the dev server. The check the spec called out as load-bearing —
finding 3 changing how `collectionNav` obtains its rows — came out exactly
right: the sidebar still lists `react-patterns`, `ai-prompts`,
`devops-commands` in that order with `#3b82f6`/`#a855f7`/`#f59553`, and the
recent-collection cards are those three plus `python-snippets`. Card counts
21 / 5 / 6 / 2 / 4 / 3 / 0 / 3 / 2 / 1 / 1 against the recorded baselines;
`/collections` dot colours unchanged at 3 × `#3b82f6`, 2 × `#a855f7`,
2 × `#f59553`, 1 × `#eab308` plus the one muted dot; 13 accent gradients in the
same per-type distribution; `role="img"` coverage 17/17, 7/7, 7/7, 4/4;
subtitles unchanged including both singular cases; the url item's `copyText`
still resolves to its URL out of the RSC payload, confirming the mapper move
did not alter output; `/collections/nope` still 404s and "New Snippet" still
renders on exactly one route. Three import-graph properties were grepped rather
than assumed: no cycle, `mock-data` down to three importers, and the sort
modules still free of `mock-data`. `npm run build` passes with 19 routes
prerendering, `tsc --noEmit` is clean, and the dev log is free of errors and
hydration warnings.

Known gaps and follow-ups:

- **Still not visually verified.** Ninth feature with this caveat, though this
  one touches no markup at all — it neither adds to the backlog nor clears it.
  The `ui-reviewer` agent has Playwright; one run against `main` would close out
  the whole thing rather than a tenth entry inheriting it.
- `src/types/vault.ts` is where a Zod schema for frontmatter will have to agree
  with the `Item` union. Separating the types from the mock data makes that
  pairing obvious in a way it was not before, but nothing validates at runtime
  yet.
- `TYPE_LABELS` duplicating `itemTypes[].label` was excluded again — fourth
  feature running. It now lives in `dashboard-mappers.ts`, which is a slightly
  odd address for it; putting `label` on `ITEM_TYPE_META` and dropping both
  copies is a small, self-contained branch whenever someone wants it.
- `vault-index.ts` has grown from two lookups to four exports and still builds
  its maps at module scope. That is correct only while the vault is static; the
  module comment says so, and `topCollectionsByRecency` is now a third thing
  that would need to become request-scoped.
- `src/lib/` is still flat at 12 files by choice. The decision to revisit
  grouping once `git/` and `filesystem/` exist is recorded here so it is not
  re-litigated from scratch.
- Carried forward untouched: the sidebar's Pinned and Recent rows are still
  inert `div`s, the sidebar's "Recent" count still means `items.length`,
  `MainHeader`'s search is still `readOnly`, a collection's `description` still
  renders nowhere on its own page, the display-only controls still give no
  feedback on click, and there is still no lint script or ESLint config.

### Git Vault 1 — Vault Foundation — 2026-08-06

Built the layer that turns a directory of Markdown files into `Item[]` and
`Collection[]`, plus the seed script that writes such a directory from
`mock-data.ts`. Spec 1 of 7
(`context/features/git-vault-1-foundation-spec.md`; series overview
`git-vault-0-overview.md`, design `docs/git-vault-architecture.md`).

**Nothing under `src/app/` or `src/components/` changed.** The app still renders
from `mock-data.ts` — the swap is spec 3, and this spec is deliberately a
read-only layer nothing in the app calls yet. No Git; `simple-git` is not
installed. Dependencies added: `yaml`, `server-only`, `zod`, plus `tsx` and
`vitest` as devDependencies.

**`src/lib/vault/config.ts`** resolves the vault root from `DEVVAULT_PATH`.
Unset is a setup error, never a `process.cwd()` fallback — the vault is a
*different* repository from the app, and silently writing items into the app's
own source tree would be worse than failing. A leading `~/` is expanded, which
the spec did not ask for but is what makes one `.env.local` work on more than
one machine; `path.join` never expands it and a literal `~` directory would
otherwise be created. `readVaultConfig` treats a *missing*
`.devvault/config.json` as fine (defaults: `autoCommit: false`,
`defaultBranch: 'main'`, `name` = directory basename) and a *malformed* one as
fatal, because guessing at what the user meant is how settings get silently
reverted.

**`src/lib/filesystem/`** is the security boundary. `resolveInVault` is the only
sanctioned way to build a vault path, and its escape check is on
`absoluteRoot + path.sep` rather than a string prefix — otherwise
`/vault-other/` would pass as inside `/vault/`. `walkVault` returns sorted,
POSIX-separated, vault-relative paths and skips `.git/`, `.devvault/`,
`node_modules/` and every dotfile. Nested directories under a type
(`snippets/react/…`) are walked and flattened: a folder is **not** a collection,
because collections are the many-to-many mechanism and folders would be a
second, conflicting one. `read-write.ts` normalises CRLF to LF on the way in as
well as out, which is what lets a file hand-edited on Windows still round-trip
byte-identically.

**`src/lib/markdown/frontmatter.ts`** exists for one property: stable
serialization. A vault is only worth keeping in Git if its diffs are readable,
and an unchanged item that re-serializes with different key order, different
quoting or a folded line produces a diff on every save. `lineWidth: 0` disables
folding so a long description stays a one-line diff, short sequences are emitted
inline (`tags: [react, hooks]`), and the frontmatter regex has no `m` flag so a
`---` rule further down the body is never mistaken for an opening delimiter.
`yaml` rather than `gray-matter`, which has not shipped since 2021 and bundles a
js-yaml v3 five years stale — `gray-matter` is a thin convenience over exactly
this code.

**`src/lib/vault/schema.ts`** is the runtime mirror of `src/types/vault.ts`, the
pairing the previous feature's notes predicted would be needed. Same
discriminated union on `type`, same five members, cross-referenced in comments
both ways so drift is visible. It owns the `collections` ⇄ `collectionIds`
rename so callers never see the on-disk key, and `toItemFrontmatter` owns the
canonical key order. Falsy flags and empty lists are *omitted* on write and
defaulted back on read, so a file stays legible on GitHub instead of carrying
`favorite: false` and `tags: []` on every item. `content` is the Markdown body,
not a frontmatter key — that is what makes a snippet render as a code block
rather than a quoted YAML string.

**`src/lib/vault/layout.ts`** was not in the spec's file list. It holds the
type ⇄ directory map (`url` → `links/`, the one name that is not a plural) and
the sidecar rule, because the reader and the seed script both need it and they
must never disagree. Splitting it out is what makes
`typeForPath(itemFilePath(t)) === t` a testable invariant rather than two
implementations that agree by coincidence.

**`src/lib/vault/reader.ts`** never throws on bad content. Hand-editing is
expected in a Git-native app and a merge can land a half-written file; one bad
file must not take the whole vault down. Malformed files are partitioned into
`errors` with a message someone can act on ("`language` is missing", not a Zod
dump), and every other file still loads. Duplicate ids are reported naming both
paths rather than silently resolved. Beyond the spec's error list, a `type` that
disagrees with its directory is also an error — the directory is *derived* from
the type on write, so a mismatch means one of the two was hand-edited, and
trusting either would move the item without the user asking. Collection
`updatedAt` is derived as `max(updatedAt)` over members, falling back to the
file's mtime when empty; storing it would mean every item save rewrote its
collections' files and give two representations that can disagree.

**`scripts/seed-vault.ts`** lives outside `src/` — the app reads the vault, it
does not seed it. It refuses a non-empty vault without `--force`, ignoring
dotfiles so seeding into a fresh `git init` is normal. `npm run seed` runs it
under `node --import tsx --conditions=react-server`; the condition is what lets
a script import modules guarded by `server-only`.

`src/lib/errors.ts` sits at the root of `src/lib/` rather than inside `vault/`
because `filesystem/paths.ts` throws `VaultError` too and `filesystem/` is
*below* `vault/` in the import graph. `VaultError` carries a `code` so callers
branch without matching message text, and its messages are written to be safe to
show in a browser — no repository paths, no stderr, no stack traces.

Decisions settled at `/feature start`: Vitest with committed tests (user's
call), `DEVVAULT_PATH=~/devvault` for development (user's call),
`resolveVaultPath`/`readVaultConfig` stay `async`, and `tsx` joins the
devDependencies despite the spec's "nothing else" — an ad-hoc `npx` download is
not a repeatable `npm run seed`.

**Testing.** 100 tests across 8 files. `vitest.config.mts` aliases `server-only`
to that package's own `react-server` build (`empty.js`) — without it every
module under `lib/filesystem/` and `lib/vault/` throws on import before a single
assertion runs. The suite covers all seven of the spec's verification items: the
seeded tree is the §3.1 shape (6 collections, 12 items, 18 `.md`), `readVault`
returns 12 items and 6 collections deep-equal to `mock-data.ts` apart from the
derived collection `updatedAt` (asserted separately against
`max(member updatedAt)`), every seeded file round-trips byte for byte, a file
with its `type:` deleted yields 11 items and one named error, and
`resolveInVault(root, '../../etc/passwd')` throws. `npm run build` passes with
19 routes prerendering and `tsc --noEmit` is clean.

At `/feature test`, four modules turned out to be covered only *incidentally*
through the seeded vault, which has no `.git/`, no nested type directory, no
CRLF and no hand-edited frontmatter — so `walk.ts`, `read-write.ts`, `layout.ts`
and `schema.ts` gained direct tests (52 of the 100). The new tests were
mutation-checked rather than assumed: dropping the dotfile skip, dropping CRLF
normalisation, renaming `links/` → `urls/` and reordering the frontmatter keys
each produced failures, and the sources were restored and re-verified.

Known gaps and follow-ups:

- **Nothing in the app calls any of this yet.** `readVault`, `readVaultConfig`,
  `ensureDir`, `removeFile` and `toVaultRelative` have no production callers —
  only tests and, for `resolveVaultPath`, the seed script. That is spec 1 doing
  exactly what it said, but it means the reader's `errors` array surfaces
  nowhere and no UI shows a malformed file to anyone. Spec 3 wires it up.
- `readVault` re-walks and re-reads the whole vault on every call, with no
  caching and no invalidation. Fine for a script; spec 3 has to decide where it
  sits relative to the request path, and `vault-index.ts` still builds its maps
  at module scope, which stops being correct the moment items come from disk.
- The `invalid_union` branch in `describeValidationError` is **dead code** under
  Zod v4: a discriminator failure arrives with `path: ['type']`, so the `!field`
  guard never fires and the generic branch produces "`type` invalid discriminator
  value. expected 'snippet' | …" instead. The message is still actionable —
  arguably more so, since it lists the valid types — so this is tidiness, not a
  bug. The tests assert the real message.
- No coverage tooling (`@vitest/coverage-v8` is not installed), so coverage is
  reasoned about per module rather than measured. `errors.ts` has no dedicated
  test file and `seed-vault.ts` is covered from `reader.test.ts`; both
  deliberate.
- The seed script is the only writer and it is outside the app. Writing items
  back from the UI is spec 5, and `serializeFrontmatter`'s byte-identical
  round-trip is the property that work depends on.
- Not visually verified — but this spec touches no markup at all, so it neither
  adds to that backlog nor clears it. `mock-data.ts` still exists and still
  renders the app.
- Carried forward untouched: `TYPE_LABELS` still duplicates `itemTypes[].label`,
  the sidebar's Pinned and Recent rows are still inert `div`s, the sidebar's
  "Recent" count still means `items.length`, `MainHeader`'s search is still
  `readOnly`, a collection's `description` still renders nowhere on its own
  page, the display-only controls still give no feedback on click, and there is
  still no lint script or ESLint config.
