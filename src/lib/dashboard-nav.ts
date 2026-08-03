import {
  Clock,
  Code2,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Layers,
  Link2,
  Pin,
  Sparkles,
  SquareTerminal,
  Star,
  type LucideIcon,
} from 'lucide-react'
import { collections, items, itemTypes, type ItemTypeId } from '@/lib/mock-data'

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
  color: string
  count: number
}

export type TypeNavEntry = {
  id: ItemTypeId
  label: string
  icon: LucideIcon
  count: number
  href: string
}

const TYPE_ICONS: Record<ItemTypeId, LucideIcon> = {
  snippet: Code2,
  prompt: Sparkles,
  note: FileText,
  command: SquareTerminal,
  file: FileIcon,
  image: ImageIcon,
  url: Link2,
}

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

export const collectionNav: CollectionNavEntry[] = collections.map((collection) => ({
  id: collection.id,
  name: collection.name,
  color: collection.color,
  count: items.filter((item) => item.collectionId === collection.id).length,
}))

export const typeNav: TypeNavEntry[] = itemTypes.map((type) => ({
  id: type.id,
  label: type.label,
  icon: TYPE_ICONS[type.id],
  count: items.filter((item) => item.type === type.id).length,
  href: `/items/${type.id}`,
}))

export const getTypeNavEntry = (id: string): TypeNavEntry | undefined =>
  typeNav.find((entry) => entry.id === id)
