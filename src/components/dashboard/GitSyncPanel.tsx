import React from 'react'
import { CheckCircle2, GitBranch, RefreshCw } from 'lucide-react'

type Props = {
  collapsed: boolean
}

const GitSyncPanel = ({ collapsed }: Props) => {
  if (collapsed) {
    return (
      <div className="flex shrink-0 justify-center border-t border-sidebar-border/60 p-3">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="sr-only">Branch main, synced</span>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t border-sidebar-border/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="size-3.5 shrink-0" />
          <span className="truncate">main</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <CheckCircle2 className="size-3.5 text-primary" />
          Synced
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground/70">
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
