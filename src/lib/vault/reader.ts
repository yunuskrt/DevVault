import 'server-only'

import { YAMLParseError } from 'yaml'

import { fileModifiedAt, readTextFile } from '@/lib/filesystem/read-write'
import { isMarkdown, walkVault } from '@/lib/filesystem/walk'
import { parseFrontmatter } from '@/lib/markdown/frontmatter'
import {
  COLLECTIONS_DIR,
  TYPE_DIRECTORIES,
  topLevelDirectory,
  typeForPath,
} from '@/lib/vault/layout'
import {
  collectionFrontmatterSchema,
  describeValidationError,
  itemFrontmatterSchema,
  toCollection,
  toItem,
} from '@/lib/vault/schema'
import type { Collection, Item } from '@/types/vault'

/**
 * Reads a vault directory into the domain types.
 *
 * **Nothing here throws on bad content.** Hand-editing is expected in a
 * Git-native app, and a merge can land a half-written file; one bad file must
 * not take the whole vault down. Malformed files are partitioned into `errors`
 * with a message someone can act on, and every other file still loads.
 */

export type VaultLoadError = {
  /** Vault-relative and POSIX-separated, so it is safe to show in the UI. */
  path: string
  message: string
}

export type VaultLoadResult = {
  items: Item[]
  collections: Collection[]
  errors: VaultLoadError[]
  /**
   * `id` → the vault-relative path the record was read from (§3.2).
   *
   * The path is *not* derivable from the id: it is derived from the title on
   * create, and a title edit renames the file while the id stays put. A writer
   * that recomputed the path from the id would write a second file claiming an
   * id that already exists, which the loop below reports as a duplicate. So
   * the only reliable way to find an existing record's file is to remember
   * where it was read from.
   *
   * Only ids that loaded cleanly appear here — a file rejected above has no
   * trustworthy id to key on.
   */
  itemPaths: ReadonlyMap<string, string>
  collectionPaths: ReadonlyMap<string, string>
}

/**
 * Filesystem and YAML errors carry absolute paths in their messages, which must
 * never reach the browser. Only the parser's own diagnostic is passed through,
 * and only its first line.
 */
const readErrorMessage = (error: unknown): string =>
  error instanceof YAMLParseError
    ? `frontmatter is not valid YAML: ${error.message.split('\n')[0]}`
    : 'could not be read'

export const readVault = async (root: string): Promise<VaultLoadResult> => {
  const files = (await walkVault(root)).filter(isMarkdown)

  const items: Item[] = []
  const collections: Collection[] = []
  const errors: VaultLoadError[] = []

  const itemPathsById = new Map<string, string>()
  const collectionPathsById = new Map<string, string>()

  const itemFiles = files.filter(file => typeForPath(file) !== undefined)
  const collectionFiles = files.filter(
    file => topLevelDirectory(file) === COLLECTIONS_DIR,
  )

  for (const file of itemFiles) {
    try {
      const { data, body } = parseFrontmatter(await readTextFile(root, file))
      const parsed = itemFrontmatterSchema.safeParse(data)

      if (!parsed.success) {
        errors.push({ path: file, message: describeValidationError(parsed.error) })
        continue
      }

      // The directory is derived from the type on write, so a mismatch means one
      // of the two was hand-edited. Trusting either one silently would move the
      // item without the user asking.
      const expected = TYPE_DIRECTORIES[parsed.data.type]
      if (topLevelDirectory(file) !== expected) {
        errors.push({
          path: file,
          message: `type \`${parsed.data.type}\` belongs in \`${expected}/\`, not \`${topLevelDirectory(file)}/\``,
        })
        continue
      }

      const item = toItem(parsed.data, body)
      const claimed = itemPathsById.get(item.id)

      // Possible after a bad merge. Reported rather than resolved: picking one
      // silently would drop a file the user still has on disk.
      if (claimed) {
        errors.push({
          path: file,
          message: `duplicate id \`${item.id}\`, already claimed by \`${claimed}\``,
        })
        continue
      }

      itemPathsById.set(item.id, file)
      items.push(item)
    } catch (error) {
      errors.push({ path: file, message: readErrorMessage(error) })
    }
  }

  // §3.4: a collection's `updatedAt` is derived, never stored. Storing it would
  // mean every item save rewrote its collections' files, and give two
  // representations that can disagree.
  const newestMemberByCollection = new Map<string, string>()
  for (const item of items) {
    for (const collectionId of item.collectionIds) {
      const current = newestMemberByCollection.get(collectionId)
      if (!current || item.updatedAt > current) {
        newestMemberByCollection.set(collectionId, item.updatedAt)
      }
    }
  }

  for (const file of collectionFiles) {
    try {
      const { data, body } = parseFrontmatter(await readTextFile(root, file))
      const parsed = collectionFrontmatterSchema.safeParse(data)

      if (!parsed.success) {
        errors.push({ path: file, message: describeValidationError(parsed.error) })
        continue
      }

      const claimed = collectionPathsById.get(parsed.data.id)
      if (claimed) {
        errors.push({
          path: file,
          message: `duplicate id \`${parsed.data.id}\`, already claimed by \`${claimed}\``,
        })
        continue
      }

      // An empty collection has no member to derive from, so it falls back to
      // its own file's mtime.
      const updatedAt =
        newestMemberByCollection.get(parsed.data.id) ??
        (await fileModifiedAt(root, file))

      collectionPathsById.set(parsed.data.id, file)
      collections.push(toCollection(parsed.data, body, updatedAt))
    } catch (error) {
      errors.push({ path: file, message: readErrorMessage(error) })
    }
  }

  return {
    items,
    collections,
    errors,
    // Already built above for duplicate detection; returning them costs
    // nothing and is what lets the writer find an existing record's file.
    itemPaths: itemPathsById,
    collectionPaths: collectionPathsById,
  }
}
