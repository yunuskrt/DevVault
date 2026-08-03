import React from 'react'
import { CheckCircle2, GitBranch, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  collapsed: boolean
}

const GitSyncPanel = ({ collapsed }: Props) => {
  if (collapsed) {
    return (
      <div className="flex justify-center border-t border-sidebar-border p-3">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="sr-only">Branch main, synced</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'm-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <GitBranch className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">main</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
          <CheckCircle2 className="size-3.5" />
          Synced
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">Last push 2m ago</span>
        <span className="flex shrink-0 items-center gap-1">
          <RefreshCw className="size-3" />
          Sync
        </span>
      </div>
    </div>
  )
}

export default GitSyncPanel
