# Git Vault 3 — Read Model Swap

Spec 3 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

Point the app at the vault on disk and delete `src/lib/mock-data.ts`.

This is the spec where phase 1's headline promise actually lands. Specs 1 and 2
exist to make it small: the reader already works, and the client sidebar no
longer imports the vault. What is left is turning three modules async and
changing how the routes render.

Requires spec 1 and spec 2. Still no Git.

## Requirements

### The request-scoped loader

`src/lib/vault/index.ts` replaces `src/lib/vault-index.ts`.

```ts
import { cache } from 'react'

export const loadVault = cache(async (): Promise<VaultLoadResult> => {
  const root = await resolveVaultPath()
  return readVault(root)
})
```

React `cache()` dedupes within a single request — `layout.tsx` and `page.tsx`
both need the vault and must hit the disk once — and re-reads on the next
request. That is exactly the semantics wanted; do not add cross-request caching
(§6.1).

The existing reverse-index functions keep their names and meanings but become
async and take their data from `loadVault()` rather than module scope:
`findCollection`, `getAllCollectionIds`, `topCollectionsByRecency`,
`getItemsInCollection`. Delete the module-scope `Map` construction and the header
comment that says it is only valid while the vault is static — it has done its
job.

### Async accessors

`src/lib/dashboard-data.ts` — all ten accessors become `async`. Signatures and
return types are otherwise unchanged, including the optional `now` parameter that
threads one clock through every timestamp.

`src/lib/dashboard-nav.ts` — the three getters from spec 2 become `async`.

`src/lib/dashboard-mappers.ts`, `item-sort.ts`, `collection-sort.ts`,
`sort-utils.ts`, `item-types.ts`, `format.ts` — **unchanged**. They are pure
functions over data handed to them. If any of them needs to change, something
has gone wrong in the layering.

### Rendering model

- `export const dynamic = 'force-dynamic'` on every route that reads the vault.
  A vault read at build time is a snapshot; the whole point is that it changes.
- Delete `generateStaticParams` from `/items/[type]` and
  `/collections/[collectionId]`. Collection ids come from disk now.
- Every page component becomes `async` and awaits its accessors. `/items/[type]`
  and `/collections/[collectionId]` already are.

### Delete the mock

Remove `src/lib/mock-data.ts`. It has exactly three importers today
(`vault-index`, `dashboard-data`, `dashboard-nav`) and all three change here.

`itemTypes` is the one export that is not vault data — it is the fixed list of
seven built-in types. Move it to `src/lib/item-types.ts`, which already owns
`ITEM_TYPE_META` keyed by the same `ItemTypeId`. Adding `label` there also closes
the `TYPE_LABELS` duplication flagged for four features running in
`context/current-feature.md` — take that fix while you are in the file.

Keep the seeded vault reproducible: `scripts/seed-vault.ts` from spec 1 must
survive the deletion of `mock-data.ts`, so inline the seed data into the script.

### Vault errors

`VaultLoadResult.errors` is non-empty when a file fails to parse. For this spec,
the minimum is: the app renders everything that *did* parse, and the errors are
not silently dropped — log them server-side. The user-facing surface is spec 7.

### Missing or unset vault

If `DEVVAULT_PATH` is unset or the directory does not exist, the app must render
a clear setup screen explaining what to set — not a stack trace, and not an empty
dashboard that looks like a working vault with no content. This is now the first
thing a new user hits.

## Verification

Against the baseline in @context/features/git-vault-0-overview.md — every number
must be identical to what it was before this spec:

1. `/` renders 21 cards; stats read 12 / 6 / 5 / 3.
2. `/favorites` 5, `/collections` 6, `react-patterns` 2, `devops-commands` 4,
   `context-files` 3, `resources-links` 0, `/items/snippet` 3, `command` 2,
   `url` 1, `image` 1.
3. Sidebar order and dot colours unchanged; `/collections` dot distribution
   unchanged (3 blue, 2 purple, 2 orange, 1 yellow, 1 muted).
4. 13 accent gradients on `/` in the same per-type distribution.
5. Relative dates still render and no hydration warnings appear — timestamps are
   still computed on the server and passed down as finished strings.
6. `/collections/nope` 404s.
7. **Edit a file in the vault by hand, reload the page, see the change.** This is
   the single check that proves the spec did what it claims.
8. Delete a file from the vault; counts drop everywhere consistently.
9. `grep -rn "mock-data" src/` returns nothing.
10. `npm run build` passes. Routes are now dynamic rather than prerendered —
    expect the build output to change and confirm it changed the way you expect.

## Out of scope

- Writing anything to the vault — spec 5.
- Git — spec 4.
- The chokidar file watcher. `force-dynamic` re-reads on every navigation, so a
  watcher only matters for an idle page (§6.4). Spec 7 if wanted at all.
- A user-facing list of vault errors — spec 7.

## References

- @docs/git-vault-architecture.md — §6.1 (rendering), §4.2 (`vault/index.ts`)
- @context/features/git-vault-0-overview.md · @context/features/git-vault-1-foundation-spec.md
- @src/lib/vault-index.ts · @src/lib/dashboard-data.ts · @src/lib/dashboard-nav.ts
- @context/current-feature.md — the baselines this spec must preserve
