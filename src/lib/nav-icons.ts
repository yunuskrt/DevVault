import { LayoutDashboard, Star, type LucideIcon } from 'lucide-react'
import type { PrimaryNavIcon } from '@/types/dashboard'

/**
 * The primary nav rows' icons, keyed the way `ITEM_TYPE_META` keys the type
 * rows'. A `LucideIcon` is a function and cannot cross the server/client
 * boundary as a prop, so `PrimaryNavEntry` carries the key and the sidebar
 * resolves it here.
 *
 * This module imports nothing from the vault, so a client component can pull
 * it in without dragging the item data into the browser bundle.
 */
export const PRIMARY_NAV_ICONS: Record<PrimaryNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  favorites: Star,
}
