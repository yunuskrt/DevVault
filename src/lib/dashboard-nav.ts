import { LayoutDashboard, Star, type LucideIcon } from 'lucide-react'
import { items, itemTypes } from '@/lib/mock-data'
import { ITEM_TYPE_META, getDominantTypeColor } from '@/lib/item-types'
import {
  getItemsInCollection,
  topCollectionsByRecency,
} from '@/lib/vault-index'
import type { ItemTypeId } from '@/types/vault'

/** How many collections the sidebar lists before "View all collections". */
export const SIDEBAR_COLLECTION_LIMIT = 3

export type PrimaryNavEntry = {
  id: string
  label: string
  icon: LucideIcon
  count: number
  href?: string
}

export type CollectionNavEntry = {
  id: string
  name: string
  color?: string
  count: number
  href: string
}

export type TypeNavEntry = {
  id: ItemTypeId
  label: string
  icon: LucideIcon
  color: string
  count: number
  href: string
}

export const primaryNav: PrimaryNavEntry[] = [
  {
    id: 'all',
    label: 'Dashboard',
    icon: LayoutDashboard,
    count: items.length,
    href: '/',
  },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: Star,
    count: items.filter((item) => item.favorite).length,
    href: '/favorites',
  },
]

export const collectionNav: CollectionNavEntry[] = topCollectionsByRecency(
  SIDEBAR_COLLECTION_LIMIT,
).map((collection) => {
  const collectionItems = getItemsInCollection(collection.id)
  return {
    id: collection.id,
    name: collection.name,
    color: getDominantTypeColor(collectionItems),
    count: collectionItems.length,
    href: `/collections/${collection.id}`,
  }
})

export const typeNav: TypeNavEntry[] = itemTypes.map((type) => ({
  id: type.id,
  label: type.label,
  icon: ITEM_TYPE_META[type.id].icon,
  color: ITEM_TYPE_META[type.id].color,
  count: items.filter((item) => item.type === type.id).length,
  href: `/items/${type.id}`,
}))

export const getTypeNavEntry = (id: string): TypeNavEntry | undefined =>
  typeNav.find((entry) => entry.id === id)
