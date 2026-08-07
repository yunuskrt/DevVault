/**
 * Derives the sidebar's three nav lists from the vault.
 *
 * These are functions rather than module-scope constants because the sidebar
 * is a client component: the data has to be produced on the server and handed
 * down as props, never imported across the boundary. They are async because
 * the vault is read from disk — `loadVault` dedupes within a request, so the
 * layout and the page share one read.
 */

import { ITEM_TYPE_IDS, ITEM_TYPE_META, getDominantTypeColor } from '@/lib/item-types'
import { loadVault, loadVaultIndex, topCollectionsByRecency } from '@/lib/vault'
import type {
  CollectionNavEntry,
  PrimaryNavEntry,
  TypeNavEntry,
} from '@/types/dashboard'

/** How many collections the sidebar lists before "View all collections". */
export const SIDEBAR_COLLECTION_LIMIT = 3

export const getPrimaryNav = async (): Promise<PrimaryNavEntry[]> => {
  const { items } = await loadVault()

  return [
    {
      id: 'all',
      label: 'Dashboard',
      icon: 'dashboard',
      count: items.length,
      href: '/',
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: 'favorites',
      count: items.filter((item) => item.favorite).length,
      href: '/favorites',
    },
  ]
}

export const getCollectionNav = async (): Promise<CollectionNavEntry[]> => {
  const collections = await topCollectionsByRecency(SIDEBAR_COLLECTION_LIMIT)
  const { itemsByCollection } = await loadVaultIndex()

  return collections.map((collection) => {
    const collectionItems = itemsByCollection.get(collection.id) ?? []

    return {
      id: collection.id,
      name: collection.name,
      color: getDominantTypeColor(collectionItems),
      count: collectionItems.length,
      href: `/collections/${collection.id}`,
    }
  })
}

export const getTypeNav = async (): Promise<TypeNavEntry[]> => {
  const { items } = await loadVault()

  return ITEM_TYPE_IDS.map((id) => ({
    id,
    label: ITEM_TYPE_META[id].label,
    count: items.filter((item) => item.type === id).length,
    href: `/items/${id}`,
  }))
}

/**
 * Self-contained rather than taking the nav array, so `/items/[type]` stays a
 * single call for its 404 check and its header. The second `getTypeNav()` this
 * costs the page is free: both resolve against the same cached vault read.
 */
export const getTypeNavEntry = async (
  id: string,
): Promise<TypeNavEntry | undefined> =>
  (await getTypeNav()).find((entry) => entry.id === id)
