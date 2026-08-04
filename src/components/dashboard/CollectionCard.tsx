import React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ITEM_TYPE_META } from '@/lib/item-types'
import { TYPE_LABELS, type DashboardCollection } from '@/lib/dashboard-data'
import CollectionCardMenu from './CollectionCardMenu'

type Props = {
  collection: DashboardCollection
}

const CollectionCard = ({ collection }: Props) => {
  /** The dot takes the colour of the first dominant type, so it matches the leftmost footer icon. */
  const [primaryType] = collection.dominantTypes
  const dotColor = primaryType ? ITEM_TYPE_META[primaryType].color : undefined

  return (
    <Card className="h-full gap-0 p-4 transition-shadow hover:ring-ring/40">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            !dotColor && 'bg-muted-foreground',
          )}
          style={dotColor ? { backgroundColor: dotColor } : undefined}
        />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          {collection.name}
        </h3>
        <CollectionCardMenu collectionName={collection.name} />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {collection.count} {collection.count === 1 ? 'item' : 'items'}
      </p>

      {/* Fixed height so cards stay the same size whether or not the collection has a description. */}
      <p className="mt-2 line-clamp-2 h-10 text-xs leading-5 text-muted-foreground">
        {collection.description}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {collection.dominantTypes.map((type) => {
            const { icon: Icon, color } = ITEM_TYPE_META[type]
            return (
              <Icon
                key={type}
                className="size-4 shrink-0"
                style={{ color }}
                role="img"
                aria-label={TYPE_LABELS[type]}
              />
            )
          })}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {collection.updatedLabel}
        </span>
      </div>
    </Card>
  )
}

export default CollectionCard
