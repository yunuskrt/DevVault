'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Boxes, ChevronRight, FolderPlus, PanelLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { collectionNav, primaryNav, typeNav } from '@/lib/dashboard-nav'
import SidebarRow from './SidebarRow'
import SidebarSection from './SidebarSection'
import GitSyncPanel from './GitSyncPanel'

type Props = {
  collapsed: boolean
  onToggle?: () => void
  onNavigate?: () => void
}

const SidebarContent = ({ collapsed, onToggle, onNavigate }: Props) => {
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
          {!collapsed && 'New Item'}
          {collapsed && <span className="sr-only">New Item</span>}
        </Button>
        <Button
          variant="outline"
          className={cn(
            'w-full border-primary/20 bg-primary/5 text-primary/90 hover:bg-primary/10 hover:text-primary dark:border-primary/20 dark:bg-primary/5 dark:hover:bg-primary/10',
            collapsed && 'px-0',
          )}
        >
          <FolderPlus className="size-4" />
          {!collapsed && 'New Collection'}
          {collapsed && <span className="sr-only">New Collection</span>}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className={cn('space-y-4 px-3 pb-4', collapsed && 'px-2')}>
          <ul className="space-y-1">
            {primaryNav.map((entry) => {
              const Icon = entry.icon
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
              {typeNav.map((type) => {
                const Icon = type.icon
                return (
                  <li key={type.id}>
                    <SidebarRow
                      label={type.label}
                      count={type.count}
                      collapsed={collapsed}
                      href={type.href}
                      active={pathname === type.href}
                      icon={<Icon className="size-4 shrink-0" />}
                      iconColor={type.color}
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
              {collectionNav.map((collection) => (
                <li key={collection.id}>
                  <SidebarRow
                    label={collection.name}
                    count={collection.count}
                    collapsed={collapsed}
                    dot
                    dotColor={collection.color}
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

      <GitSyncPanel collapsed={collapsed} />
    </div>
  )
}

export default SidebarContent
