import {
  Code2,
  FileText,
  Image as ImageIcon,
  Link2,
  NotebookPen,
  Sparkles,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import type { Item, ItemTypeId } from '@/types/vault'

export type ItemTypeMeta = {
  icon: LucideIcon
  color: string
}

export const ITEM_TYPE_META: Record<ItemTypeId, ItemTypeMeta> = {
  snippet: { icon: Code2, color: '#3b82f6' },
  prompt: { icon: Sparkles, color: '#a855f7' },
  command: { icon: SquareTerminal, color: '#f59553' },
  note: { icon: NotebookPen, color: '#eab308' },
  file: { icon: FileText, color: '#8996a3' },
  image: { icon: ImageIcon, color: '#e868e8' },
  url: { icon: Link2, color: '#22c55e' },
}

/**
 * A type's colour, or `undefined` for no type at all. The optional parameter
 * is the point: both callers index into a possibly empty list of dominant
 * types, and the muted dot on an empty collection depends on getting
 * `undefined` back rather than throwing.
 */
export const colorForType = (type?: ItemTypeId): string | undefined =>
  type ? ITEM_TYPE_META[type].color : undefined

/** Tie-breaker when a collection has several equally common item types. */
const TYPE_PRIORITY: ItemTypeId[] = [
  'snippet',
  'prompt',
  'command',
  'note',
  'file',
  'image',
  'url',
]

/**
 * Every item type a collection holds most of, ordered by TYPE_PRIORITY. A
 * collection with a single most common type yields one entry; ties yield all
 * of them; an empty collection yields none.
 */
export const getDominantTypes = (
  collectionItems: readonly Item[],
): ItemTypeId[] => {
  if (collectionItems.length === 0) {
    return []
  }

  const counts = collectionItems.reduce<Partial<Record<ItemTypeId, number>>>(
    (acc, item) => ({ ...acc, [item.type]: (acc[item.type] ?? 0) + 1 }),
    {},
  )

  const highest = Math.max(...Object.values(counts))

  return TYPE_PRIORITY.filter((type) => counts[type] === highest)
}

/**
 * The colour of a collection is the colour of its most common item type.
 * Ties fall back to TYPE_PRIORITY; an empty collection has no dominant type.
 */
export const getDominantTypeColor = (
  collectionItems: readonly Item[],
): string | undefined => colorForType(getDominantTypes(collectionItems)[0])
