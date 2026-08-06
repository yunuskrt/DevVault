# Git Vault 5 — Writes and Commits

Spec 5 of 7. See @context/features/git-vault-0-overview.md for the series.

## Overview

Make the vault writable: Server Actions that create, update and delete items and
collections, and an explicit commit.

The model is **write-through, commit explicitly** (§7.2). Saving writes the file
to disk immediately — nothing is ever lost and the file is real for any external
tool — and the commit is a separate, deliberate act. This is what the drawer
screenshot already sells with its **Commit changes** footer.

Requires spec 4.

## Scope note — where the UI for this lives

Item CRUD *UI* is `context/todo.md` phase 2b (the item detail drawer), not this
spec. This spec builds the action layer that phase 2b calls, plus the one piece
of commit UI that belongs in the sidebar and can be verified today.

The display-only buttons scattered around the app (New Item, `New {Type}`,
New Collection, `CollectionCardMenu` Edit/Delete) stay display-only. They get
handlers in phase 2b. Do not wire them here — the dialogs and editors they need
are that phase's design work.

## Requirements

### `src/lib/vault/writer.ts`

- `writeItem(item)` — serialize via the spec 1 markdown layer, resolve the path
  via `resolveInVault`, write. Returns the vault-relative path written.
- `deleteItem(id)` / `deleteCollection(id)`.
- `writeCollection(collection)`.
- Slug generation and collision handling for new items: `slugify(title)`, then
  `-2`, `-3` (§3.2). The `id` never changes afterwards, including when the title
  is edited.
- Renaming the file after a title edit is **optional and deferred** — a stable
  `id` means the path may safely go stale. If you do rename, use `git mv` so
  history follows, and never rename without asking.
- Binary items write their sidecar; the asset itself is handled by the upload
  route below.
- Set `updatedAt` on write; set `createdAt` on create. Both ISO-8601 UTC.

### `src/lib/git/simple-git-service.ts` — writing methods

- `stage(paths)` — `git.add(paths)` with **explicit paths only**. Never
  `git add -A`; the vault repository may contain files DevVault did not put
  there (§5.4).
- `commit(message)` — returns the hash.
- `discard(paths)` — for a future "revert this change" affordance; implement it
  now since it is one line and spec 7 wants it.
- Deletes go through `git.rm(paths)`, which removes from disk and index in one
  step, rather than `fs.unlink` plus a stage.

### The write queue

Every mutating Git call goes through a single in-process promise queue. Git takes
`.git/index.lock` and concurrent commands fail; Next.js serves requests
concurrently. This is not optional and it is easy to forget until it produces an
intermittent, unreproducible failure.

Also detect a **stale** `index.lock` left by a crashed process and report it
("Another Git operation is in progress") rather than hanging (§5.9).

### `src/actions/vault.ts`

`'use server'`. Every action validates its input with Zod and returns
`{ success, data, error }` per `coding-standards.md`.

- `createItem`, `updateItem`, `deleteItem`
- `createCollection`, `updateCollection`, `deleteCollection`
- `toggleFavorite`, `togglePinned`
- `commitChanges({ message })`

After any mutation, `revalidatePath('/', 'layout')` — **layout-scoped**, because
`GitSyncPanel` renders from `layout.tsx` and a page-scoped revalidation leaves a
stale dirty count behind (§6.2).

Errors map through the spec 4 error layer. No raw stderr, no paths, no stack
traces reach the browser.

### Commit messages

Built from `{verb} {type}: {title}`, matching the format `coding-standards.md`
already specifies: `Add note: Docker networking`, `Update snippet: pandas filter`,
`Delete prompt: code review`.

Put the builder in `src/lib/git/commit-message.ts` so the CLI (todo phase 4) can
reuse it rather than reinventing the wording.

A commit covering several changed files at once needs a different message —
decide the wording (e.g. `Update vault: 4 items`) and keep it in the same module.

### Commit UI in the sidebar

`GitSyncPanel` gains a real control in its uncommitted state: the dirty count
becomes a button that commits the pending changes. Pending state via
`useTransition`, success and failure via `sonner` (already installed and wired in
`layout.tsx`).

Whether the message is auto-generated or the user is prompted for one is a
judgement call — auto-generated is consistent with the drawer's single
**Commit changes** button, which offers no message field.

### `autoCommit`

`VaultConfig.autoCommit` exists from spec 1 and defaults to `false`. Honour it:
when true, a mutation commits itself, debounced ~5s so a burst of edits becomes
one commit. Keep the debounce in the service layer, not in a component.

### Uploads and assets

Two Route Handlers, because these genuinely need HTTP endpoints (§6.2):

- `POST /api/items/upload` — multipart upload for `image` and `file` items.
  Writes the asset plus its sidecar.
- `GET /api/assets/[...path]` — serves vault binaries, which live outside
  `public/` and cannot otherwise be rendered. Path-validate every request with
  `resolveInVault`, set `Content-Type` from the extension, and do not follow
  symlinks out of the vault.

If the upload UI is not built until phase 2b, still build and verify these two
endpoints here — they are server surface, not UI, and they are where a path
traversal bug would live.

## Verification

1. Call `createItem` for each of the seven types; each produces a file that
   `readVault` reads back identically, and each appears on the right routes with
   the right counts.
2. `updateItem` on an unchanged item produces **no diff** (`git diff` is empty) —
   the stable-serialization requirement from spec 1, verified end to end.
3. `deleteItem` removes the file and drops the counts everywhere consistently.
4. Panel shows the dirty count rising as items change; Commit clears it and the
   commit appears in `git log` with the specified message format.
5. Two mutations fired concurrently both succeed — the queue works. This is the
   check most likely to be skipped and most likely to matter.
6. `POST /api/assets/../../etc/passwd` and equivalent traversal attempts are
   rejected.
7. A failed commit (unset `user.email`) surfaces a useful message and leaves the
   working tree untouched.
8. `autoCommit: true` produces one commit for a burst of edits, not five.
9. Baseline counts still hold for the seeded vault before any mutation.
10. `npm run build` passes, `tsc --noEmit` clean.

## Out of scope

- Item detail drawer and item CRUD UI — todo phase 2b.
- Wiring New Item / New Collection / `CollectionCardMenu` Edit/Delete — same.
- Push, pull, fetch, sync — spec 6.
- Conflict handling — spec 7.
- Markdown/code editor choice (Tiptap, Monaco) — todo phase 2b.

## References

- @docs/git-vault-architecture.md — §5.3–5.4, §5.9, §6.2, §7.2, §7.5, §7.6
- @context/features/git-vault-0-overview.md
- @context/coding-standards.md — Server Actions, error handling, commit messages
- @context/screenshots/dashboard-ui-drawer.png — the Commit changes footer
