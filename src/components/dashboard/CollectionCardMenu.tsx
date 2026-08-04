'use client'

import React from 'react'
import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Props = {
  collectionName: string
}

/**
 * Edit and Delete are display-only for now: there is no collection detail
 * route and no mutation layer, so the items open and render but do nothing.
 */
const CollectionCardMenu = ({ collectionName }: Props) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${collectionName}`}
        className="-my-1 -mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-muted data-[state=open]:text-foreground"
      >
        <EllipsisVertical className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem className="gap-2 px-2 py-1.5">
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="gap-2 px-2 py-1.5">
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default CollectionCardMenu
