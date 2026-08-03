import React from 'react'
import { Star } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { DashboardCollection } from '@/lib/dashboard-data'

type Props = {
  collections: DashboardCollection[]
}

const RecentCollections = ({ collections }: Props) => {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">Recent Collections</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {collections.map((collection) => (
          <Card key={collection.id} className="gap-2 p-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: collection.color }}
              />
              <h3 className="truncate text-sm font-medium">{collection.name}</h3>
              {collection.favorite && (
                <Star
                  className="ml-auto size-4 shrink-0 fill-amber-400 text-amber-400"
                  aria-label="Favorite"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {collection.count} {collection.count === 1 ? 'item' : 'items'} ·{' '}
              {collection.updatedLabel}
            </p>
          </Card>
        ))}
      </div>
    </section>
  )
}

export default RecentCollections
