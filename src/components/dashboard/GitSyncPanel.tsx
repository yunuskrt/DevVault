'use client'

import React from 'react'
import { GitBranch, RefreshCw } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { GIT_PANEL_ICONS } from '@/lib/nav-icons'
import { cn } from '@/lib/utils'
import type { GitPanelState, GitPanelTone } from '@/types/dashboard'

type Props = {
  /**
   * Derived on the server from a real `git status`. This component renders it
   * and derives nothing — the panel must not reach for Git itself, and the
   * server owns the clock behind `detail`'s relative time.
   */
  git: GitPanelState
  collapsed: boolean
}

const TONE_CLASS: Record<GitPanelTone, string> = {
  ok: 'text-primary',
  info: 'text-muted-foreground',
  warn: 'text-amber-500',
  danger: 'text-destructive',
}

const GitSyncPanel = ({ git, collapsed }: Props) => {
  const StateIcon = GIT_PANEL_ICONS[git.icon]

  if (collapsed) {
    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border/60 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {/*
             * The state icon rather than a branch icon: collapsed, this is the
             * only thing distinguishing synced from conflicted.
             */}
            <span className="flex items-center">
              <StateIcon
                aria-hidden="true"
                className={cn('size-4', TONE_CLASS[git.tone])}
              />
              <span className="sr-only">{git.description}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">{git.description}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-sidebar-border/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{git.branch ?? 'No branch'}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            {/*
             * The full §7.6 sentence does not fit a 256px footer, so the
             * summary carries the state and the tooltip carries the fix. The
             * `sr-only` copy means the sentence is not hover-only.
             */}
            <span
              className={cn(
                'flex shrink-0 items-center gap-1',
                TONE_CLASS[git.tone],
              )}
            >
              <StateIcon aria-hidden="true" className="size-3.5" />
              {git.summary}
              <span className="sr-only">. {git.description}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{git.description}</TooltipContent>
        </Tooltip>
      </div>

      {(git.detail || git.canSync) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground/70">
          <span className="truncate">{git.detail}</span>
          {git.canSync && (
            /* Display-only until spec 6 wires the sync action. */
            <span className="flex shrink-0 items-center gap-1">
              <RefreshCw aria-hidden="true" className="size-3" />
              Sync
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default GitSyncPanel
