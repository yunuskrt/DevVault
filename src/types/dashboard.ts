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
