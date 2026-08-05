'use client'

import React, { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DashboardItem } from '@/lib/dashboard-data'
import {
  DEFAULT_ITEM_SORT,
  ITEM_SORT_OPTIONS,
  sortItems,
  type ItemSortId,
} from '@/lib/item-sort'
import type { ItemView } from '@/types/items'
import ItemGrid from './ItemGrid'
import ViewToggle from './ViewToggle'
import SortSelect from './SortSelect'

type Props = {
  items: DashboardItem[]
  emptyMessage: string
  /**
   * Full text of the create button, e.g. "New Snippet". Omitted on views that
   * list a subset of the vault rather than a place items are created.
   */
  createLabel?: string
}

const ItemBrowser = ({ items, emptyMessage, createLabel }: Props) => {
  const [sort, setSort] = useState<ItemSortId>(DEFAULT_ITEM_SORT)
  const [view, setView] = useState<ItemView>('grid')

  const sorted = useMemo(() => sortItems(items, sort), [items, sort])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortSelect
          value={sort}
          onChange={setSort}
          options={ITEM_SORT_OPTIONS}
          label="Sort items by"
        />

        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          {/* Display-only until a creation flow exists. */}
          {createLabel && (
            <Button size="sm">
              <Plus className="size-4" />
              {createLabel}
            </Button>
          )}
        </div>
      </div>

      <ItemGrid items={sorted} view={view} emptyMessage={emptyMessage} />
    </div>
  )
}

export default ItemBrowser
