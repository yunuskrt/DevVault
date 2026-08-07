'use client'

import React, { useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { syncVault } from '@/actions/vault'
import { pluralize } from '@/lib/format'
import { GIT_PANEL_ICONS } from '@/lib/nav-icons'
import { cn } from '@/lib/utils'
import type { SyncOutcome } from '@/lib/git/types'
import type { GitPanelIcon } from '@/types/dashboard'

type Props = {
  /** The panel's sentence, so the accessible name says what state we are in. */
  description: string
  /**
   * The panel's state icon, used only on the collapsed rail. Collapsed, this
   * button *is* the whole panel, so it has to keep showing which state the
   * vault is in — a bare refresh icon would make synced and behind identical.
   */
  icon: GitPanelIcon
  /** Tone class from the panel, matching the icon it replaces. */
  toneClass?: string
  /** Icon-only on the collapsed rail. */
  collapsed?: boolean
}

/**
 * Fetch, then pull or push (§7.3).
 *
 * **Deliberately not optimistic** (§7.5). Nothing is reported until the Server
 * Action has come back, because a push that "succeeded" in the UI and failed on
 * disk is precisely the lie that makes a sync tool untrustworthy. `useTransition`
 * keeps `isPending` true until the layout-scoped revalidation has landed, so the
 * panel never shows a stale ahead/behind count next to a success toast.
 */
const SyncButton = ({
  description,
  icon,
  toneClass,
  collapsed = false,
}: Props) => {
  const [isPending, startTransition] = useTransition()

  /**
   * `conflict` returns nothing on purpose. A toast vanishes, and a vault left
   * mid-rebase is a state the user has to keep being told about until they deal
   * with it — the revalidation above drops the panel into its paused state,
   * which persists across navigations and says how to get out.
   */
  const announce = (outcome: SyncOutcome): void => {
    switch (outcome.kind) {
      case 'up-to-date':
        toast('Already up to date')
        return
      case 'pulled':
        toast.success(`Pulled ${pluralize(outcome.commits, 'change')}`)
        return
      case 'pushed':
        toast.success(`Pushed ${pluralize(outcome.commits, 'commit')}`)
        return
      case 'synced':
        toast.success(
          `Pulled ${pluralize(outcome.pulled, 'change')} and pushed ${pluralize(outcome.pushed, 'commit')}`,
        )
        return
      case 'no-remote':
        toast.warning('No remote configured', {
          description:
            'Add one with `git remote add origin <url>` in your vault.',
        })
        return
      case 'conflict':
        return
    }
  }

  const handleSync = () => {
    startTransition(async () => {
      const result = await syncVault({})

      if (result.success) {
        announce(result.data)
      } else {
        toast.error(result.error)
      }
    })
  }

  const label = isPending ? 'Syncing…' : 'Sync'
  // Expanded, the refresh icon labels the control. Collapsed, the state icon
  // does double duty as the panel's only readout — see the `icon` prop.
  const Idle = collapsed ? GIT_PANEL_ICONS[icon] : RefreshCw
  const Icon = isPending ? Loader2 : Idle

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={isPending}
      // "Sync" alone does not say what it would do; the panel's sentence
      // carries the ahead/behind state that decides the outcome.
      aria-label={`Sync with the remote. ${description}`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors',
        'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-progress disabled:opacity-70',
        collapsed && toneClass,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          collapsed ? 'size-4' : 'size-3',
          isPending && 'animate-spin',
        )}
      />
      {collapsed ? (
        <span className="sr-only">
          {label}. {description}
        </span>
      ) : (
        label
      )}
    </button>
  )
}

export default SyncButton
