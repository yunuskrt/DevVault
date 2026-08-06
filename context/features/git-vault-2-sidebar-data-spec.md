# Git Vault 2 — Sidebar Data Threading

Spec 2 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

`SidebarContent.tsx` is a **client** component and it imports the vault:

```
SidebarContent.tsx  ('use client')
  → src/lib/dashboard-nav.ts
    → src/lib/mock-data.ts
```

Today that is harmless — the mock arrays bundle into the browser. The moment
`mock-data.ts` becomes a filesystem read (spec 3), **this import chain fails to
build**, and it must: `coding-standards.md` forbids filesystem access reaching
the browser.

This spec fixes that chain **while the data source is still static mock data**,
so it is a pure refactor with zero behaviour change and an exact regression
baseline. Doing it here rather than inside spec 3 means the risky async
conversion and the wide prop-threading diff never land in the same branch.

Nothing about this spec is Git-related. It is spec 3's prerequisite.

## Requirements

### Move nav derivation to the server

`src/lib/dashboard-nav.ts` currently exports three **module-scope constants**:
`primaryNav`, `collectionNav`, `typeNav`. Convert each to a function
(`getPrimaryNav()`, `getCollectionNav()`, `getTypeNav()`) returning the same
shapes. They stay synchronous in this spec; spec 3 makes them async.

Keep `getTypeNavEntry(id)` working — `/items/[type]` uses it for its 404 check
and its header label. It may need to take the nav array as an argument once the
data is no longer module-scope; decide in favour of whatever keeps the page
simple.

### Thread the data through

`src/app/layout.tsx` is a server component. It calls the three getters and
passes the result down:

```
layout.tsx (server)
  → DashboardShell  ('use client')   +nav prop
    → Sidebar       ('use client')   +nav prop
      → SidebarContent ('use client') +nav prop
```

Define one `SidebarNav` type carrying all three lists rather than three separate
props threaded through three components. Put it in `src/types/dashboard.ts`
alongside the other presentation types.

Everything crossing the boundary must be serializable. **`LucideIcon` components
on `TypeNavEntry` and `PrimaryNavEntry` are not.** Pass an icon *key* and resolve
it to a component inside the client. `ITEM_TYPE_META` in `src/lib/item-types.ts`
is already the icon map for types and can stay a client-side import; the two
primary entries (`LayoutDashboard`, `Star`) need equivalent treatment. This is
the one genuinely fiddly part of the spec — the icon on the type row and the two
primary rows must look identical afterwards.

### Verify the import graph

After the change, grep must show:

- `SidebarContent.tsx` no longer imports `dashboard-nav`
- No `'use client'` file anywhere reaches `mock-data.ts` through any chain

The second check is the actual acceptance criterion for this spec. Record the
grep in the feature history so spec 3 can rely on it.

## Verification

Every number below is unchanged from today; any difference is a bug.

1. Sidebar lists React Patterns `#3b82f6`, AI Prompts `#a855f7`,
   DevOps & Commands `#f59553`, in that order, with counts 2 / 2 / 4.
2. Type rows: Snippet 3, Prompt 2, Note 2, Command 2, File 1, Image 1, URL 1 —
   each with its own icon in its own colour, visually unchanged.
3. Dashboard 12, Favorites 5 on the primary rows.
4. Collapse the rail: icon-only mode still shows every row, tooltips intact.
5. Mobile sheet renders the same nav as the desktop aside.
6. `aria-current="page"` still lands correctly on a collection route and on
   `/favorites`.
7. Card counts across all routes match the baseline in the overview spec.
8. `npm run build` passes, `tsc --noEmit` clean, no hydration warnings.

## Out of scope

- Changing where the data comes from — spec 3. `mock-data.ts` still exists and
  is still the source at the end of this spec.
- Making anything async.
- The inert Pinned and Recent sidebar rows (carried gap, unrelated).
- `GitSyncPanel` — it renders inside `SidebarContent` but its data stays
  hardcoded until spec 4.

## References

- @docs/git-vault-architecture.md — §1.1
- @context/features/git-vault-0-overview.md
- @src/components/dashboard/SidebarContent.tsx · @src/components/dashboard/Sidebar.tsx
- @src/components/dashboard/DashboardShell.tsx · @src/lib/dashboard-nav.ts
- @src/app/layout.tsx
