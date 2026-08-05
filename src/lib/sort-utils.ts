/**
 * Comparators shared by `item-sort.ts`, `collection-sort.ts` and
 * `dashboard-data.ts`. This module imports nothing, so the two client-facing
 * sort modules keep their guarantee of not dragging the vault into the browser
 * bundle by depending on it.
 */

export const byUpdatedAtDesc = <T extends { updatedAt: string }>(a: T, b: T) =>
  new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()

/**
 * Fixed locale so the ordering does not shift with the runtime's default, and
 * base sensitivity so case does not split the alphabet.
 */
export const byTextAsc = (a: string, b: string) =>
  a.localeCompare(b, 'en', { sensitivity: 'base' })
