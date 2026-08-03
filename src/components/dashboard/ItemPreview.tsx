import React from 'react'
import { ImageIcon } from 'lucide-react'
import type { DashboardItem } from '@/lib/dashboard-data'

type Props = {
  item: DashboardItem
}

const CODE_TYPES = new Set(['snippet', 'command', 'file'])

const ItemPreview = ({ item }: Props) => {
  if (item.type === 'image') {
    return (
      <div className="flex h-24 items-center justify-center gap-2 rounded-lg bg-muted/60 text-xs text-muted-foreground">
        <ImageIcon className="size-4" />
        {item.fileName}
      </div>
    )
  }

  if (item.type === 'url' && item.url) {
    return (
      <p className="truncate rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-primary">
        {item.url}
      </p>
    )
  }

  if (!item.content) {
    return null
  }

  if (CODE_TYPES.has(item.type)) {
    return (
      <pre className="overflow-hidden rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        <code className="line-clamp-4 block whitespace-pre">{item.content}</code>
      </pre>
    )
  }

  return (
    <p className="line-clamp-3 text-sm text-muted-foreground">{item.content}</p>
  )
}

export default ItemPreview
