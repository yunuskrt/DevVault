import React from 'react'
import { Pin, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TYPE_ICONS } from '@/lib/dashboard-nav'
import type { DashboardItem } from '@/lib/dashboard-data'
import ItemPreview from './ItemPreview'

type Props = {
  item: DashboardItem
  view: 'grid' | 'list'
}

const ItemCard = ({ item, view }: Props) => {
  const Icon = TYPE_ICONS[item.type]
  const isList = view === 'list'

  return (
    <Card
      className={cn(
        'gap-3 p-4 transition-colors hover:border-ring/60',
        isList && 'flex-row items-center gap-4',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-medium">{item.title}</h3>
            {item.pinned && (
              <Pin
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-label="Pinned"
              />
            )}
            {item.favorite && (
              <Star
                className="ml-auto size-4 shrink-0 fill-amber-400 text-amber-400"
                aria-label="Favorite"
              />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {item.typeLabel} · {item.collectionName}
          </p>
        </div>
      </div>

      {!isList && <ItemPreview item={item} />}

      <div
        className={cn(
          'flex items-center gap-2',
          isList ? 'ml-auto shrink-0' : 'mt-auto flex-wrap',
        )}
      >
        {!isList &&
          item.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="font-normal">
              #{tag}
            </Badge>
          ))}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {item.updatedLabel}
        </span>
      </div>
    </Card>
  )
}

export default ItemCard
