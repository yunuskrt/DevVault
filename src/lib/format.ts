/**
 * Count followed by its noun, e.g. "1 item" or "6 collections". Pass `plural`
 * only for a noun that does not simply take an "s".
 */
export const pluralize = (
  count: number,
  singular: string,
  plural: string = `${singular}s`,
): string => `${count} ${count === 1 ? singular : plural}`

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * Compact relative timestamp, e.g. "2d ago" or "3mo ago".
 *
 * Call this on the server and pass the result down as a string. Computing it
 * inside a client component would read a different clock at hydration than at
 * build time and trip a hydration mismatch on statically prerendered routes.
 */
export const formatRelativeTime = (
  isoDate: string,
  now: number = Date.now(),
): string => {
  const elapsed = now - new Date(isoDate).getTime()

  if (Number.isNaN(elapsed) || elapsed < MINUTE) {
    return 'just now'
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m ago`
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h ago`
  }
  if (elapsed < MONTH) {
    return `${Math.floor(elapsed / DAY)}d ago`
  }
  if (elapsed < YEAR) {
    return `${Math.floor(elapsed / MONTH)}mo ago`
  }
  return `${Math.floor(elapsed / YEAR)}y ago`
}
