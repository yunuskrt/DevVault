/**
 * Derives the sidebar's three nav lists from the vault.
 *
 * These are functions rather than module-scope constants because the sidebar
 * is a client component: the data has to be produced on the server and handed
 * down as props, never imported across the boundary. They are synchronous
 * while the vault is static; reading it from disk makes them async.
 */

import { items, itemTypes } from '@/lib/mock-data'
import { getDominantTypeColor } from '@/lib/item-types'
import {
  getItemsInCollection,
  topCollectionsByRecency,
} from '@/lib/vault-index'
import type {
  CollectionNavEntry,
  PrimaryNavEntry,
  TypeNavEntry,
} from '@/types/dashboard'

/** How many collections the sidebar lists before "View all collections". */
export const SIDEBAR_COLLECTION_LIMIT = 3

export const getPrimaryNav = (): PrimaryNavEntry[] => [
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

export const getCollectionNav = (): CollectionNavEntry[] =>
  topCollectionsByRecency(SIDEBAR_COLLECTION_LIMIT).map((collection) => {
    const collectionItems = getItemsInCollection(collection.id)
    return {
      id: collection.id,
      name: collection.name,
      color: getDominantTypeColor(collectionItems),
      count: collectionItems.length,
      href: `/collections/${collection.id}`,
    }
  })

export const getTypeNav = (): TypeNavEntry[] =>
  itemTypes.map((type) => ({
    id: type.id,
    label: type.label,
    count: items.filter((item) => item.type === type.id).length,
    href: `/items/${type.id}`,
  }))

/**
 * Self-contained rather than taking the nav array, so `/items/[type]` stays a
 * single call for its 404 check and its header.
 */
export const getTypeNavEntry = (id: string): TypeNavEntry | undefined =>
  getTypeNav().find((entry) => entry.id === id)
