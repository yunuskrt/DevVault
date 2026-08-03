'use client'

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type Props = {
  label: string
  count: number
  collapsed: boolean
  href?: string
  active?: boolean
  icon?: React.ReactNode
  iconColor?: string
  /** Render a colour dot instead of an icon, for collection rows. */
  dot?: boolean
  dotColor?: string
  onNavigate?: () => void
}

const SidebarRow = ({
  label,
  count,
  collapsed,
  href,
  active = false,
  icon,
  iconColor,
  dot = false,
  dotColor,
  onNavigate,
}: Props) => {
  const className = cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  )

  const marker = dot ? (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        !dotColor && 'bg-muted-foreground',
      )}
      style={dotColor ? { backgroundColor: dotColor } : undefined}
    />
  ) : iconColor ? (
    <span className="flex shrink-0 items-center" style={{ color: iconColor }}>
      {icon}
    </span>
  ) : (
    icon
  )

  const body = (
    <>
      {marker}
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{label}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {count}
          </span>
        </>
      )}
    </>
  )

  const row = href ? (
    <Link
      href={href}
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )

  if (!collapsed) {
    return row
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">
        {label} ({count})
      </TooltipContent>
    </Tooltip>
  )
}

export default SidebarRow
