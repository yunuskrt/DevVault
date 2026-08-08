/**
 * Presentation shapes the dashboard renders. Each one is a vault type plus the
 * finished strings a card needs, so components never format or look anything
 * up themselves.
 */

import type { GitOperation } from '@/lib/git/types'
import type { Collection, Item, ItemTypeId } from '@/types/vault'

export type DashboardStat = {
  id: string
  label: string
  value: number
}

/** An item plus the presentation-ready fields the card needs. */
export type DashboardItem = Item & {
  /** Empty when the item belongs to no collection. */
  collectionNames: string[]
  typeLabel: string
  updatedLabel: string
  /** What the card's copy button writes to the clipboard. */
  copyText: string
}

export type DashboardCollection = Collection & {
  count: number
  updatedLabel: string
  /**
   * The collection's most common item types, ordered by importance. Drives
   * both the card's dot colour (the first entry) and its type icons. Empty
   * when the collection holds no items.
   */
  dominantTypes: ItemTypeId[]
}

/*
 * Sidebar navigation.
 *
 * These cross the server/client boundary as props, so every field has to be
 * serializable — which is why nothing here holds a `LucideIcon`. A row names
 * its icon and the client resolves it: type rows through `ITEM_TYPE_META`,
 * primary rows through `PRIMARY_NAV_ICONS`.
 */

/** Icon keys for the nav rows that are not backed by an item type. */
export type PrimaryNavIcon = 'dashboard' | 'favorites'

export type PrimaryNavEntry = {
  id: string
  label: string
  icon: PrimaryNavIcon
  count: number
  href?: string
}

export type CollectionNavEntry = {
  id: string
  name: string
  color?: string
  count: number
  href: string
}

/** Icon and colour come from `ITEM_TYPE_META[id]`, so neither is carried. */
export type TypeNavEntry = {
  id: ItemTypeId
  label: string
  count: number
  href: string
}

/**
 * Every list the sidebar renders, in one prop. Threaded from the root layout
 * (server) down through the client shell, so no client component has to reach
 * into the vault for it.
 */
export type SidebarNav = {
  primary: PrimaryNavEntry[]
  types: TypeNavEntry[]
  collections: CollectionNavEntry[]
}

/*
 * Git sync panel.
 *
 * A sibling of `SidebarNav` rather than a field on it: `SidebarNav` is every
 * *list* the sidebar renders, and Git state is neither a list nor navigation.
 * Keeping them apart also means a failing Git read cannot take the nav with
 * it.
 *
 * Like the nav types, this crosses to the client as a prop, so it holds
 * finished strings and an icon *key* — never a `LucideIcon`, never a
 * `GitStatus`. The panel renders it without deriving anything.
 */

export type GitPanelIcon =
  | 'synced'
  | 'uncommitted'
  | 'ahead'
  | 'behind'
  | 'diverged'
  | 'conflict'
  /** Suspended mid-rebase or mid-merge — distinct from a plain conflict, which
   * the user can resolve and commit; this one has to be finished or aborted. */
  | 'paused'
  | 'local-only'
  | 'no-repo'
  | 'error'

export type GitPanelTone = 'ok' | 'info' | 'warn' | 'danger'

export type GitPanelState = {
  icon: GitPanelIcon
  tone: GitPanelTone
  /** Null when there is no repository, so no branch to name. */
  branch: string | null
  /** Terse, for the 256px footer: `Synced`, `18 uncommitted`, `2 to push`. */
  summary: string
  /** Second line — `Last commit 4m ago`. Null when there is nothing to say. */
  detail: string | null
  /**
   * The full sentence. Shown in the tooltip and used as the collapsed rail's
   * `sr-only` text, which is why every state has one: collapsed, it is the
   * only thing a screen reader gets.
   */
  description: string
  /** False when there is nothing to sync — no repository, or no remote. */
  canSync: boolean
}

/*
 * Vault alerts — conflicted files, and files that would not load.
 *
 * A third sibling of `SidebarNav` and `GitPanelState`, for the same reasons:
 * derived on the server, serializable, and rendered without the client deriving
 * anything. Both lists are empty in the ordinary case, and the sidebar shows
 * nothing at all when they are.
 */

/** One conflicted file, named for its item where the file can still be read. */
export type ConflictEntry = {
  /** Vault-relative and POSIX-separated — safe to show. */
  path: string
  /** Null when neither the working tree nor the index yields readable frontmatter. */
  title: string | null
  /** From the file's directory, so conflict markers cannot corrupt it. */
  type: ItemTypeId | null
}

/** One file the vault could not load, from `VaultLoadResult.errors`. */
export type VaultIssue = {
  path: string
  message: string
}

export type VaultAlerts = {
  conflicts: ConflictEntry[]
  /**
   * What the repository is suspended in, if anything. Drives the dialog's
   * footer: a suspended operation can be finished or aborted, whereas conflicts
   * left by a failed autostash restore (`null`) have neither — the files are
   * simply staged once resolved, and there is nothing to abort but the user's
   * own edits.
   */
  operation: GitOperation | null
  issues: VaultIssue[]
}
