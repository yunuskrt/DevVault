'use client'

import React, { useMemo, useState } from 'react'
import { CARD_GRID_CLASS } from '@/lib/ui-classes'
import type { DashboardCollection } from '@/types/dashboard'
import {
  COLLECTION_SORT_OPTIONS,
  DEFAULT_COLLECTION_SORT,
  sortCollections,
  type CollectionSortId,
} from '@/lib/collection-sort'
import CollectionCard from './CollectionCard'
import EmptyState from './EmptyState'
import SortSelect from './SortSelect'

type Props = {
  collections: DashboardCollection[]
}

const CollectionBrowser = ({ collections }: Props) => {
  const [sort, setSort] = useState<CollectionSortId>(DEFAULT_COLLECTION_SORT)

  const sorted = useMemo(
    () => sortCollections(collections, sort),
    [collections, sort],
  )

  return (
    <div className="flex flex-col gap-4">
      <SortSelect
        value={sort}
        onChange={setSort}
        options={COLLECTION_SORT_OPTIONS}
        label="Sort collections by"
      />

      {sorted.length === 0 ? (
        <EmptyState message="No collections in your vault yet." />
      ) : (
        <div className={CARD_GRID_CLASS}>
          {sorted.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}
    </div>
  )
}

export default CollectionBrowser
