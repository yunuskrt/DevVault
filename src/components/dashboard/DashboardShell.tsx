'use client'

import React, { useState } from 'react'
import { Menu, Vault } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import Sidebar from './Sidebar'
import MainArea from './MainArea'

type Props = {
  children: React.ReactNode
}

const DashboardShell = ({ children }: Props) => {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onToggle={() => setCollapsed((value) => !value)}
          onMobileOpenChange={setMobileOpen}
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
    </TooltipProvider>
  )
}

export default DashboardShell
