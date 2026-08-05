import {
  collections,
  items,
  type Collection,
  type Item,
  type ItemTypeId,
} from '@/lib/mock-data'
import { formatRelativeTime } from '@/lib/format'
import { getDominantTypes } from '@/lib/item-types'
import { DEFAULT_ITEM_SORT, sortItems } from '@/lib/item-sort'
import {
  DEFAULT_COLLECTION_SORT,
  sortCollections,
} from '@/lib/collection-sort'
import { byUpdatedAtDesc } from '@/lib/sort-utils'
import { findCollection, getItemsInCollection } from '@/lib/vault-index'

const RECENT_ITEM_LIMIT = 10
const RECENT_COLLECTION_LIMIT = 4

export type DashboardStat = {
  id: string
  label: string
  value: number
}

/** An item plus the presentation-ready fields the card needs. */
export type DashboardItem = Item & {
  /** Empty when the item belongs to no collection. */
  collectionNames: string[]
  typeLabel: string
  updatedLabel: string
  /** What the card's copy button writes to the clipboard. */
  copyText: string
}

export type DashboardCollection = Collection & {
  count: number
  updatedLabel: string
  /**
   * The collection's most common item types, ordered by importance. Drives
   * both the card's dot colour (the first entry) and its type icons. Empty
   * when the collection holds no items.
   */
  dominantTypes: ItemTypeId[]
}

export const TYPE_LABELS: Record<ItemTypeId, string> = {
  snippet: 'Snippet',
  prompt: 'Prompt',
  note: 'Note',
  command: 'Command',
  file: 'File',
  image: 'Image',
  url: 'URL',
}

const collectionNames = (ids: string[]) =>
  ids.map((id) => findCollection(id)?.name).filter((name) => name !== undefined)

/**
 * Each type stores its payload in a different field, so the union is matched
 * exhaustively rather than probed with a fallback chain. A new item type will
 * fail to compile here until it says what its copy button writes.
 */
const copyTextFor = (item: Item): string => {
  switch (item.type) {
    case 'snippet':
    case 'command':
    case 'prompt':
    case 'note':
      return item.content
    case 'url':
      return item.url
    case 'image':
      return item.fileName
    case 'file':
      return item.content ?? item.fileName
  }
}

const toDashboardItem = (item: Item, now: number): DashboardItem => ({
  ...item,
  collectionNames: collectionNames(item.collectionIds),
  typeLabel: TYPE_LABELS[item.type],
  updatedLabel: formatRelativeTime(item.updatedAt, now),
  copyText: copyTextFor(item),
})

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

const toDashboardCollection = (
  collection: Collection,
  now: number,
): DashboardCollection => {
  const collectionItems = getItemsInCollection(collection.id)

  return {
    ...collection,
    count: collectionItems.length,
    updatedLabel: formatRelativeTime(collection.updatedAt, now),
    dominantTypes: getDominantTypes(collectionItems),
  }
}

export const getRecentCollections = (
  now: number = Date.now(),
): DashboardCollection[] =>
  [...collections]
    .sort(byUpdatedAtDesc)
    .slice(0, RECENT_COLLECTION_LIMIT)
    .map((collection) => toDashboardCollection(collection, now))

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
