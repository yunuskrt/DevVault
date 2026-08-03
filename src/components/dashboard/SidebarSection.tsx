'use client'

import React, { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  collapsed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const SidebarSection = ({
  title,
  collapsed,
  open,
  onOpenChange,
  children,
}: Props) => {
  const contentId = useId()

  if (collapsed) {
    return <div>{children}</div>
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform duration-200',
            !open && '-rotate-90',
          )}
        />
      </button>
      <div id={contentId} hidden={!open} className="pt-1">
        {children}
      </div>
    </div>
  )
}

export default SidebarSection
