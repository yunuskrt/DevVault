import React from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { pluralize } from '@/lib/format'
import { ITEM_TYPE_META } from '@/lib/item-types'
import { TYPE_LABELS, type DashboardCollection } from '@/lib/dashboard-data'
import CollectionCardMenu from './CollectionCardMenu'
import ColorDot from './ColorDot'
import TypeIcon from './TypeIcon'

type Props = {
  collection: DashboardCollection
}

const CollectionCard = ({ collection }: Props) => {
  /** The dot takes the colour of the first dominant type, so it matches the leftmost footer icon. */
  const [primaryType] = collection.dominantTypes
  const dotColor = primaryType ? ITEM_TYPE_META[primaryType].color : undefined

  return (
    <Card className="relative h-full gap-0 p-4 transition-shadow hover:ring-ring/40">
      <div className="flex items-center gap-2">
        <ColorDot color={dotColor} size="md" />
        {/*
         * The title is the only anchor; its ::after covers the whole card so
         * the card is clickable without nesting the menu's button inside an
         * <a>. The menu sits above that overlay to stay clickable itself.
         */}
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          <Link
            href={`/collections/${collection.id}`}
            className="after:absolute after:inset-0 after:rounded-[inherit] hover:underline"
          >
            {collection.name}
          </Link>
        </h3>
        <div className="relative z-10">
          <CollectionCardMenu collectionName={collection.name} />
        </div>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {pluralize(collection.count, 'item')}
      </p>

      {/* Fixed height so cards stay the same size whether or not the collection has a description. */}
      <p className="mt-2 line-clamp-2 h-10 text-xs leading-5 text-muted-foreground">
        {collection.description}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {collection.dominantTypes.map((type) => (
            <TypeIcon key={type} type={type} label={TYPE_LABELS[type]} />
          ))}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {collection.updatedLabel}
        </span>
      </div>
    </Card>
  )
}

export default CollectionCard
