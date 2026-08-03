'use client'

import React from 'react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import SidebarContent from './SidebarContent'

type Props = {
  collapsed: boolean
  mobileOpen: boolean
  onToggle: () => void
  onMobileOpenChange: (open: boolean) => void
}

const Sidebar = ({
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
        <SidebarContent collapsed={collapsed} onToggle={onToggle} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 p-0 sm:max-w-64"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent
            collapsed={false}
            onNavigate={() => onMobileOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

export default Sidebar
