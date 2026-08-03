import { Clock, Layers, Pin, Star, type LucideIcon } from 'lucide-react'
import { collections, items, itemTypes, type ItemTypeId } from '@/lib/mock-data'
import { ITEM_TYPE_META, getDominantTypeColor } from '@/lib/item-types'

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
}

export type TypeNavEntry = {
  id: ItemTypeId
  label: string
  icon: LucideIcon
  color: string
  count: number
  href: string
}

const itemsInCollection = (collectionId: string) =>
  items.filter((item) => item.collectionId === collectionId)

export const primaryNav: PrimaryNavEntry[] = [
  { id: 'all', label: 'All Items', icon: Layers, count: items.length, href: '/' },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: Star,
    count: items.filter((item) => item.favorite).length,
  },
  {
    id: 'pinned',
    label: 'Pinned',
    icon: Pin,
    count: items.filter((item) => item.pinned).length,
  },
  { id: 'recent', label: 'Recent', icon: Clock, count: items.length },
]

export const collectionNav: CollectionNavEntry[] = [...collections]
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  .slice(0, SIDEBAR_COLLECTION_LIMIT)
  .map((collection) => ({
    id: collection.id,
    name: collection.name,
    color: getDominantTypeColor(itemsInCollection(collection.id)),
    count: itemsInCollection(collection.id).length,
  }))

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
