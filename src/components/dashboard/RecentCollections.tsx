import React from 'react'
import { WIDE_GRID_CLASS } from '@/lib/ui-classes'
import type { DashboardCollection } from '@/lib/dashboard-data'
import CollectionCard from './CollectionCard'

type Props = {
  collections: DashboardCollection[]
}

const RecentCollections = ({ collections }: Props) => {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Recent Collections</h2>
      <div className={WIDE_GRID_CLASS}>
        {collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>
    </section>
  )
}

export default RecentCollections
