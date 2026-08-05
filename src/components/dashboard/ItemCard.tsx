import React from 'react'
import { Pin, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ITEM_TYPE_META } from '@/lib/item-types'
import type { DashboardItem } from '@/types/dashboard'
import type { ItemView } from '@/types/items'
import CopyButton from './CopyButton'
import TypeIcon from './TypeIcon'

type Props = {
  item: DashboardItem
  view: ItemView
}

const ItemCard = ({ item, view }: Props) => {
  const { color } = ITEM_TYPE_META[item.type]
  const isList = view === 'list'

  const accent = (
    <span
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-1"
      style={{
        backgroundImage: `linear-gradient(to bottom, ${color}, ${color}33)`,
      }}
    />
  )

  const typeIcon = <TypeIcon type={item.type} chip />


  const markers = (
    <>
      {/*
       * role="img" is load-bearing: lucide only drops its default aria-hidden
       * when a label is present, and a bare aria-label on an svg is not
       * reliably exposed. Without it the marker is silent. Matches CollectionCard.
       */}
      {item.pinned && (
        <Pin
          role="img"
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="Pinned"
        />
      )}
      {item.favorite && (
        <Star
          role="img"
          className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
          aria-label="Favorite"
        />
      )}
    </>
  )

  /**
   * Tags are clipped rather than wrapped so every card keeps the same height.
   * The mask fades the cut edge instead of slicing a badge in half; it covers
   * empty space and so is invisible when the tags already fit.
   */
  const tags = (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
      {item.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="shrink-0 font-normal">
          #{tag}
        </Badge>
      ))}
    </div>
  )

  const copyButton = <CopyButton text={item.copyText} label={item.title} />

  if (isList) {
    /**
     * Every column is fixed-width so titles, markers, tags, dates and copy
     * buttons line up from row to row. The description sits under the title
     * on a reserved line, keeping rows equal height when it is missing.
     */
    return (
      <Card className="relative flex-row items-center gap-3 py-3 pl-5 pr-4 transition-shadow hover:ring-ring/40">
        {accent}
        {typeIcon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="min-w-0 shrink truncate font-medium sm:w-56 sm:shrink-0">
              {item.title}
            </h3>
            {markers}
          </div>
          <p className="h-5 truncate text-xs leading-5 text-muted-foreground">
            {item.description}
          </p>
        </div>
        <div className="hidden w-44 shrink-0 lg:block">{tags}</div>
        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
          {item.updatedLabel}
        </span>
        {copyButton}
      </Card>
    )
  }

  return (
    <Card className="relative h-full gap-3 py-4 pl-5 pr-4 transition-shadow hover:ring-ring/40">
      {accent}

      <div className="flex items-start gap-3">
        {typeIcon}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h3 className="truncate font-medium">{item.title}</h3>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {markers}
          </span>
        </div>
      </div>

      {/* Fixed height so cards stay the same size whether or not the item has a description. */}
      <p className="line-clamp-2 h-10 text-xs leading-5 text-muted-foreground">
        {item.description}
      </p>

      <div className="mt-auto flex items-center gap-2">
        <div className="min-w-0 flex-1">{tags}</div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {item.updatedLabel}
        </span>
        {copyButton}
      </div>
    </Card>
  )
}

export default ItemCard
