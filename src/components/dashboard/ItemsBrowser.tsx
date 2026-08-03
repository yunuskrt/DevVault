'use client'

import React, { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { DashboardItem } from '@/lib/dashboard-data'
import ItemCard from './ItemCard'

type View = 'grid' | 'list'

type Props = {
  pinnedItems: DashboardItem[]
  recentItems: DashboardItem[]
}

const ItemsBrowser = ({ pinnedItems, recentItems }: Props) => {
  const [view, setView] = useState<View>('grid')

  const layout = cn(
    view === 'grid'
      ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
      : 'flex flex-col gap-2',
  )

  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Pinned Items</h2>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => value && setView(value as View)}
            variant="outline"
            size="sm"
            aria-label="Item view"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className={layout}>
          {pinnedItems.map((item) => (
            <ItemCard key={item.id} item={item} view={view} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent Items</h2>
        <div className={layout}>
          {recentItems.map((item) => (
            <ItemCard key={item.id} item={item} view={view} />
          ))}
        </div>
      </section>
    </>
  )
}

export default ItemsBrowser
