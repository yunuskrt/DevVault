import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CirclePause,
  GitBranchPlus,
  LayoutDashboard,
  Star,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { GitPanelIcon, PrimaryNavIcon } from '@/types/dashboard'

/**
 * Icon keys, resolved on the client.
 *
 * A `LucideIcon` is a function and cannot cross the server/client boundary as
 * a prop, so every sidebar shape that needs one carries a *key* and the
 * sidebar looks it up here. `Record<Key, LucideIcon>` makes the coupling
 * compiler-enforced in both directions: a key added to the union without an
 * icon fails, and so does an icon for a key that does not exist.
 *
 * This module imports nothing from the vault, so a client component can pull
 * it in without dragging the item data into the browser bundle.
 */

export const PRIMARY_NAV_ICONS: Record<PrimaryNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  favorites: Star,
}

/** One icon per §7.1 state, distinct enough to read on the collapsed rail. */
export const GIT_PANEL_ICONS: Record<GitPanelIcon, LucideIcon> = {
  synced: CheckCircle2,
  uncommitted: CircleDot,
  ahead: ArrowUp,
  behind: ArrowDown,
  diverged: ArrowUpDown,
  conflict: TriangleAlert,
  paused: CirclePause,
  'local-only': CircleDashed,
  'no-repo': GitBranchPlus,
  error: CircleAlert,
}
