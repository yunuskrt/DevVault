'use client'

import React, { useState } from 'react'
import { Menu, Vault } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from './Sidebar'
import MainArea from './MainArea'
import ConflictDialog from '@/components/vault/ConflictDialog'
import VaultIssuesDialog from '@/components/vault/VaultIssuesDialog'
import type { GitPanelState, SidebarNav, VaultAlerts } from '@/types/dashboard'

type Props = {
  /** Derived on the server by the root layout and threaded down to the nav. */
  nav: SidebarNav
  /** Likewise, for the sidebar's Git sync panel. */
  git: GitPanelState
  /** Conflicted files and files that would not load. */
  alerts: VaultAlerts
  children: React.ReactNode
}

/**
 * The shell owns both alert dialogs, not the sidebar.
 *
 * `SidebarContent` renders **twice** — once in the desktop `aside` and once in
 * the mobile `Sheet` — and the desktop copy stays in the DOM at mobile widths
 * because it is hidden with `md:block` rather than unmounted. A dialog placed
 * inside it would therefore exist twice, and opening "the" conflict dialog
 * would mount two. Here it is mounted once and both sidebars call the same
 * opener.
 */
const DashboardShell = ({ nav, git, alerts, children }: Props) => {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar
          nav={nav}
          git={git}
          alerts={alerts}
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggle={() => setCollapsed((value) => !value)}
          onMobileOpenChange={setMobileOpen}
          onOpenConflicts={() => {
            // Closing the mobile drawer first: it is a dialog too, and leaving
            // it open would stack two focus traps.
            setMobileOpen(false)
            setConflictsOpen(true)
          }}
          onOpenIssues={() => {
            setMobileOpen(false)
            setIssuesOpen(true)
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-sidebar px-3 md:hidden">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Vault className="size-4 text-primary" />
              DevVault
            </span>
          </header>

          <MainArea>{children}</MainArea>
        </div>
      </div>

      <ConflictDialog
        alerts={alerts}
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
      />
      <VaultIssuesDialog
        issues={alerts.issues}
        open={issuesOpen}
        onOpenChange={setIssuesOpen}
      />
    </TooltipProvider>
  )
}

export default DashboardShell
