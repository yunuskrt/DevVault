'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Boxes, ChevronRight, FolderPlus, PanelLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ITEM_TYPE_META } from '@/lib/item-types'
import { PRIMARY_NAV_ICONS } from '@/lib/nav-icons'
import SidebarRow from './SidebarRow'
import SidebarSection from './SidebarSection'
import GitSyncPanel from './GitSyncPanel'
import VaultAlertRow from './VaultAlertRow'
import type { GitPanelState, SidebarNav, VaultAlerts } from '@/types/dashboard'

type Props = {
  /**
   * Derived on the server. This component must not import the nav lists
   * itself — that would pull the vault, and eventually filesystem access,
   * into the browser bundle.
   */
  nav: SidebarNav
  /** Also derived on the server, for the same reason — Git shells out. */
  git: GitPanelState
  /** Likewise. Drives the alert rows above the Git panel. */
  alerts: VaultAlerts
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
  /**
   * The dialogs themselves live in `DashboardShell`, which renders once — this
   * component renders twice (desktop aside and mobile sheet).
   */
  onOpenConflicts: () => void
  onOpenIssues: () => void
}

const SidebarContent = ({
  nav,
  git,
  alerts,
  collapsed,
  onToggle,
  onNavigate,
  onOpenConflicts,
  onOpenIssues,
}: Props) => {
  const pathname = usePathname()
  const [typesOpen, setTypesOpen] = useState(true)
  const [collectionsOpen, setCollectionsOpen] = useState(true)

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 p-3',
          collapsed && 'flex-col gap-3',
        )}
      >
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="DevVault home"
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-lg transition-opacity hover:opacity-80',
            !collapsed && 'flex-1',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes aria-hidden="true" className="size-4" />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold">DevVault</span>
              <span className="truncate text-xs text-muted-foreground">
                knowledge, versioned
              </span>
            </span>
          )}
        </Link>
        {onToggle && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <PanelLeft className="size-4" />
          </Button>
        )}
      </div>

      <div className={cn('shrink-0 space-y-2 px-3 pb-3', collapsed && 'px-2')}>
        <Button className={cn('w-full', collapsed && 'px-0')}>
          <Plus className="size-4" />
          {/* The label stays in the DOM when collapsed so the button keeps its name. */}
          <span className={collapsed ? 'sr-only' : undefined}>New Item</span>
        </Button>
        <Button
          variant="outline"
          className={cn(
            'w-full border-primary/20 bg-primary/5 text-primary/90 hover:bg-primary/10 hover:text-primary dark:border-primary/20 dark:bg-primary/5 dark:hover:bg-primary/10',
            collapsed && 'px-0',
          )}
        >
          <FolderPlus className="size-4" />
          <span className={collapsed ? 'sr-only' : undefined}>New Collection</span>
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className={cn('space-y-4 px-3 pb-4', collapsed && 'px-2')}>
          <ul className="space-y-1">
            {nav.primary.map((entry) => {
              const Icon = PRIMARY_NAV_ICONS[entry.icon]
              return (
                <li key={entry.id}>
                  <SidebarRow
                    label={entry.label}
                    count={entry.count}
                    collapsed={collapsed}
                    href={entry.href}
                    active={entry.href ? pathname === entry.href : false}
                    icon={<Icon className="size-4 shrink-0" />}
                    onNavigate={onNavigate}
                  />
                </li>
              )
            })}
          </ul>

          <SidebarSection
            title="Types"
            collapsed={collapsed}
            open={typesOpen}
            onOpenChange={setTypesOpen}
          >
            <ul className="space-y-1">
              {nav.types.map((type) => {
                const { icon: Icon, color } = ITEM_TYPE_META[type.id]
                return (
                  <li key={type.id}>
                    <SidebarRow
                      label={type.label}
                      count={type.count}
                      collapsed={collapsed}
                      href={type.href}
                      active={pathname === type.href}
                      icon={<Icon className="size-4 shrink-0" />}
                      iconColor={color}
                      onNavigate={onNavigate}
                    />
                  </li>
                )
              })}
            </ul>
          </SidebarSection>

          <SidebarSection
            title="Collections"
            collapsed={collapsed}
            open={collectionsOpen}
            onOpenChange={setCollectionsOpen}
          >
            <ul className="space-y-1">
              {nav.collections.map((collection) => (
                <li key={collection.id}>
                  <SidebarRow
                    label={collection.name}
                    count={collection.count}
                    collapsed={collapsed}
                    href={collection.href}
                    active={pathname === collection.href}
                    dot
                    dotColor={collection.color}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
            {!collapsed && (
              <Link
                href="/collections"
                onClick={onNavigate}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <span className="flex-1 truncate text-left">
                  View all collections
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            )}
          </SidebarSection>
        </nav>
      </ScrollArea>

      <VaultAlertRow
        alerts={alerts}
        collapsed={collapsed}
        onOpenConflicts={onOpenConflicts}
        onOpenIssues={onOpenIssues}
      />

      <GitSyncPanel
        git={git}
        collapsed={collapsed}
        onOpenConflicts={onOpenConflicts}
      />
    </div>
  )
}

export default SidebarContent
