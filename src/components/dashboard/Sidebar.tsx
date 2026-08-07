'use client'

import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import SidebarContent from './SidebarContent'
import type { GitPanelState, SidebarNav } from '@/types/dashboard'

type Props = {
  nav: SidebarNav
  git: GitPanelState
  collapsed: boolean
  mobileOpen: boolean
  onToggle: () => void
  onMobileOpenChange: (open: boolean) => void
}

const Sidebar = ({
  nav,
  git,
  collapsed,
  mobileOpen,
  onToggle,
  onMobileOpenChange,
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
          collapsed={collapsed}
          onToggle={onToggle}
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
            collapsed={false}
            onNavigate={() => onMobileOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

export default Sidebar
