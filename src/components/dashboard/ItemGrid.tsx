import React from 'react'
import { cn } from '@/lib/utils'
import type { DashboardItem } from '@/lib/dashboard-data'
import type { ItemView } from '@/types/items'
import ItemCard from './ItemCard'

type Props = {
  items: DashboardItem[]
  view: ItemView
  /** Shown in place of the cards when there is nothing to list. */
  emptyMessage?: string
}

const ItemGrid = ({ items, view, emptyMessage }: Props) => {
  if (items.length === 0) {
    return emptyMessage ? (
      <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    ) : null
  }

  return (
    <div
      className={cn(
        view === 'grid'
          ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
          : 'flex flex-col gap-2',
      )}
    >
      {items.map((item) => (
        <ItemCard key={item.id} item={item} view={view} />
      ))}
    </div>
  )
}

export default ItemGrid
