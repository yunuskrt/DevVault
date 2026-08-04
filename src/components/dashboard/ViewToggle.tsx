'use client'

import React from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { ItemView } from '@/types/items'

type Props = {
  value: ItemView
  onChange: (view: ItemView) => void
}

const ViewToggle = ({ value, onChange }: Props) => {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as ItemView)}
      variant="outline"
      size="sm"
      aria-label="Item view"
    >
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <LayoutGrid className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export default ViewToggle
