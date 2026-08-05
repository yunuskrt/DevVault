/**
 * Class strings shared by more than one component. Kept as strings rather than
 * wrapper components where the classes sit on an element the caller owns — the
 * stat row puts them on its own `<section>`, so a wrapper would change the DOM.
 *
 * Imports nothing, so client components can pull it in freely.
 */

/** Card grid for items and collections. */
export const CARD_GRID_CLASS = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'

/** Denser grid for the dashboard's stat and recent-collection rows. */
export const WIDE_GRID_CLASS = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
