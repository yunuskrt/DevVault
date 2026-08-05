'use client'

import React, { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DashboardCollection } from '@/lib/dashboard-data'
import {
  COLLECTION_SORT_OPTIONS,
  DEFAULT_COLLECTION_SORT,
  sortCollections,
  type CollectionSortId,
} from '@/lib/collection-sort'
import CollectionCard from './CollectionCard'

type Props = {
  collections: DashboardCollection[]
}

const CollectionBrowser = ({ collections }: Props) => {
  const [sort, setSort] = useState<CollectionSortId>(DEFAULT_COLLECTION_SORT)

  const sorted = useMemo(
    () => sortCollections(collections, sort),
    [collections, sort],
  )

  /**
   * Radix only learns an item's label once SelectContent mounts, so a bare
   * SelectValue renders blank in the prerendered HTML. Passing the label as a
   * child gives the trigger its text on the server too.
   */
  const sortLabel = COLLECTION_SORT_OPTIONS.find(
    (option) => option.id === sort,
  )?.label

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={sort}
        onValueChange={(next) => setSort(next as CollectionSortId)}
      >
        <SelectTrigger size="sm" className="w-48" aria-label="Sort collections by">
          <SelectValue>{sortLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COLLECTION_SORT_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No collections in your vault yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  )
}

export default CollectionBrowser
