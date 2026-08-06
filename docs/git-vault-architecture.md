# Git Repository as Source of Truth — Architecture Research

> **Status:** Research / documentation only. No source files were changed.
> **Date:** 2026-08-06
> **Scope:** Replacing `src/lib/mock-data.ts` with a real Git-backed vault —
> engine choice, on-disk layout, module boundaries, the Git command surface the
> app actually needs, Next.js integration, and how each operation reaches the UI.
> **Feeds:** `context/todo.md` phase 1.

---

## 0. How to read this

Sections 1–3 are **decisions you must make before writing code**; each ends with
a recommendation and the reasoning. Sections 4–7 are the **design** that follows
from those decisions. Section 8 is a **phased migration plan** where each phase
leaves the app working. Section 9 lists **open questions** that this research
could not resolve for you.

Nothing here is committed to. Where the existing spec (`context/project-overview.md`)
already names a technology and this document recommends something else, the
disagreement is called out explicitly rather than glossed over.

---

## 1. Current state — what actually has to change

### 1.1 The data layer today

`src/lib/mock-data.ts` exports three static arrays (`itemTypes`, `collections`,
`items`). It has exactly three importers, which was deliberate:

| Module | What it does with it |
| --- | --- |
| `src/lib/vault-index.ts` | Builds `collectionsById` and `itemsByCollection` maps at **module scope** |
| `src/lib/dashboard-data.ts` | Ten accessors returning `DashboardItem[]` / `DashboardCollection[]` |
| `src/lib/dashboard-nav.ts` | Exports `primaryNav`, `collectionNav`, `typeNav` as **module-scope constants** |

Everything else in `src/` reads through those three. That containment is the
reason this migration is tractable at all — but two properties of the current
code are load-bearing and both break:

**(a) Everything is synchronous and evaluated once at import time.**
`vault-index.ts` says so in its own header comment. Filesystem reads are async
and the vault changes underneath the process, so every one of these becomes an
`async` function, and every caller becomes `await`-ing.

**(b) `SidebarContent` is a client component that imports the vault.**

```
src/components/dashboard/SidebarContent.tsx   ('use client')
  → src/lib/dashboard-nav.ts
    → src/lib/mock-data.ts        ← today: a bundled JS array
                                  ← tomorrow: node:fs + child_process
```

This is the single biggest structural change in the whole migration. Today the
mock arrays are harmlessly bundled into the client. The moment `mock-data.ts`
becomes a filesystem read, this import chain **fails to build** — and it must,
because `context/coding-standards.md` says "never expose filesystem or Git
credentials to the browser."

The fix is not subtle, just wide: `layout.tsx` (a server component) fetches nav
data and threads it as props through `DashboardShell` → `Sidebar` →
`SidebarContent`. All three are client components and all three grow a prop.

Twelve components carry `'use client'`. The ones that read vault data
(`SidebarContent`, `ItemBrowser`, `CollectionBrowser`, `DashboardItemSections`)
must receive it as serializable props — three of the four already do.

### 1.2 The rendering model today

All 19 routes prerender statically. Two use `generateStaticParams`
(`/items/[type]`, `/collections/[collectionId]`). A vault that changes on disk
cannot be baked at build time — see §6.1.

### 1.3 What the UI already promises

`GitSyncPanel.tsx` renders hardcoded `main` / `Synced` / `Last push 2m ago` /
`Sync`. `context/screenshots/dashboard-ui-drawer.png` shows a **Commit changes**
button pinned to the drawer footer and a metadata row reading
`Path  snippets/react/useDebounce hook`. Both are commitments this design has to
honour: the UI already assumes an explicit-commit model and a path-per-item.

---

## 2. Decision 1 — which Git engine

### 2.1 The candidates, measured

Figures pulled from the npm registry on 2026-08-06.

| Package | Latest | Published | Weekly DL | Mechanism |
| --- | --- | --- | --- | --- |
| **`simple-git`** | 3.36.0 | 2026-04-12 | 12.56M | Spawns the `git` binary, parses porcelain output |
| **`isomorphic-git`** | 1.40.0 | 2026-07-23 | 1.78M | Pure JS reimplementation of Git |
| **`@napi-rs/simple-git`** | 1.1.0 | 2026-07-07 | 355k | libgit2 via N-API (Rust) |
| **`es-git`** | 0.7.0 | 2026-05-17 | 14.4k | libgit2 via N-API (Rust), by Toss |
| **`nodegit`** | 0.27.0 | **2020-07-28** | 24k | libgit2 native bindings |

`nodegit` is effectively unmaintained — six years since its last publish, and it
was already notorious for source builds failing on new Node versions. **Rule it
out.**

### 2.2 The deciding constraint: authentication

`context/project-overview.md` already states the auth model:

> Access to private remote repositories is handled by the user's existing Git
> authentication mechanism (SSH keys, credential manager, or provider
> authentication).

**isomorphic-git cannot do this.** It has no SSH transport at all — by design,
not by omission — and authenticates only over HTTPS Basic auth via an `onAuth`
callback returning a username/token pair:

```js
await git.push({
  fs, http, dir, remote: 'origin', ref: 'main',
  onAuth: () => ({ username: process.env.GITHUB_TOKEN }),
})
```

For DevVault that means: the app must acquire, store and re-supply a Personal
Access Token for every remote. That is a credential store you now own, on a
local-first app whose whole selling point is that it does not own your data.
It also silently excludes every user whose vault remote is an `ssh://` or
`git@github.com:` URL — which for a developer-audience product is most of them.

The git binary, by contrast, already resolves SSH agents, `osxkeychain`,
`gh auth`, and any configured `credential.helper`. **DevVault stores no
credentials at all.** That is not a convenience, it is the security posture the
spec already committed to.

### 2.3 Feature coverage against what DevVault needs

isomorphic-git ships 70+ commands including `pull`, `merge`, `statusMatrix`,
`clone`, `fetch`, `push`, `add`, `remove`, `commit`, `log`, `currentBranch`,
`listBranches`, `checkout`, `abortMerge`, `stash`, `getConfig`/`setConfig`.
Genuinely comprehensive.

Not present: **`rebase`**, **`cherry-pick`**, **`reset`** (only the `resetIndex`
plumbing command). `rebase` matters — see §5.6, where diverged-history recovery
on a single-user multi-machine vault is the exact case `pull --rebase` exists
for. It also does not yet support **wire protocol v2**, per its own FAQ.

Its merge does work, and it surfaces conflicts explicitly:

```js
await git.merge({ fs, dir, ours: 'main', theirs: 'feature', abortOnConflict: false })
  .catch(e => {
    if (e instanceof Errors.MergeConflictError) { /* e.data = conflicted paths */ }
    else throw e
  })
// resolve files in the worktree, then:
await git.add({ fs, dir, filepath: '.' })
await git.commit({ fs, dir, ref: 'main', message: "Merge…", parent: ['main', 'feature'] })
```

By default it throws `MergeNotSupportedError` and leaves index and worktree
untouched, which is a defensible safe default.

### 2.4 Decision matrix

| Criterion | `simple-git` | `isomorphic-git` | `es-git` / `@napi-rs` |
| --- | --- | --- | --- |
| SSH remotes | ✅ inherited from git | ❌ **none, ever** | ⚠️ libgit2 callbacks, DIY |
| Credential helpers / keychain | ✅ free | ❌ app must store a PAT | ⚠️ manual |
| Needs `git` on PATH | ❌ yes | ✅ no | ✅ no |
| Native module in the build | ✅ no (pure JS, spawns) | ✅ no | ❌ yes → `serverExternalPackages` |
| `.gitignore`, hooks, LFS, submodules | ✅ all | ⚠️ partial | ⚠️ partial |
| `rebase` | ✅ | ❌ | ⚠️ |
| Performance on a large vault | ✅ native | ⚠️ pure JS, slowest | ✅ native |
| Runs in a browser | ❌ | ✅ **only one that does** | ❌ |
| Maturity | ✅ 12.5M/wk | ✅ 1.8M/wk | ⚠️ 0.x, 14k/wk |

### 2.5 Recommendation

> **Use `simple-git`, behind a `GitService` interface that isomorphic-git could
> later implement.**

The reasoning in one line: **DevVault is launched by `devvault start` on a
developer's machine, so `git` is present, and using it is the only option that
keeps credentials out of the application entirely.**

Two caveats, stated honestly:

1. **This contradicts `context/project-overview.md` and `context/todo.md`,**
   which both name isomorphic-git. That choice was made when the app was a
   sketch. If you disagree with the reasoning above, the interface in §4.3 is
   the hedge — swapping engines is one file.

2. **`devvault init` must verify the binary.** Run `git --version` and fail with
   an actionable message if absent. (This machine: `git version 2.39.3`.) The
   same check should verify `user.name` / `user.email` are configured, because
   `git commit` hard-fails without them and the error is opaque.

**When to revisit:** if DevVault ever ships a browser-only or WASM build with no
Node process, isomorphic-git becomes the only candidate — that is precisely what
it is for. `es-git` is worth watching but is pre-1.0 with 14k weekly downloads;
it is not something to bet a data layer on today.

---

## 3. Decision 2 — the on-disk vault layout

`context/todo.md` is right that "the file structure is the whole design." Every
open question it lists is answered below with a recommendation.

### 3.1 Recommended tree

```text
my-vault/
├── .devvault/
│   ├── config.json          # committed:   schemaVersion, vault name, settings
│   └── cache/               # gitignored:  derived index, search index
├── collections/
│   ├── react-patterns.md    # frontmatter only, body = description
│   └── ai-prompts.md
├── snippets/
│   └── use-debounce-hook.md
├── prompts/
├── notes/
├── commands/
├── links/
│   └── tailwind-config-reference.md
├── files/
│   ├── architecture-diagram.pdf        # the asset
│   └── architecture-diagram.pdf.md     # its sidecar metadata
├── images/
│   ├── dashboard-mock.png
│   └── dashboard-mock.png.md
└── .gitignore               # .devvault/cache/
```

This keeps the type-grouped tree from `project-overview.md`, which the drawer
screenshot's `Path  snippets/react/useDebounce hook` already assumes.

**Nested directories under a type are allowed** (`snippets/react/…`) and the
reader should walk recursively. They are purely cosmetic organisation — a folder
is *not* a collection. Collections are the many-to-many mechanism; folders would
be a second, conflicting one.

### 3.2 Identity: `id`, filename, and path

Three things that are easy to conflate:

| Concept | Value | Stable across rename? |
| --- | --- | --- |
| **`id`** | in frontmatter, e.g. `use-debounce-hook` or a ULID | ✅ yes |
| **path** | `snippets/use-debounce-hook.md` | ❌ no |
| **filename slug** | derived from the title | ❌ no |

> **Recommendation: `id` in frontmatter is the identity. The path is derived
> from the title and is free to change.**

Why not "path is the id"? Because `collectionIds[]` on an item, and any future
cross-link between items, would then break on every rename — and renaming on
title edit is exactly what a knowledge vault does constantly.

Rules that follow:

- **On create:** `id = slugify(title)`; if taken, append `-2`, `-3`…
  (Or use a ULID for guaranteed uniqueness at the cost of an ugly filename.
  Recommendation: **slug**, because the filename is user-visible in the Git repo
  and that is the entire point of being Git-native.)
- **On title change:** `id` stays. Ask before renaming the file. If renaming,
  use `git mv` so history follows.
- **On collision at load time** (two files claiming the same `id` — possible
  after a bad merge): surface it as a vault error listing both paths. Do not
  silently pick one.
- **Lookups:** the index holds `id → path` and `path → Item`. `findCollection`
  and `getItemsInCollection` in `vault-index.ts` keep their signatures.

### 3.3 Frontmatter schema

```markdown
---
id: use-debounce-hook
title: useDebounce hook
type: snippet
description: Delays a rapidly changing value until it settles.
collections: [react-patterns]
tags: [react, hooks, typescript]
language: tsx
favorite: true
pinned: true
createdAt: 2026-07-12T09:00:00Z
updatedAt: 2026-07-30T11:20:00Z
---

import { useEffect, useState } from "react"
…
```

Mapping to the existing `Item` union in `src/types/vault.ts`:

| Union member | Types | Frontmatter carries | Body carries |
| --- | --- | --- | --- |
| `CodeItem` | `snippet`, `command` | `language` (required) | `content` |
| `TextItem` | `prompt`, `note` | — | `content` |
| `UrlItem` | `url` | `url` (required) | notes (unused today) |
| `ImageItem` | `image` | `fileName` (required) | caption (unused) |
| `FileItem` | `file` | `fileName`, optional `language` | optional `content` |

Note the one rename: the frontmatter key is **`collections`** (reads naturally in
YAML), the TypeScript field stays `collectionIds`. The parser maps between them.

**`pinned` / `favorite` / `createdAt` / `updatedAt` in frontmatter: yes.**
The tempting alternative is deriving timestamps from `git log`, which is more
Git-native — but a newly written, uncommitted file then has no timestamps at all,
and per-file `git log` calls are O(files) subprocesses. If you want Git times,
get them in **one** pass (`git log --name-only --format=…` over the whole repo)
and treat them as enrichment, not as the source. Frontmatter stays authoritative.

### 3.4 Collections need a home

Collections carry `id`, `name`, `description`, `updatedAt` and have nowhere to
live if membership is only on items. Two options:

| | One `.md` per collection | Entries in `.devvault/config.json` |
| --- | --- | --- |
| Merge conflicts | ✅ isolated to one file | ❌ every edit touches one shared file |
| Git history | ✅ per-collection | ❌ one blob's history |
| Delete a collection | ✅ delete a file | ❌ rewrite JSON |

> **Recommendation: one `.md` per collection in `collections/`.** Same reasoning
> that already put `collectionIds` on the item rather than `itemIds` on the
> collection (recorded in `current-feature.md`): a shared index file rewritten on
> every change is a merge-conflict magnet, and multi-computer sync is the point.

**Do not store `updatedAt` on the collection file.** Derive it as
`max(updatedAt)` over its member items. Storing it means every item save also
rewrites its collections' files — write amplification, and two files that can
disagree. An empty collection falls back to its own file mtime or its create
time. (`Resources & Links` is the existing empty-collection case.)

### 3.5 Binary items

`image` and `file` items get **the asset plus a sidecar `<filename>.md`** holding
the frontmatter. `Item.fileName` already exists for this.

Alternatives considered and rejected: a single central metadata file (conflict
magnet again), or encoding metadata in the filename (unreadable, lossy).

Note in `.gitattributes` that large binaries may warrant Git LFS. LFS works
transparently under `simple-git`; it does **not** work under isomorphic-git —
one more entry in the §2.4 column.

---

## 4. The module design

### 4.1 Layering

```
  app/ (server components, Server Actions)
        │
        ├──► lib/dashboard-data.ts        which records to show
        │      └──► lib/dashboard-mappers.ts    vault type → presentation type
        │
        ├──► lib/vault/index.ts           the read model + cache
        │      ├──► lib/filesystem/       walk, read, write, path safety
        │      ├──► lib/markdown/         frontmatter ⇄ Item
        │      └──► lib/vault/schema.ts   Zod, at the boundary
        │
        └──► lib/git/                     status, commit, sync, history
               └──► simple-git ──► git binary
```

Two rules from `coding-standards.md` that this enforces structurally:

- `lib/git/` and `lib/filesystem/` start with `import 'server-only'`. A client
  import then fails at build with a clear error rather than leaking `node:fs`.
- Nothing in `components/` imports either. Ever.

`src/lib/` is flat today (12 files) by an explicit decision recorded in
`current-feature.md` — "revisit grouping once `git/` and `filesystem/` exist."
They now exist. This is the moment to introduce the subdirectories that
`coding-standards.md` has specified since day one.

### 4.2 Module contracts

**`src/lib/vault/config.ts`**

```ts
import 'server-only'

export type VaultConfig = {
  schemaVersion: 1
  name: string
  autoCommit: boolean          // §7.2
  defaultBranch: string
}

/** Resolves the vault root: DEVVAULT_PATH env → ~/.devvault/config → error. */
export const resolveVaultPath = async (): Promise<string> => { /* … */ }
export const readVaultConfig = async (root: string): Promise<VaultConfig> => { /* … */ }
```

The vault root is **not** `process.cwd()` — the vault is a separate repository
from this Next.js app. `devvault start` sets `DEVVAULT_PATH`.

**`src/lib/filesystem/paths.ts`** — the security boundary:

```ts
/**
 * Resolves a vault-relative path and asserts it stays inside the root.
 * Every path derived from user input (item id, filename, upload name)
 * goes through here. Blocks `../` traversal and absolute-path injection.
 */
export const resolveInVault = (root: string, relative: string): string => {
  const full = path.resolve(root, relative)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new VaultError('PATH_ESCAPE', relative)
  }
  return full
}
```

**`src/lib/markdown/frontmatter.ts`** — parse and serialize.

Library: **`yaml` (v2.9.0, 184M weekly)** over `gray-matter` (4.0.3, last
published **2021**, and it bundles a `js-yaml` v3 that is five years stale).
`gray-matter` is a thin convenience over exactly this; write the twenty lines and
keep the maintained parser.

```ts
export const parseItemFile = (raw: string): { data: unknown; body: string }
export const serializeItemFile = (data: object, body: string): string
```

Serialization must be **stable** — same key order every time, `\n` line endings,
no trailing-whitespace churn. Unstable output means every save produces a diff
even when nothing changed, and the whole value proposition here is readable
diffs.

**`src/lib/vault/schema.ts`** — Zod at the boundary.

`coding-standards.md` calls for Zod; `current-feature.md` flags that the `Item`
union "is compiler-enforced but not runtime-validated" and that "frontmatter
parsing will be [a boundary] — the union is the schema that validator has to
match." This is that validator:

```ts
const itemBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  collections: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  pinned: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const itemSchema = z.discriminatedUnion('type', [
  itemBase.extend({ type: z.enum(['snippet', 'command']), content: z.string(), language: z.string() }),
  itemBase.extend({ type: z.enum(['prompt', 'note']),     content: z.string() }),
  itemBase.extend({ type: z.literal('url'),   url: z.url() }),
  itemBase.extend({ type: z.literal('image'), fileName: z.string() }),
  itemBase.extend({ type: z.literal('file'),  fileName: z.string(),
                    content: z.string().optional(), language: z.string().optional() }),
])
```

`z.discriminatedUnion` on `type` mirrors the TypeScript union exactly — same
discriminant, same members. Keep them adjacent so drift is visible.

**Malformed files must not take the vault down.** A hand-edited file with bad
YAML is normal in a Git-native app. Return a partition, not a throw:

```ts
export type VaultLoadResult = {
  items: Item[]
  collections: Collection[]
  errors: Array<{ path: string; message: string }>   // surface in the UI
}
```

**`src/lib/vault/index.ts`** — replaces today's `vault-index.ts`. Same exported
shape (`findCollection`, `getItemsInCollection`, `topCollectionsByRecency`,
`getAllCollectionIds`), but async and request-scoped rather than module-scope.

### 4.3 The Git service interface

```ts
// src/lib/git/types.ts   — no simple-git import here; this is the seam.

export type GitStatus = {
  branch: string
  tracking: string | null      // 'origin/main' | null
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  created: string[]
  deleted: string[]
  conflicted: string[]
  isClean: boolean
}

export type SyncOutcome =
  | { kind: 'up-to-date' }
  | { kind: 'pulled';    commits: number }
  | { kind: 'pushed';    commits: number }
  | { kind: 'synced';    pulled: number; pushed: number }
  | { kind: 'conflict';  paths: string[] }
  | { kind: 'no-remote' }

export interface GitService {
  status(): Promise<GitStatus>
  stage(paths: string[]): Promise<void>
  commit(message: string): Promise<{ hash: string }>
  sync(): Promise<SyncOutcome>
  log(opts?: { path?: string; limit?: number }): Promise<GitCommit[]>
  fileAtRevision(path: string, hash: string): Promise<string>
  discard(paths: string[]): Promise<void>
  resolve(path: string, side: 'ours' | 'theirs'): Promise<void>
}
```

`src/lib/git/simple-git-service.ts` implements it. This is the escape hatch from
§2.5: if the engine decision is revisited, one file changes and nothing above the
interface notices. It is also the seam a test double plugs into — DevVault has
**no tests at all** today (`todo.md`), and this interface is the cheapest place
to start having some.

---

## 5. The Git command surface

Every operation the app needs, the underlying Git, and the `simple-git` call.
`simple-git` passes arguments as an array to `child_process` **without a shell**,
so argument injection is not a concern — but paths still go through
`resolveInVault` (§4.2) because Git will happily operate outside the vault if
given the chance.

### 5.1 Bootstrap — `devvault init`

| Need | Git | simple-git |
| --- | --- | --- |
| Is `git` installed? | `git --version` | `git.version()` |
| Is this a repo? | `git rev-parse --is-inside-work-tree` | `git.checkIsRepo()` |
| Create a vault | `git init -b main` | `git.init(false, ['-b', 'main'])` |
| Clone an existing vault | `git clone <url> <dir>` | `simpleGit().clone(url, dir)` |
| Identity configured? | `git config user.email` | `git.getConfig('user.email')` |
| Add a remote | `git remote add origin <url>` | `git.addRemote('origin', url)` |

Check identity **at init**, not at first commit. `git commit` without
`user.email` fails with a wall of text that will read like a DevVault bug.

### 5.2 Status — drives `GitSyncPanel`

```ts
const status = await git.status()
// → { current, tracking, ahead, behind, modified, created,
//     deleted, conflicted, staged, isClean() }
```

One `git status --porcelain=v2 --branch` under the hood: branch, upstream,
ahead/behind and every changed path in a single subprocess. This is the whole
data source for the sidebar panel. **Do not poll it on a timer** — recompute on
navigation and after mutations, plus optionally on a filesystem-watcher event
(§6.4).

### 5.3 Save an item

Writing a file is **not** a Git operation. `writeFile` → the file is now dirty →
`status.modified` grows → the panel shows "3 uncommitted changes". Committing is
separate and explicit (§7.2).

### 5.4 Commit

```ts
await git.add(paths)                 // scoped paths, never `add -A` blindly
await git.commit('Add note: Docker networking')
```

Two things to get right:

- **Scope the stage.** `git add -A` would sweep in anything else the user has in
  that repo. Stage the exact paths the operation touched.
- **Message format** — `coding-standards.md` already specifies it:
  `Add note: Docker networking`, `Update snippet: pandas filter`,
  `Delete prompt: code review`. Build it from `{verb} {type}: {title}`.

Deleting: `git.rm(paths)` (removes from disk *and* index) rather than `fs.unlink`
followed by `add`.

Renaming: `git.mv(from, to)` so history follows the file.

### 5.5 Push

```ts
await git.push('origin', branch)
// first push of a new branch:
await git.push(['-u', 'origin', branch])
```

`simple-git` forces `--verbose --porcelain` on push so the result is parseable
rather than scraped.

### 5.6 Pull — the operation that needs a real strategy

Never call `git pull` blind. **Fetch, inspect, then decide:**

```ts
await git.fetch()
const { ahead, behind, tracking } = await git.status()

if (!tracking)            return { kind: 'no-remote' }
if (!ahead && !behind)    return { kind: 'up-to-date' }
if (behind && !ahead)     { await git.merge(['--ff-only', tracking]); … }  // cannot conflict
if (ahead && !behind)     { await git.push(); … }
if (ahead && behind)      { /* diverged — see below */ }
```

The `--ff-only` case is worth isolating precisely because **it cannot produce a
conflict**. Most syncs on a single-user vault are exactly this, and routing them
through a path with no failure mode is most of the reliability you will get.

For the **diverged** case:

> **Recommendation: `git pull --rebase --autostash`.**

A DevVault vault is a single user's notes on two machines. Rebase replays your
local commits on top of the remote's, giving a linear, readable history — no
merge commits littering a knowledge repo. `--autostash` handles the very likely
case that the user has uncommitted edits when they hit Sync.

Note: **isomorphic-git has no `rebase`.** Under that engine this case must be a
merge commit.

### 5.7 Conflicts — never silent

`coding-standards.md`: *"Handle Git conflicts explicitly and never silently
overwrite user changes."*

Detection: `status.conflicted` is a non-empty array of paths, or a merge/rebase
command rejects. `simple-git` throws `GitResponseError` with `err.git` carrying
the parsed `MergeSummary`.

Resolution primitives:

| Intent | Git |
| --- | --- |
| Take the local version | `git checkout --ours <path>` then `git add <path>` |
| Take the remote version | `git checkout --theirs <path>` then `git add <path>` |
| Read both sides for a diff UI | `git show :2:<path>` / `git show :3:<path>` |
| Give up on a rebase | `git rebase --abort` |
| Give up on a merge | `git merge --abort` |
| Finish a rebase | `git rebase --continue` |

Because items are one-file-per-item with stable frontmatter serialization, a
conflict is almost always *"this item changed on both machines"* — which makes
per-item "keep mine / keep theirs" a genuinely adequate UI. That is a payoff of
§3.4's decision not to keep a central index file.

### 5.8 History (roadmap phase 6)

```ts
await git.log({ file: path, maxCount: 20 })     // per-item history
await git.show([`${hash}:${path}`])             // an item at a revision
```

`git log --follow` tracks a file through renames — worth it given §3.2 lets paths
change.

### 5.9 Isolation and safety

- **Serialize all writes.** Git takes `.git/index.lock` and concurrent commands
  fail. Next.js handles requests concurrently. Put every mutating call behind a
  single in-process promise queue in `simple-git-service.ts`. Also detect a
  **stale** `index.lock` (crashed process) and report it rather than deadlocking.
- **Bound execution.** `simpleGit({ timeout: { block: 20_000 } })` so a
  credential prompt on a remote never hangs a request forever.
- **Never surface raw stderr.** `coding-standards.md` forbids exposing internals.
  Map to a typed error union — and **`GIT_TERMINAL_PROMPT=0`** in the spawn env,
  so Git fails fast instead of blocking on an invisible password prompt.
- **Never log tokens.** Remote URLs can embed credentials
  (`https://user:token@host/…`). Redact before logging or displaying.

---

## 6. Next.js integration

Next 16.2.12, App Router, React 19.

### 6.1 The rendering model has to change

All 19 routes prerender today. A vault read at build time would be a snapshot.

**Options:**

| Approach | Fit |
| --- | --- |
| `export const dynamic = 'force-dynamic'` | ✅ correct, simple, right for a local app |
| `'use cache'` + `cacheTag('vault')` + `revalidateTag` | ⚠️ correct but adds an invalidation surface |
| `revalidatePath` after every mutation | ⚠️ works, but must not miss a path |

> **Recommendation: `force-dynamic` on every vault-reading route, plus React
> `cache()` for per-request deduplication. Add cross-request caching only if
> profiling says to.**

This is a local desktop app reading a few hundred small files off an SSD for a
single user. Read cost is negligible; a stale sidebar count is not. Correctness
first, and the cache is the thing you can add later without redesigning.

`generateStaticParams` in `/items/[type]` and `/collections/[collectionId]`
must go — collection ids come from disk and change at runtime.

Per-request dedupe, since `layout.tsx` and `page.tsx` both need the vault:

```ts
import { cache } from 'react'

export const loadVault = cache(async (): Promise<VaultLoadResult> => {
  const root = await resolveVaultPath()
  return readVault(root)
})
```

React `cache()` is scoped to a single request — two components calling it hit the
disk once, and the next request re-reads. Exactly the semantics wanted here.

### 6.2 Server Actions vs Route Handlers

`coding-standards.md` already draws this line. Applied:

**Server Actions** (`src/actions/`) — every mutation:

```ts
'use server'

import { revalidatePath } from 'next/cache'

export const commitChanges = async (input: unknown): Promise<ActionResult<{ hash: string }>> => {
  const parsed = commitInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Invalid commit message.' }

  try {
    const git = await getGitService()
    const { hash } = await git.commit(parsed.data.message)
    revalidatePath('/', 'layout')     // the sidebar panel lives in the layout
    return { success: true, data: { hash } }
  } catch (error) {
    return { success: false, error: toUserMessage(error) }
  }
}
```

Note `revalidatePath('/', 'layout')` — `GitSyncPanel` is rendered from
`layout.tsx`, so a page-scoped revalidation would leave a stale status behind.

**Route Handlers** (`src/app/api/`) — only where an HTTP endpoint is genuinely
required:

- `POST /api/items/upload` — multipart upload for `image` / `file` items.
- `GET  /api/assets/[...path]` — serving vault binaries. They live outside
  `public/`, so this is the only way to render them. Path-validate with
  `resolveInVault`, send `Content-Type` from the extension, and never follow
  symlinks out of the vault.
- Whatever the CLI (roadmap phase 4) consumes.

**Long syncs:** a Server Action is fine for a few seconds. If clone-on-first-run
needs progress, use a Route Handler streaming NDJSON — `simple-git`'s
`progress` callback feeds it.

### 6.3 Bundling

`simple-git` is pure JS that spawns a subprocess — no native module, so nothing
special is usually needed. If Turbopack ever mis-bundles it:

```ts
// next.config.ts
const nextConfig: NextConfig = { serverExternalPackages: ['simple-git'] }
```

That flag is **mandatory** if you pick `es-git` or `@napi-rs/simple-git` — a
`.node` binary cannot be bundled.

Also add the `server-only` package and import it at the top of every module in
`lib/git/` and `lib/filesystem/`.

### 6.4 External changes to the vault

The user will edit the vault in their editor, or pull from another terminal.
The app should notice.

**`chokidar` (v5.0.0, 205M weekly)** watching the vault root, ignoring `.git/`
and `.devvault/cache/`, debounced ~300ms. On change: `revalidateTag('vault')` or
`revalidatePath('/', 'layout')`.

Watch out: instantiate it once (Next dev-server hot reload will otherwise stack
watchers — guard with a `globalThis` singleton), and be aware `.git/` churns
constantly during Git operations, so ignoring it is not optional.

**This is optional for phase 1.** `force-dynamic` means every navigation re-reads
the vault anyway; the watcher only matters for a page sitting idle.

---

## 7. The UI surface

### 7.1 `GitSyncPanel` — from hardcoded to real

Currently `main` / `Synced` / `Last push 2m ago`. With `GitStatus` it becomes:

| State | Condition | Render |
| --- | --- | --- |
| Clean & synced | `isClean && !ahead && !behind` | ✅ `Synced` |
| Uncommitted | `!isClean` | ● `3 uncommitted` |
| Ahead | `ahead > 0` | ↑ `2 to push` |
| Behind | `behind > 0` | ↓ `1 to pull` |
| Diverged | both | ⇅ `2↑ 1↓` |
| Conflict | `conflicted.length` | ⚠ `2 conflicts` → conflict view |
| No remote | `!tracking` | ○ `Local only` |
| Syncing | action pending | ⟳ spinner |
| Error | last sync failed | ⚠ message + Retry |

`Last push 2m ago` needs a real source: `git log -1 --format=%cI <upstream>`, or
just show the last local commit time. The panel already has a `collapsed` variant
that needs an equivalent state summary in one icon.

`GitSyncPanel` is rendered inside `SidebarContent`, a **client** component, so
status arrives as a prop from the server `layout.tsx` — the same threading
described in §1.1. The `Sync` control becomes a real button calling a
`syncVault` Server Action with `useTransition` for pending state.

### 7.2 Commit granularity

`context/todo.md` leaves this open. The drawer screenshot answers it: a
**Commit changes** button pinned to the footer.

> **Recommendation: write-through, commit explicitly.**
>
> - Every save writes the file to disk immediately — nothing is ever lost, and
>   the file is real for any external tool.
> - Commits are a deliberate act: the drawer's **Commit changes** button, or a
>   dirty-count control in `GitSyncPanel`.
> - Offer `autoCommit: true` in `.devvault/config.json` (§4.2) for users who
>   want a commit per save, debounced ~5s so a burst of edits is one commit.

This matches the mental model the screenshots already sell, and it means an
in-progress edit never produces a junk commit.

### 7.3 The sync flow, end to end

```
User clicks Sync
  → useTransition pending → panel shows ⟳
  → syncVault() Server Action
      → fetch
      → branch on ahead/behind  (§5.6)
      → push if ahead
  → SyncOutcome
      up-to-date → toast "Already up to date"
      pulled     → toast "Pulled 3 changes"    + revalidatePath('/', 'layout')
      pushed     → toast "Pushed 2 commits"    + revalidatePath('/', 'layout')
      conflict   → NO toast; route to the conflict view
      no-remote  → toast "No remote configured" + link to settings
      error      → toast error, panel enters error state
```

`sonner` is already installed and wired in `layout.tsx`.

### 7.4 Conflict UI

Not in phase 1's critical path, but the shape should be decided now because §5.7
determines what data is available.

A dedicated view (route or full-screen dialog) listing each conflicted path with
the item title where resolvable, and per file: **Keep mine** / **Keep theirs** /
**Open in editor**. Footer: **Complete merge** (enabled when none remain) and
**Abort**.

The one thing that must not happen is a conflict being resolved implicitly by a
subsequent save. Block writes to conflicted paths while the conflict is open.

### 7.5 Optimistic updates

Favorite and pin toggles are the obvious `useOptimistic` candidates — a file
write plus a re-read is perceptible. Roll back and toast on failure.

Do **not** make Git operations optimistic. A push that "succeeded" in the UI and
failed on disk is exactly the class of lie that makes a sync tool untrustworthy.

### 7.6 Errors reaching the user

`coding-standards.md`: user-friendly, no stack traces, no internals.

| Internal | User-facing |
| --- | --- |
| `git: command not found` | "Git is not installed. Install Git and restart DevVault." |
| `user.email not set` | "Git needs your name and email. Run `git config --global user.email …`" |
| `Authentication failed` | "Could not authenticate with the remote. Check your Git credentials." |
| `index.lock exists` | "Another Git operation is in progress. Try again in a moment." |
| Zod failure on a file | "`snippets/foo.md` could not be read: `type` is missing." + path |

That last one deserves a persistent surface — a "vault issues" affordance
listing `VaultLoadResult.errors` — not a toast that vanishes. Files unreadable
today are files the user must fix by hand.

---

## 8. Migration plan

Each phase leaves `npm run build` passing and the app usable.

**Phase 1.0 — Read-only vault, no Git.**
`lib/filesystem/`, `lib/markdown/`, `lib/vault/`, Zod schemas. `mock-data.ts`
becomes a seed script that writes those 12 items + 6 collections into a real
vault directory, so the existing verification baselines (21 cards on `/`, 5
favorites, `react-patterns` 2, `resources-links` 0, the dot colours) stay valid
as a regression check — an unusually good test fixture to already have.
`vault-index` and `dashboard-data` go async. `force-dynamic`, drop
`generateStaticParams`. **Thread nav data from `layout.tsx` into `SidebarContent`
as props** (§1.1) — the biggest single diff. Git untouched.

**Phase 1.1 — Git read-only.**
`lib/git/` with `GitService`, `status()` and `log()`. `GitSyncPanel` shows real
branch / ahead / behind / dirty count. No writes yet — nothing can be broken.

**Phase 1.2 — Writes and commits.**
`src/actions/vault.ts`: create, update, delete, toggle favorite/pin. Write-through
to disk, explicit commit. The write queue (§5.9). Commit-message builder.

**Phase 1.3 — Sync.**
`sync()` with the fetch-then-decide strategy. Push, `--ff-only`, `--rebase`.
Sync button wired, `SyncOutcome` toasts.

**Phase 1.4 — Conflicts and robustness.**
Conflict detection and the resolution UI. Vault-error surface. Optional chokidar
watcher.

Then `todo.md` phase 2 (the drawer) sits on a real data layer, and its **Commit
changes** footer already has an action to call.

---

## 9. Open questions this research cannot decide for you

1. **Engine.** §2.5 recommends `simple-git` against the spec's isomorphic-git.
   This needs an explicit yes or no before phase 1.1, because it is the one
   decision the `GitService` interface only *partly* insulates you from —
   the missing `rebase` changes §5.6's strategy.
2. **Vault location.** `~/DevVault`? A path chosen at `devvault init` and stored
   in `~/.devvault/config.json`? Multiple vaults are roadmap phase 6, but where
   the *first* one lives has to be answered now.
3. **Item `id`: slug or ULID.** §3.2 recommends slug for readable filenames;
   ULID is safer against collisions. Affects every stored file.
4. **Are nested folders under a type user-facing?** The design permits them; the
   UI has no concept of them and the drawer shows a full path. Read-only, or
   editable?
5. **Does the app ever write to `.gitignore` / `.gitattributes`?** LFS for large
   binaries argues yes; touching the user's repo config argues no.
6. **Auto-commit default** — §7.2 recommends off. If on, the debounce window and
   the message format for a batched commit both need deciding.
7. **What happens on a dirty vault at startup?** Uncommitted changes from a
   previous session are normal, but a half-finished rebase is not. Detect
   `.git/REBASE_HEAD` / `MERGE_HEAD` at boot and surface it.

---

## 10. Sources

- [isomorphic-git](https://isomorphic-git.org/) — [onAuth](https://isomorphic-git.org/docs/en/onAuth), [authentication](https://isomorphic-git.org/docs/en/next/authentication), [push](https://isomorphic-git.org/docs/en/push.html), [FAQ](https://isomorphic-git.org/docs/en/faq), [command index](https://isomorphic-git.org/docs/en/alphabetic)
- [isomorphic-git on GitHub](https://github.com/isomorphic-git/isomorphic-git) — merge / statusMatrix / cache docs via Context7
- [SSH in isomorphic-git — obsidian-git discussion #526](https://github.com/denolehov/obsidian-git/discussions/526)
- [simple-git README](https://github.com/steveukx/git-js) · [npm](https://www.npmjs.com/package/simple-git)
- [es-git](https://es-git.dev/) · [GitHub](https://github.com/toss/es-git)
- [@napi-rs/simple-git](https://www.npmjs.com/package/@napi-rs/simple-git)
- [NodeGit](https://www.nodegit.org/)
- [npm-compare: isomorphic-git / nodegit / simple-git](https://npm-compare.com/isomorphic-git,nodegit,simple-git) · [npm trends](https://npmtrends.com/isomorphic-git-vs-nodegit-vs-simple-git)
- Next.js 16.2 docs via Context7 — `serverExternalPackages`, `revalidatePath`, ISR / caching
- Registry metadata and download counts: `registry.npmjs.org` / `api.npmjs.org`, retrieved 2026-08-06
- In-repo: `context/project-overview.md`, `context/coding-standards.md`, `context/todo.md`, `context/current-feature.md`, `context/screenshots/dashboard-ui-drawer.png`, `src/types/vault.ts`, `src/lib/vault-index.ts`, `src/lib/dashboard-nav.ts`, `src/components/dashboard/SidebarContent.tsx`, `src/components/dashboard/GitSyncPanel.tsx`
