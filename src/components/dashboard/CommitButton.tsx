'use client'

import React, { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { commitChanges } from '@/actions/vault'
import { GIT_PANEL_ICONS } from '@/lib/nav-icons'
import { cn } from '@/lib/utils'
import type { GitPanelIcon } from '@/types/dashboard'

type Props = {
  /** The panel's `summary` — `4 uncommitted`. Stays the button's label. */
  label: string
  /** The panel's full sentence, so the accessible name is not just a count. */
  description: string
  icon: GitPanelIcon
  /** Tone class from the panel, so the control looks like what it replaced. */
  toneClass: string
  /** Icon-only on the collapsed rail. */
  collapsed?: boolean
}

/**
 * Commits every pending vault change (§7.2).
 *
 * No message field, by design: the drawer screenshot sells a single **Commit
 * changes** control, and `commit-message.ts` builds the wording. That is what
 * makes this a button rather than a dialog.
 *
 * `useTransition` rather than local state because the work is a Server Action
 * whose result arrives as a re-render — `isPending` stays true until the
 * layout-scoped revalidation has actually landed, so the count cannot flicker
 * back to its old value between the toast and the refresh.
 */
const CommitButton = ({
  label,
  description,
  icon,
  toneClass,
  collapsed = false,
}: Props) => {
  const [isPending, startTransition] = useTransition()
  const Icon = isPending ? Loader2 : GIT_PANEL_ICONS[icon]

  const handleCommit = () => {
    startTransition(async () => {
      const result = await commitChanges({})

      if (result.success) {
        toast.success(
          `Committed ${result.data.files} ${result.data.files === 1 ? 'file' : 'files'}`,
        )
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleCommit}
      disabled={isPending}
      // The count alone would read as "4 uncommitted" with no hint that it does
      // anything; the panel's sentence plus the verb makes the control's
      // purpose audible as well as visible.
      aria-label={`Commit changes. ${description}`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-progress disabled:opacity-70',
        toneClass,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          collapsed ? 'size-4' : 'size-3.5',
          isPending && 'animate-spin',
        )}
      />
      {!collapsed && (isPending ? 'Committing…' : label)}
      {collapsed && <span className="sr-only">Commit changes. {description}</span>}
    </button>
  )
}

export default CommitButton
