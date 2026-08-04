import {
  collections,
  items,
  type Collection,
  type Item,
  type ItemTypeId,
} from '@/lib/mock-data'
import { formatRelativeTime } from '@/lib/format'
import { getDominantTypes } from '@/lib/item-types'

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

const byUpdatedAtDesc = <T extends { updatedAt: string }>(a: T, b: T) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

const collectionNames = (ids: string[]) =>
  ids
    .map((id) => collections.find((collection) => collection.id === id)?.name)
    .filter((name): name is string => Boolean(name))

/**
 * Not every type stores its payload in `content`: url items carry `url` and
 * file/image items carry `fileName`. Falling back to the title keeps the copy
 * button from silently doing nothing.
 */
const copyTextFor = (item: Item) =>
  item.content ?? item.url ?? item.fileName ?? item.title

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

export const getRecentCollections = (
  now: number = Date.now(),
): DashboardCollection[] =>
  [...collections]
    .sort(byUpdatedAtDesc)
    .slice(0, RECENT_COLLECTION_LIMIT)
    .map((collection) => {
      const collectionItems = items.filter((item) =>
        item.collectionIds.includes(collection.id),
      )
      return {
        ...collection,
        count: collectionItems.length,
        updatedLabel: formatRelativeTime(collection.updatedAt, now),
        dominantTypes: getDominantTypes(collectionItems),
      }
    })

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
