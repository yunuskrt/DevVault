'use client'

import React, { useState } from 'react'
import type { DashboardItem } from '@/types/dashboard'
import type { ItemView } from '@/types/items'
import ItemGrid from './ItemGrid'
import ViewToggle from './ViewToggle'

type Props = {
  pinnedItems: DashboardItem[]
  recentItems: DashboardItem[]
}

const DashboardItemSections = ({ pinnedItems, recentItems }: Props) => {
  const [view, setView] = useState<ItemView>('grid')

  return (
    <>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Pinned Items</h2>
          <ViewToggle value={view} onChange={setView} />
        </div>
        <ItemGrid items={pinnedItems} view={view} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Recent Items</h2>
        <ItemGrid items={recentItems} view={view} />
      </section>
    </>
  )
}

export default DashboardItemSections
