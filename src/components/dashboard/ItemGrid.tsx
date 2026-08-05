import React from 'react'
import { CARD_GRID_CLASS } from '@/lib/ui-classes'
import type { DashboardItem } from '@/lib/dashboard-data'
import type { ItemView } from '@/types/items'
import ItemCard from './ItemCard'
import EmptyState from './EmptyState'

type Props = {
  items: DashboardItem[]
  view: ItemView
  /** Shown in place of the cards when there is nothing to list. */
  emptyMessage?: string
}

const ItemGrid = ({ items, view, emptyMessage }: Props) => {
  if (items.length === 0) {
    return emptyMessage ? <EmptyState message={emptyMessage} /> : null
  }

  return (
    <div className={view === 'grid' ? CARD_GRID_CLASS : 'flex flex-col gap-2'}>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} view={view} />
      ))}
    </div>
  )
}

export default ItemGrid
