/**
 * Collection ordering. Sibling of `item-sort.ts` and kept free of any
 * `mock-data` import for the same reason: client components pull it in.
 *
 * Note `count` — a collection's item count is derived by filtering `items`,
 * not stored on `Collection`, so the sortable shape is `DashboardCollection`.
 */

import { byTextAsc, byUpdatedAtDesc } from '@/lib/sort-utils'

type SortableCollection = {
  name: string
  updatedAt: string
  count: number
}

export const COLLECTION_SORT_OPTIONS = [
  { id: 'recent', label: 'Recently updated' },
  { id: 'name-asc', label: 'Name A–Z' },
  { id: 'name-desc', label: 'Name Z–A' },
  { id: 'count-desc', label: 'Most items' },
  { id: 'count-asc', label: 'Fewest items' },
] as const

export type CollectionSortId = (typeof COLLECTION_SORT_OPTIONS)[number]['id']

export const DEFAULT_COLLECTION_SORT: CollectionSortId = 'recent'

const byNameAsc = (a: SortableCollection, b: SortableCollection) =>
  byTextAsc(a.name, b.name)

/** Equal counts fall back to recency, so the order stays meaningful. */
const byCountDesc = (a: SortableCollection, b: SortableCollection) =>
  b.count - a.count || byUpdatedAtDesc(a, b)

const COMPARATORS: Record<
  CollectionSortId,
  (a: SortableCollection, b: SortableCollection) => number
> = {
  recent: byUpdatedAtDesc,
  'name-asc': byNameAsc,
  'name-desc': (a, b) => byNameAsc(b, a),
  'count-desc': byCountDesc,
  'count-asc': (a, b) => a.count - b.count || byUpdatedAtDesc(a, b),
}

export const sortCollections = <T extends SortableCollection>(
  collections: readonly T[],
  sort: CollectionSortId,
): T[] => [...collections].sort(COMPARATORS[sort])
