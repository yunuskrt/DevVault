import React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
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
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  !collection.color && 'bg-muted-foreground',
                )}
                style={
                  collection.color
                    ? { backgroundColor: collection.color }
                    : undefined
                }
              />
              <h3 className="truncate text-sm font-medium">{collection.name}</h3>
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
