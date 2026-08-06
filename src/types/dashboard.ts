/**
 * Presentation shapes the dashboard renders. Each one is a vault type plus the
 * finished strings a card needs, so components never format or look anything
 * up themselves.
 */

import type { Collection, Item, ItemTypeId } from '@/types/vault'

export type DashboardStat = {
  id: string
  label: string
  value: number
}

/** An item plus the presentation-ready fields the card needs. */
export type DashboardItem = Item & {
  /** Empty when the item belongs to no collection. */
  collectionNames: string[]
  typeLabel: string
  updatedLabel: string
  /** What the card's copy button writes to the clipboard. */
  copyText: string
}

export type DashboardCollection = Collection & {
  count: number
  updatedLabel: string
  /**
   * The collection's most common item types, ordered by importance. Drives
   * both the card's dot colour (the first entry) and its type icons. Empty
   * when the collection holds no items.
   */
  dominantTypes: ItemTypeId[]
}

/*
 * Sidebar navigation.
 *
 * These cross the server/client boundary as props, so every field has to be
 * serializable — which is why nothing here holds a `LucideIcon`. A row names
 * its icon and the client resolves it: type rows through `ITEM_TYPE_META`,
 * primary rows through `PRIMARY_NAV_ICONS`.
 */

/** Icon keys for the nav rows that are not backed by an item type. */
export type PrimaryNavIcon = 'dashboard' | 'favorites'

export type PrimaryNavEntry = {
  id: string
  label: string
  icon: PrimaryNavIcon
  count: number
  href?: string
}

export type CollectionNavEntry = {
  id: string
  name: string
  color?: string
  count: number
  href: string
}

/** Icon and colour come from `ITEM_TYPE_META[id]`, so neither is carried. */
export type TypeNavEntry = {
  id: ItemTypeId
  label: string
  count: number
  href: string
}

/**
 * Every list the sidebar renders, in one prop. Threaded from the root layout
 * (server) down through the client shell, so no client component has to reach
 * into the vault for it.
 */
export type SidebarNav = {
  primary: PrimaryNavEntry[]
  types: TypeNavEntry[]
  collections: CollectionNavEntry[]
}
