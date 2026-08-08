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
  /** Opens the conflict dialog, which lives in `DashboardShell`. */
  onOpenConflicts: () => void
}

const TONE_CLASS: Record<GitPanelTone, string> = {
  ok: 'text-primary',
  info: 'text-muted-foreground',
  warn: 'text-amber-500',
  danger: 'text-destructive',
}

const GitSyncPanel = ({ git, collapsed, onOpenConflicts }: Props) => {
  const StateIcon = GIT_PANEL_ICONS[git.icon]

  /*
   * The commit control. In most other states there is either nothing to commit
   * or something that has to be dealt with first — a missing repository, an
   * unset identity — so the summary stays the plain text it was.
   */
  const canCommit = git.icon === 'uncommitted'

  /*
   * The two states that now have somewhere to go. Until this spec they were
   * dead text describing a situation the user could only escape from a
   * terminal; the summary is the affordance, so the count the panel already
   * showed is the thing you click.
   */
  const canResolve = git.icon === 'conflict' || git.icon === 'paused'

  if (collapsed) {
    /*
     * One control fits the rail, so the more urgent of the two wins: pending
     * edits are lost work until they are committed, whereas an unsynced commit
     * is already safe on this machine. Either way the button keeps rendering
     * the state icon, which collapsed is the only thing distinguishing synced
     * from conflicted.
     */
    const collapsedTooltip = canResolve
      ? `Resolve conflicts. ${git.description}`
      : canCommit
        ? `Commit changes. ${git.description}`
        : git.canSync
          ? `Sync with the remote. ${git.description}`
          : git.description

    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border/60 p-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {canResolve ? (
              /*
               * Ahead of Commit and Sync: a conflicted vault can do neither
               * until it is resolved, so the rail's one control has to be the
               * one that leads somewhere.
               */
              <button
                type="button"
                onClick={onOpenConflicts}
                className={cn(
                  'flex shrink-0 items-center rounded-md px-1 py-0.5 -mx-1 transition-colors',
                  'hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  TONE_CLASS[git.tone],
                )}
              >
                <StateIcon aria-hidden="true" className="size-4" />
                <span className="sr-only">
                  Resolve conflicts. {git.description}
                </span>
              </button>
            ) : canCommit ? (
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
            {canResolve ? (
              /* The conflict count is the way into the conflict dialog. */
              <button
                type="button"
                onClick={onOpenConflicts}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors',
                  'hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  TONE_CLASS[git.tone],
                )}
              >
                <StateIcon aria-hidden="true" className="size-3.5" />
                {git.summary}
                <span className="sr-only">. Resolve. {git.description}</span>
              </button>
            ) : canCommit ? (
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
            {canResolve
              ? `Resolve these conflicts. ${git.description}`
              : canCommit
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
