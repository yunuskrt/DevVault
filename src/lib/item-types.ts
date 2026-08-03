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
import type { Item, ItemTypeId } from '@/lib/mock-data'

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
 * The colour of a collection is the colour of its most common item type.
 * Ties fall back to TYPE_PRIORITY; an empty collection has no dominant type.
 */
export const getDominantTypeColor = (
  collectionItems: Item[],
): string | undefined => {
  if (collectionItems.length === 0) {
    return undefined
  }

  const counts = collectionItems.reduce<Partial<Record<ItemTypeId, number>>>(
    (acc, item) => ({ ...acc, [item.type]: (acc[item.type] ?? 0) + 1 }),
    {},
  )

  const dominant = TYPE_PRIORITY.reduce((best, type) =>
    (counts[type] ?? 0) > (counts[best] ?? 0) ? type : best,
  )

  return ITEM_TYPE_META[dominant].color
}
