/**
 * Reverse indexes over the vault.
 *
 * Membership is stored on the item (`collectionIds`), which is the right shape
 * for Git-backed storage but makes "the items in this collection" an O(items)
 * scan repeated once per collection, in every reader that needs it. Building
 * the reverse index once collapses those scans into a single pass.
 *
 * Both indexes are built at module scope because the vault is static mock
 * data. Once items are read from the filesystem this has to move into the
 * request path and be rebuilt when the vault changes on disk.
 */

import { collections, items, type Collection, type Item } from '@/lib/mock-data'

const collectionsById = new Map(
  collections.map((collection) => [collection.id, collection]),
)

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

/** Shared so an empty collection does not allocate a new array per lookup. */
const NO_ITEMS: readonly Item[] = []

export const findCollection = (id: string): Collection | undefined =>
  collectionsById.get(id)

/**
 * The items filed under a collection, in vault order. Readonly because the
 * array is the index's own — callers that need to sort must copy first, which
 * `sortItems` already does.
 */
export const getItemsInCollection = (collectionId: string): readonly Item[] =>
  itemsByCollection.get(collectionId) ?? NO_ITEMS
