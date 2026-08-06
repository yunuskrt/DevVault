/**
 * Vault types in, presentation types out. Nothing here reads the vault or
 * decides which records to show — that is `dashboard-data.ts`, which imports
 * this module and must never be imported back.
 */

import { formatRelativeTime } from '@/lib/format'
import { ITEM_TYPE_META, getDominantTypes } from '@/lib/item-types'
import { findCollection, getItemsInCollection } from '@/lib/vault-index'
import type {
  DashboardCollection,
  DashboardItem,
} from '@/types/dashboard'
import type { Collection, Item } from '@/types/vault'

const resolveCollectionNames = (ids: string[]) =>
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

export const toDashboardItem = (item: Item, now: number): DashboardItem => ({
  ...item,
  collectionNames: resolveCollectionNames(item.collectionIds),
  typeLabel: ITEM_TYPE_META[item.type].label,
  updatedLabel: formatRelativeTime(item.updatedAt, now),
  copyText: copyTextFor(item),
})

export const toDashboardCollection = (
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
