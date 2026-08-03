import {
  collections,
  items,
  type Collection,
  type Item,
  type ItemTypeId,
} from '@/lib/mock-data'
import { formatRelativeTime } from '@/lib/format'

const RECENT_ITEM_LIMIT = 10
const RECENT_COLLECTION_LIMIT = 4

export type DashboardStat = {
  id: string
  label: string
  value: number
}

/** An item plus the presentation-ready fields the card needs. */
export type DashboardItem = Item & {
  collectionName: string
  typeLabel: string
  updatedLabel: string
}

export type DashboardCollection = Collection & {
  count: number
  updatedLabel: string
}

const TYPE_LABELS: Record<ItemTypeId, string> = {
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

const collectionName = (id: string) =>
  collections.find((collection) => collection.id === id)?.name ?? 'Uncategorized'

const toDashboardItem = (item: Item, now: number): DashboardItem => ({
  ...item,
  collectionName: collectionName(item.collectionId),
  typeLabel: TYPE_LABELS[item.type],
  updatedLabel: formatRelativeTime(item.updatedAt, now),
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
    id: 'favorite-collections',
    label: 'Favorite Collections',
    value: collections.filter((collection) => collection.favorite).length,
  },
]

export const getRecentCollections = (
  now: number = Date.now(),
): DashboardCollection[] =>
  [...collections]
    .sort(byUpdatedAtDesc)
    .slice(0, RECENT_COLLECTION_LIMIT)
    .map((collection) => ({
      ...collection,
      count: items.filter((item) => item.collectionId === collection.id).length,
      updatedLabel: formatRelativeTime(collection.updatedAt, now),
    }))

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
