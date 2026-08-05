import { collections, items } from '@/lib/mock-data'
import {
  toDashboardCollection,
  toDashboardItem,
} from '@/lib/dashboard-mappers'
import { DEFAULT_ITEM_SORT, sortItems } from '@/lib/item-sort'
import {
  DEFAULT_COLLECTION_SORT,
  sortCollections,
} from '@/lib/collection-sort'
import { byUpdatedAtDesc } from '@/lib/sort-utils'
import {
  findCollection,
  getItemsInCollection,
  topCollectionsByRecency,
} from '@/lib/vault-index'
import type {
  DashboardCollection,
  DashboardItem,
  DashboardStat,
} from '@/types/dashboard'
import type { Collection, Item, ItemTypeId } from '@/types/vault'

const RECENT_ITEM_LIMIT = 10
const RECENT_COLLECTION_LIMIT = 4

export const getDashboardStats = (): DashboardStat[] => [
  { id: 'items', label: 'Items', value: items.length },
  { id: 'collections', label: 'Collections', value: collections.length },
  {
    id: 'favorite-items',
    label: 'Favorite Items',
    value: items.filter((item) => item.favorite).length,
  },
  {
    id: 'pinned-items',
    label: 'Pinned Items',
    value: items.filter((item) => item.pinned).length,
  },
]

export const getRecentCollections = (
  now: number = Date.now(),
): DashboardCollection[] =>
  topCollectionsByRecency(RECENT_COLLECTION_LIMIT).map((collection) =>
    toDashboardCollection(collection, now),
  )

/**
 * Every collection, pre-sorted with the browser's own default so the server
 * render and the client's initial state agree.
 */
export const getAllCollections = (
  now: number = Date.now(),
): DashboardCollection[] =>
  sortCollections(
    collections.map((collection) => toDashboardCollection(collection, now)),
    DEFAULT_COLLECTION_SORT,
  )

export const getPinnedItems = (now: number = Date.now()): DashboardItem[] =>
  items
    .filter((item) => item.pinned)
    .sort(byUpdatedAtDesc)
    .map((item) => toDashboardItem(item, now))

export const getRecentItems = (now: number = Date.now()): DashboardItem[] =>
  [...items]
    .sort(byUpdatedAtDesc)
    .slice(0, RECENT_ITEM_LIMIT)
    .map((item) => toDashboardItem(item, now))

/**
 * A slice of the vault for `ItemBrowser`, pre-sorted with the browser's own
 * default so the server render and the client's initial state agree.
 */
const getBrowserItems = (
  source: readonly Item[],
  now: number,
): DashboardItem[] =>
  sortItems(source, DEFAULT_ITEM_SORT).map((item) => toDashboardItem(item, now))

export const getItemsByType = (
  type: ItemTypeId,
  now: number = Date.now(),
): DashboardItem[] =>
  getBrowserItems(
    items.filter((item) => item.type === type),
    now,
  )

export const getItemsByCollection = (
  collectionId: string,
  now: number = Date.now(),
): DashboardItem[] => getBrowserItems(getItemsInCollection(collectionId), now)

export const getFavoriteItems = (now: number = Date.now()): DashboardItem[] =>
  getBrowserItems(
    items.filter((item) => item.favorite),
    now,
  )

export const getCollectionById = (id: string): Collection | undefined =>
  findCollection(id)
