# Git Vault 1 — Vault Foundation

Spec 1 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

Build the layer that turns a directory of Markdown files into `Item[]` and
`Collection[]`, and write a seed script that creates such a directory from
today's mock data.

**Nothing in `src/app/` or `src/components/` changes.** The app still renders
from `src/lib/mock-data.ts` at the end of this spec. That swap is spec 3.
This spec is done when a script can write the vault to disk and a loader can
read it back into exactly the objects `mock-data.ts` exports today.

No Git. `simple-git` is not installed in this spec.

## Decisions this spec implements

- Vault root comes from `DEVVAULT_PATH`. Unset is an error.
- Layout, frontmatter keys and collection storage: @docs/git-vault-architecture.md §3.
- `id` is a title slug, stable across later renames. §3.2.
- YAML via the `yaml` package, **not** `gray-matter` (unmaintained since 2021,
  bundles a stale js-yaml v3). §4.2.

## Requirements

### Dependencies

Add `yaml` and `server-only`. Add `zod` — `coding-standards.md` has called for it
since day one and this is the boundary it exists for. Nothing else.

### `src/lib/vault/config.ts`

```ts
export type VaultConfig = {
  schemaVersion: 1
  name: string
  autoCommit: boolean
  defaultBranch: string
}
```

- `resolveVaultPath()` — reads `DEVVAULT_PATH`, resolves to an absolute path,
  asserts the directory exists. A missing or unset value throws a `VaultError`
  whose message tells the user what to set and where.
- `readVaultConfig(root)` — reads and validates `.devvault/config.json` against
  a Zod schema. A missing file is not fatal: fall back to documented defaults
  (`autoCommit: false`, `defaultBranch: 'main'`, `name` = the directory name).
- Add `DEVVAULT_PATH` to `.env.local` for development. `.env*` is already
  gitignored. Document the variable in `README.md`.

### `src/lib/filesystem/`

- `paths.ts` — `resolveInVault(root, relative)`, exactly as in §4.2. Every path
  derived from user input goes through it. Path traversal outside the root
  throws. This is a security boundary; give it a comment saying so.
- `walk.ts` — recursive directory walk returning vault-relative paths. Skips
  `.git/`, `.devvault/cache/`, and dotfiles. Nested directories under a type
  (`snippets/react/…`) are walked and are **not** collections (§3.1).
- `read-write.ts` — `readTextFile`, `writeTextFile`, `ensureDir`, `removeFile`.
  UTF-8, `\n` line endings.

### `src/lib/markdown/frontmatter.ts`

- `parseFrontmatter(raw)` → `{ data: unknown, body: string }`. Returns
  `data: {}` and the whole input as body when there is no `---` block.
- `serializeFrontmatter(data, body)` → string.

Serialization must be **stable**: fixed key order, `\n` endings, no trailing
whitespace, no re-quoting churn. An unchanged item must serialize byte-identically
to what was read, or every save produces a phantom diff and the readable-history
value of the whole project evaporates. Round-tripping every seeded file
unchanged is the acceptance test for this.

### `src/lib/vault/schema.ts`

Zod schemas mirroring `src/types/vault.ts`. `itemSchema` is a
`z.discriminatedUnion('type', …)` with the same five members as the `Item`
union — see §4.2 for the shape. Also `collectionSchema` and the config schema.

Frontmatter key `collections` maps to the TypeScript field `collectionIds`; the
mapping lives here, not in callers.

Keep the schema file and `src/types/vault.ts` referring to each other in
comments so drift between the compile-time union and the runtime validator is
visible to whoever edits either.

### `src/lib/vault/reader.ts`

```ts
export type VaultLoadResult = {
  items: Item[]
  collections: Collection[]
  errors: Array<{ path: string; message: string }>
}

export const readVault = (root: string): Promise<VaultLoadResult>
```

Rules:

- A malformed or unparseable file **never throws**. It lands in `errors` with
  its vault-relative path and a message a human can act on ("`type` is missing",
  not a raw Zod dump). One bad file must not take the vault down — hand-editing
  is expected in a Git-native app.
- Two files claiming the same `id` is an error listing both paths. Do not
  silently pick one (§3.2).
- Collection `updatedAt` is **derived** as `max(updatedAt)` over member items,
  not stored on the collection file (§3.4). Empty collections fall back to the
  collection file's mtime — `Resources & Links` is the case that exercises this.
- Binary items (`image`, `file`) are read from their sidecar `<filename>.md`
  (§3.5); the asset itself is not read here.

### `scripts/seed-vault.ts`

A standalone Node script (`npx tsx scripts/seed-vault.ts`, or add an
`npm run seed` script) that writes the current contents of `src/lib/mock-data.ts`
into `$DEVVAULT_PATH` as real files, `git init`-ing nothing and committing
nothing — just files on disk.

It refuses to run against a non-empty vault unless passed `--force`.

## Verification

1. `npm run seed` produces the tree in §3.1: 6 files under `collections/`,
   12 item files across `snippets/`, `prompts/`, `notes/`, `commands/`,
   `links/`, `files/`, `images/`.
2. Read one seeded file by eye. The frontmatter must be legible and the body
   must be the item's content — this is what a user sees on GitHub.
3. `readVault(root)` returns 12 items and 6 collections with `errors` empty, and
   the objects deep-equal what `mock-data.ts` exports — **except** collection
   `updatedAt`, which is now derived; assert those separately against
   `max(member updatedAt)`.
4. Round-trip: `serializeFrontmatter(parseFrontmatter(f))` is byte-identical to
   `f` for all 18 seeded files.
5. Corrupt one file by hand (delete its `type:`). `readVault` still returns 11
   items and one entry in `errors` naming that path.
6. `resolveInVault(root, '../../etc/passwd')` throws.
7. `npm run build` passes and `tsc --noEmit` is clean. The app renders exactly
   as before — this spec changed nothing it reads.

## Out of scope

- Any change to `src/app/`, `src/components/`, `dashboard-data.ts`,
  `dashboard-nav.ts` or `vault-index.ts` — spec 3.
- Writing items back to disk — spec 5. This spec reads only; the seed script is
  the one writer and it is not part of the app.
- Anything Git — spec 4.
- Deleting `mock-data.ts` — spec 3.

## References

- @docs/git-vault-architecture.md — §3 (layout), §4.2 (module contracts)
- @context/features/git-vault-0-overview.md
- @src/types/vault.ts · @src/lib/mock-data.ts
- @context/coding-standards.md
