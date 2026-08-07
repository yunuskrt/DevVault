/**
 * Comparators shared by `item-sort.ts`, `collection-sort.ts` and
 * `dashboard-data.ts`. This module imports nothing, so the two client-facing
 * sort modules keep their guarantee of not dragging the vault into the browser
 * bundle by depending on it.
 */

/**
 * Newest first, ties broken by `id`.
 *
 * The tie-break is not decoration. A collection's `updatedAt` is derived from
 * its newest member, so two collections sharing an item share that item's date
 * whenever it is the newest in both — which is live in the current vault. Left
 * to a stable sort, the winner would be whichever the vault happened to read
 * first, so renaming a file could reorder the sidebar.
 */
export const byUpdatedAtDesc = <T extends { updatedAt: string; id: string }>(
  a: T,
  b: T,
) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
  a.id.localeCompare(b.id, 'en')

/**
 * Fixed locale so the ordering does not shift with the runtime's default, and
 * base sensitivity so case does not split the alphabet.
 */
export const byTextAsc = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' })
