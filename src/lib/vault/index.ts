import 'server-only'

import { cache } from 'react'

import { byUpdatedAtDesc } from '@/lib/sort-utils'
import { resolveVaultPath } from '@/lib/vault/config'
import { readVault, type VaultLoadResult } from '@/lib/vault/reader'
import type { Collection, Item } from '@/types/vault'

/**
 * The vault, loaded once per request.
 *
 * React `cache()` is exactly the lifetime wanted: the root layout and the page
 * both need the vault and must hit the disk once between them, and the next
 * request re-reads. Deliberately no cross-request cache — the whole promise of
 * a Git-native vault is that editing a file on disk shows up on reload (§6.1).
 */
export const loadVault = cache(async (): Promise<VaultLoadResult> => {
  const root = await resolveVaultPath()
  const result = await readVault(root)

  // Everything that parsed still renders, but a file the user cannot see the
  // app ignoring is worse than a noisy log. The user-facing surface is spec 7.
  if (result.errors.length > 0) {
    console.error(
      `[devvault] ${result.errors.length} file(s) could not be loaded:\n${result.errors
        .map((error) => `  ${error.path}: ${error.message}`)
        .join('\n')}`,
    )
  }

  return result
})

/**
 * Reverse indexes over the loaded vault.
 *
 * Membership is stored on the item (`collectionIds`), which is the right shape
 * for Git-backed storage but makes "the items in this collection" an O(items)
 * scan repeated once per collection, in every reader that needs it. Building
 * the reverse index once collapses those scans into a single pass — and, being
 * `cache()`d alongside `loadVault`, once per request rather than once per call.
 */
export type VaultIndex = {
  collectionsById: ReadonlyMap<string, Collection>
  itemsByCollection: ReadonlyMap<string, Item[]>
}

export const loadVaultIndex = cache(async (): Promise<VaultIndex> => {
  const { items, collections } = await loadVault()

  const itemsByCollection = items.reduce<Map<string, Item[]>>((index, item) => {
    for (const collectionId of item.collectionIds) {
      const existing = index.get(collectionId)

      if (existing) {
        existing.push(item)
      } else {
        index.set(collectionId, [item])
      }
    }

    return index
  }, new Map())

  return {
    collectionsById: new Map(
      collections.map((collection) => [collection.id, collection]),
    ),
    itemsByCollection,
  }
})

/** Shared so an empty collection does not allocate a new array per lookup. */
const NO_ITEMS: readonly Item[] = []

export const findCollection = async (
  id: string,
): Promise<Collection | undefined> =>
  (await loadVaultIndex()).collectionsById.get(id)

/** Every collection id, in vault order. */
export const getAllCollectionIds = async (): Promise<string[]> => [
  ...(await loadVaultIndex()).collectionsById.keys(),
]

/**
 * The `limit` most recently updated collections. The sidebar and the dashboard
 * ask the same question with different limits and map the answer to different
 * shapes, so the query lives here rather than in either of them.
 *
 * Copies before sorting: the array belongs to the loaded vault and every other
 * reader in the same request would see it reordered.
 */
export const topCollectionsByRecency = async (
  limit: number,
): Promise<readonly Collection[]> =>
  [...(await loadVault()).collections].sort(byUpdatedAtDesc).slice(0, limit)

/**
 * The items filed under a collection, in vault order. Readonly because the
 * array is the index's own — callers that need to sort must copy first, which
 * `sortItems` already does.
 */
export const getItemsInCollection = async (
  collectionId: string,
): Promise<readonly Item[]> =>
  (await loadVaultIndex()).itemsByCollection.get(collectionId) ?? NO_ITEMS
