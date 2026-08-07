'use client'

import React from 'react'
import { GitBranch } from 'lucide-react'
import CommitButton from '@/components/dashboard/CommitButton'
import SyncButton from '@/components/dashboard/SyncButton'
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

  /*
   * The only state with a real control. In every other state there is either
   * nothing to commit or something that has to be dealt with first — a
   * conflict, a missing repository, an unset identity — so the summary stays
   * the plain text it was.
   */
  const canCommit = git.icon === 'uncommitted'

  if (collapsed) {
    /*
     * One control fits the rail, so the more urgent of the two wins: pending
     * edits are lost work until they are committed, whereas an unsynced commit
     * is already safe on this machine. Either way the button keeps rendering
     * the state icon, which collapsed is the only thing distinguishing synced
     * from conflicted.
     */
    const collapsedTooltip = canCommit
      ? `Commit changes. ${git.description}`
      : git.canSync
        ? `Sync with the remote. ${git.description}`
        : git.description

    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border/60 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {canCommit ? (
              <CommitButton
                collapsed
                label={git.summary}
                description={git.description}
                icon={git.icon}
                toneClass={TONE_CLASS[git.tone]}
              />
            ) : git.canSync ? (
              <SyncButton
                collapsed
                description={git.description}
                icon={git.icon}
                toneClass={TONE_CLASS[git.tone]}
              />
            ) : (
              <span className="flex items-center">
                <StateIcon
                  aria-hidden="true"
                  className={cn('size-4', TONE_CLASS[git.tone])}
                />
                <span className="sr-only">{git.description}</span>
              </span>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">{collapsedTooltip}</TooltipContent>
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
            {canCommit ? (
              /* The dirty count is the commit control (§7.2). */
              <CommitButton
                label={git.summary}
                description={git.description}
                icon={git.icon}
                toneClass={TONE_CLASS[git.tone]}
              />
            ) : (
              /*
               * The full §7.6 sentence does not fit a 256px footer, so the
               * summary carries the state and the tooltip carries the fix. The
               * `sr-only` copy means the sentence is not hover-only.
               */
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
            )}
          </TooltipTrigger>
          <TooltipContent side="top">
            {canCommit
              ? `Commit these changes. ${git.description}`
              : git.description}
          </TooltipContent>
        </Tooltip>
      </div>

      {(git.detail || git.canSync) && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground/70">
          <span className="truncate">{git.detail}</span>
          {git.canSync && (
            <SyncButton description={git.description} icon={git.icon} />
          )}
        </div>
      )}
    </div>
  )
}

export default GitSyncPanel
