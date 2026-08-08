'use client'

import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import SidebarContent from './SidebarContent'
import type { GitPanelState, SidebarNav, VaultAlerts } from '@/types/dashboard'

type Props = {
  nav: SidebarNav
  git: GitPanelState
  alerts: VaultAlerts
  collapsed: boolean
  mobileOpen: boolean
  onToggle: () => void
  onMobileOpenChange: (open: boolean) => void
  /** Both dialogs live in the shell, which renders once — see `DashboardShell`. */
  onOpenConflicts: () => void
  onOpenIssues: () => void
}

const Sidebar = ({
  nav,
  git,
  alerts,
  collapsed,
  mobileOpen,
  onToggle,
  onMobileOpenChange,
  onOpenConflicts,
  onOpenIssues,
}: Props) => {
  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:block',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <SidebarContent
          nav={nav}
          git={git}
          alerts={alerts}
          collapsed={collapsed}
          onToggle={onToggle}
          onOpenConflicts={onOpenConflicts}
          onOpenIssues={onOpenIssues}
        />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 p-0 sm:max-w-64"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            nav={nav}
            git={git}
            alerts={alerts}
            collapsed={false}
            onNavigate={() => onMobileOpenChange(false)}
            onOpenConflicts={onOpenConflicts}
            onOpenIssues={onOpenIssues}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

export default Sidebar
