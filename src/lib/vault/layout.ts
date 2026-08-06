import type { ItemTypeId } from '@/types/vault'

/**
 * Where each kind of record lives on disk (architecture §3.1). The reader and
 * the seed script both need this map, and they must never disagree — a file's
 * directory is derived from its `type`, and the reader treats a mismatch
 * between the two as a vault error rather than trusting one over the other.
 */

export const COLLECTIONS_DIR = 'collections'

export const CONFIG_PATH = '.devvault/config.json'

/** Note the one name that is not the plural of its type: `url` → `links/`. */
export const TYPE_DIRECTORIES: Record<ItemTypeId, string> = {
  snippet: 'snippets',
  prompt: 'prompts',
  note: 'notes',
  command: 'commands',
  file: 'files',
  image: 'images',
  url: 'links',
}

const DIRECTORY_TYPES: Record<string, ItemTypeId> = Object.fromEntries(
  Object.entries(TYPE_DIRECTORIES).map(([type, dir]) => [dir, type as ItemTypeId]),
)

/** The first segment of a vault-relative path, or `''` for a root-level file. */
export const topLevelDirectory = (relative: string): string => {
  const slash = relative.indexOf('/')
  return slash === -1 ? '' : relative.slice(0, slash)
}

/**
 * The item type a path's directory implies, or `undefined` if it is not under a
 * type directory at all. Nested directories are fine (`snippets/react/…`) —
 * only the first segment carries meaning, the rest is the user's own filing.
 */
export const typeForPath = (relative: string): ItemTypeId | undefined =>
  DIRECTORY_TYPES[topLevelDirectory(relative)]

/**
 * Binary items (`image`, `file`) store metadata in a sidecar beside the asset:
 * `images/diagram.png` is described by `images/diagram.png.md`. Everything else
 * is a plain `<id>.md`.
 */
export const itemFilePath = (
  type: ItemTypeId,
  id: string,
  fileName?: string,
): string => {
  const dir = TYPE_DIRECTORIES[type]
  const base = (type === 'image' || type === 'file') && fileName ? fileName : id
  return `${dir}/${base}.md`
}

export const collectionFilePath = (id: string): string =>
  `${COLLECTIONS_DIR}/${id}.md`
