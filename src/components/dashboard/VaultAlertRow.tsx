'use client'

import React from 'react'
import { FileWarning, TriangleAlert } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { pluralize } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { VaultAlerts } from '@/types/dashboard'

type Props = {
  alerts: VaultAlerts
  collapsed: boolean
  onOpenConflicts: () => void
  onOpenIssues: () => void
}

/**
 * The sidebar's two alert affordances, above the Git panel.
 *
 * **Renders nothing at all when the vault is healthy**, which is the ordinary
 * case — no empty row, no zero count, no reserved space. That is what lets it
 * sit permanently in the footer without costing anything.
 *
 * Both are persistent by design (§7.6): a conflicted file and an unreadable one
 * are states the user has to act on, and neither should be announced by
 * something that vanishes.
 */
const VaultAlertRow = ({
  alerts,
  collapsed,
  onOpenConflicts,
  onOpenIssues,
}: Props) => {
  const conflicts = alerts.conflicts.length
  const issues = alerts.issues.length

  if (conflicts === 0 && issues === 0) return null

  const rowClass = cn(
    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
    'hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    collapsed && 'justify-center px-0',
  )

  return (
    <div className="shrink-0 space-y-1 border-t border-sidebar-border/60 px-3 py-2">
      {conflicts > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenConflicts}
              className={cn(rowClass, 'text-destructive')}
            >
              <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
              {/*
               * The label stays in the DOM when collapsed so the button keeps
               * an accessible name — the same pattern the New Item button uses.
               */}
              <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>
                {pluralize(conflicts, 'conflict')}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? 'right' : 'top'}>
            {`Resolve ${pluralize(conflicts, 'conflicted file')} before committing.`}
          </TooltipContent>
        </Tooltip>
      )}

      {issues > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenIssues}
              className={cn(rowClass, 'text-amber-500')}
            >
              <FileWarning aria-hidden="true" className="size-3.5 shrink-0" />
              <span className={collapsed ? 'sr-only' : 'flex-1 truncate'}>
                {`${pluralize(issues, 'file')} need${issues === 1 ? 's' : ''} attention`}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? 'right' : 'top'}>
            {`DevVault could not read ${pluralize(issues, 'file')} in your vault.`}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

export default VaultAlertRow
