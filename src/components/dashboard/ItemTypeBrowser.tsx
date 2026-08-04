'use client'

import React, { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

type Props = {
  items: DashboardItem[]
  /** Singular label of the type, e.g. "Snippet". Names the create button. */
  typeLabel: string
}

const ItemTypeBrowser = ({ items, typeLabel }: Props) => {
  const [sort, setSort] = useState<ItemSortId>(DEFAULT_ITEM_SORT)
  const [view, setView] = useState<ItemView>('grid')

  const sorted = useMemo(() => sortItems(items, sort), [items, sort])

  /**
   * Radix only learns an item's label once SelectContent mounts, so a bare
   * SelectValue renders blank in the prerendered HTML. Passing the label as a
   * child gives the trigger its text on the server too.
   */
  const sortLabel = ITEM_SORT_OPTIONS.find((option) => option.id === sort)?.label

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={sort}
          onValueChange={(next) => setSort(next as ItemSortId)}
        >
          <SelectTrigger size="sm" className="w-48" aria-label="Sort items by">
            <SelectValue>{sortLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ITEM_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <ViewToggle value={view} onChange={setView} />
          {/* Display-only until a creation flow exists. */}
          <Button size="sm">
            <Plus className="size-4" />
            New {typeLabel}
          </Button>
        </div>
      </div>

      <ItemGrid
        items={sorted}
        view={view}
        emptyMessage={`No ${typeLabel} items in your vault yet.`}
      />
    </div>
  )
}

export default ItemTypeBrowser
