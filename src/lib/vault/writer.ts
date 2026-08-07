import 'server-only'

import fs from 'node:fs/promises'

import { resolveInVault } from '@/lib/filesystem/paths'
import { removeFile, writeTextFile } from '@/lib/filesystem/read-write'
import { serializeFrontmatter } from '@/lib/markdown/frontmatter'
import {
  TYPE_DIRECTORIES,
  collectionFilePath,
  itemFilePath,
} from '@/lib/vault/layout'
import {
  itemBody,
  toCollectionFrontmatter,
  toItemFrontmatter,
} from '@/lib/vault/schema'
import type { Collection, Item, ItemTypeId } from '@/types/vault'

/**
 * The write half of the vault layer — the counterpart to `reader.ts`.
 *
 * **This module touches the filesystem and nothing else.** It runs no Git
 * commands and makes no decision about committing; §5.3 is explicit that
 * writing a file is not a Git operation. `mutations.ts` sits above this and
 * decides what Git is told afterwards, which is what keeps "the file is always
 * written, even if Git fails" true by construction rather than by care.
 *
 * Every path built here goes through `resolveInVault`, and every id and
 * filename is slugified first, so a title of `../../etc/passwd` produces the
 * file `notes/etc-passwd.md`.
 */

/**
 * A title reduced to a filename-safe slug (§3.2).
 *
 * The output is `[a-z0-9-]` only, which is what makes it safe to interpolate
 * into a path: it cannot contain a separator, a `..`, a drive letter or a
 * leading dot. `resolveInVault` is still the boundary that enforces this — this
 * is the layer that stops a legitimate title from tripping it.
 *
 * `NFKD` before stripping means `Café` becomes `cafe` rather than `caf`, so an
 * accented title still produces a readable filename instead of a mangled one.
 */
export const slugify = (title: string): string => {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')

  // A title of nothing but punctuation or non-Latin script slugifies to the
  // empty string, which would produce the file `.md` — hidden, and skipped by
  // the walker that would have to read it back.
  return slug || 'item'
}

/**
 * `slugify(title)`, then `-2`, `-3` until free (§3.2).
 *
 * `taken` is asked about candidates rather than enumerated, so the caller
 * decides what "taken" means — an existing id for a new item's identity, an
 * existing file for its path.
 *
 * **`taken` must depend on the candidate.** The loop is unbounded, so a
 * predicate that ignores its argument and returns `true` never terminates —
 * and because it is synchronous, it blocks the event loop rather than hanging a
 * single request. A binary item is the live trap: its path is derived from
 * `fileName` rather than from the id, so consulting that path here would be
 * constant. `createItem` checks that case before calling this.
 */
export const uniqueSlug = (
  title: string,
  taken: (candidate: string) => boolean,
): string => {
  const base = slugify(title)
  if (!taken(base)) return base

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken(candidate)) return candidate
  }
}

/**
 * The directory an item's file sits in, which is not always its type's
 * directory: `snippets/react/use-debounce.md` is a snippet the user filed under
 * a subfolder of their own. A rename has to stay put rather than yanking the
 * file back up to the top level, so it keeps the existing directory and changes
 * only the basename.
 */
const directoryOf = (path: string): string => {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/**
 * Where a *new* item's file goes. Binary items are named for their asset (§3.5)
 * because the sidecar has to sit beside it; everything else is named for its
 * slug.
 */
export const newItemPath = (
  type: ItemTypeId,
  slug: string,
  fileName?: string,
): string => itemFilePath(type, slug, fileName)

/**
 * The path an item's file *should* have given its current title, keeping it in
 * whatever directory it already lives in.
 *
 * Returns `null` when the file should not move: binary items are named for
 * their asset rather than their title, and an unchanged basename is not a
 * rename.
 */
export const renamedItemPath = (
  item: Item,
  currentPath: string,
  taken: (candidate: string) => boolean,
): string | null => {
  if (item.type === 'image' || item.type === 'file') return null

  const directory = directoryOf(currentPath) || TYPE_DIRECTORIES[item.type]
  const currentBase = currentPath.slice(currentPath.lastIndexOf('/') + 1)

  const slug = uniqueSlug(item.title, (candidate) => {
    const path = `${directory}/${candidate}.md`
    return path !== currentPath && taken(path)
  })

  const next = `${directory}/${slug}.md`
  return next === currentPath || `${slug}.md` === currentBase ? null : next
}

/** The exact bytes an item serializes to. Extracted so a caller can compare. */
export const serializeItem = (item: Item): string =>
  serializeFrontmatter(toItemFrontmatter(item), itemBody(item))

/** Not exported: `serializeItem` is, because `updateItem` compares with it to
 * decide whether a write is needed at all. A collection has no such caller. */
const serializeCollection = (collection: Collection): string =>
  serializeFrontmatter(
    toCollectionFrontmatter(collection),
    collection.description ?? '',
  )

/**
 * Writes an item to an explicit path.
 *
 * The path is a parameter rather than derived from the item because §3.2 lets
 * the two diverge — see `VaultLoadResult.itemPaths`. Callers get the path from
 * the index for an existing item, or from `newItemPath` for a new one.
 */
export const writeItem = async (
  root: string,
  item: Item,
  path: string,
): Promise<string> => {
  await writeTextFile(root, path, serializeItem(item))
  return path
}

export const writeCollection = async (
  root: string,
  collection: Collection,
  path: string = collectionFilePath(collection.id),
): Promise<string> => {
  await writeTextFile(root, path, serializeCollection(collection))
  return path
}

/** Whether a vault-relative path exists. */
export const vaultFileExists = async (
  root: string,
  path: string,
): Promise<boolean> => {
  try {
    await fs.access(resolveInVault(root, path))
    return true
  } catch {
    return false
  }
}

/**
 * Moves a file within the vault, without Git.
 *
 * `mutations.ts` prefers `git mv` so history follows the rename (§5.4); this is
 * the fallback for a vault that is not a repository yet, or a file Git does not
 * track.
 */
export const moveFile = async (
  root: string,
  from: string,
  to: string,
): Promise<void> => {
  const target = resolveInVault(root, to)
  await fs.mkdir(resolveInVault(root, directoryOf(to) || '.'), {
    recursive: true,
  })
  await fs.rename(resolveInVault(root, from), target)
}

/** Deletes vault files. Missing files are not an error. */
export const deleteFiles = async (
  root: string,
  paths: string[],
): Promise<void> => {
  for (const path of paths) {
    await removeFile(root, path)
  }
}
