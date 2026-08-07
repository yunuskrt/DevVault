/**
 * Item ordering, kept free of any vault import so client components can pull it
 * in. `lib/vault/` is `server-only`, so reaching it from here would turn every
 * client component that sorts into a build error.
 */

import { byTextAsc, byUpdatedAtDesc } from '@/lib/sort-utils'

/** The minimum an item needs to be sortable; `DashboardItem` satisfies it. */
type SortableItem = {
  /** Only ever read as `byUpdatedAtDesc`'s tie-break, never sorted on alone. */
  id: string
  title: string
  updatedAt: string
  pinned: boolean
  favorite: boolean
}

export const ITEM_SORT_OPTIONS = [
  { id: 'recent', label: 'Recently updated' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'pinned', label: 'Pinned first' },
  { id: 'favorites', label: 'Favorites first' },
] as const

export type ItemSortId = (typeof ITEM_SORT_OPTIONS)[number]['id']

export const DEFAULT_ITEM_SORT: ItemSortId = 'recent'

const byTitleAsc = (a: SortableItem, b: SortableItem) =>
  byTextAsc(a.title, b.title)

/**
 * "Pinned first" and "Favorites first" are orderings, not filters: flagged
 * items float to the top and everything else follows, newest first.
 */
const byFlag = (flag: 'pinned' | 'favorite') => (a: SortableItem, b: SortableItem) =>
  Number(b[flag]) - Number(a[flag]) || byUpdatedAtDesc(a, b)

const COMPARATORS: Record<
  ItemSortId,
  (a: SortableItem, b: SortableItem) => number
> = {
  recent: byUpdatedAtDesc,
  'name-asc': byTitleAsc,
  'name-desc': (a, b) => byTitleAsc(b, a),
  pinned: byFlag('pinned'),
  favorites: byFlag('favorite'),
}

export const sortItems = <T extends SortableItem>(
  items: readonly T[],
  sort: ItemSortId,
): T[] => [...items].sort(COMPARATORS[sort])
