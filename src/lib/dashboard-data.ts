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
  loadVault,
  loadVaultIndex,
  topCollectionsByRecency,
} from '@/lib/vault'
import type {
  DashboardCollection,
  DashboardItem,
  DashboardStat,
} from '@/types/dashboard'
import type { Collection, Item, ItemTypeId } from '@/types/vault'

const RECENT_ITEM_LIMIT = 10
const RECENT_COLLECTION_LIMIT = 4

/**
 * The two bulk mappers. They take the index once for the whole list rather than
 * per record, which is what keeps `dashboard-mappers.ts` synchronous.
 */
const toDashboardItems = async (
  source: readonly Item[],
  now: number,
): Promise<DashboardItem[]> => {
  const { collectionsById } = await loadVaultIndex()
  return source.map((item) => toDashboardItem(item, now, collectionsById))
}

const toDashboardCollections = async (
  source: readonly Collection[],
  now: number,
): Promise<DashboardCollection[]> => {
  const { itemsByCollection } = await loadVaultIndex()
  return source.map((collection) =>
    toDashboardCollection(
      collection,
      now,
      itemsByCollection.get(collection.id) ?? [],
    ),
  )
}

export const getDashboardStats = async (): Promise<DashboardStat[]> => {
  const { items, collections } = await loadVault()

  return [
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
}

export const getRecentCollections = async (
  now: number = Date.now(),
): Promise<DashboardCollection[]> =>
  toDashboardCollections(
    await topCollectionsByRecency(RECENT_COLLECTION_LIMIT),
    now,
  )

/**
 * Every collection, pre-sorted with the browser's own default so the server
 * render and the client's initial state agree.
 */
export const getAllCollections = async (
  now: number = Date.now(),
): Promise<DashboardCollection[]> => {
  const { collections } = await loadVault()

  return sortCollections(
    await toDashboardCollections(collections, now),
    DEFAULT_COLLECTION_SORT,
  )
}

export const getPinnedItems = async (
  now: number = Date.now(),
): Promise<DashboardItem[]> => {
  const { items } = await loadVault()

  return toDashboardItems(
    items.filter((item) => item.pinned).sort(byUpdatedAtDesc),
    now,
  )
}

export const getRecentItems = async (
  now: number = Date.now(),
): Promise<DashboardItem[]> => {
  const { items } = await loadVault()

  return toDashboardItems(
    [...items].sort(byUpdatedAtDesc).slice(0, RECENT_ITEM_LIMIT),
    now,
  )
}

/**
 * A slice of the vault for `ItemBrowser`, pre-sorted with the browser's own
 * default so the server render and the client's initial state agree.
 */
const getBrowserItems = (
  source: readonly Item[],
  now: number,
): Promise<DashboardItem[]> =>
  toDashboardItems(sortItems(source, DEFAULT_ITEM_SORT), now)

export const getItemsByType = async (
  type: ItemTypeId,
  now: number = Date.now(),
): Promise<DashboardItem[]> => {
  const { items } = await loadVault()

  return getBrowserItems(
    items.filter((item) => item.type === type),
    now,
  )
}

export const getItemsByCollection = async (
  collectionId: string,
  now: number = Date.now(),
): Promise<DashboardItem[]> => {
  const { itemsByCollection } = await loadVaultIndex()

  return getBrowserItems(itemsByCollection.get(collectionId) ?? [], now)
}

export const getFavoriteItems = async (
  now: number = Date.now(),
): Promise<DashboardItem[]> => {
  const { items } = await loadVault()

  return getBrowserItems(
    items.filter((item) => item.favorite),
    now,
  )
}

export const getCollectionById = async (
  id: string,
): Promise<Collection | undefined> => findCollection(id)
