import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedVault } from '../../scripts/seed-vault'
import {
  SIDEBAR_COLLECTION_LIMIT,
  getCollectionNav,
  getPrimaryNav,
  getTypeNav,
  getTypeNavEntry,
} from '@/lib/dashboard-nav'
import { ITEM_TYPE_IDS, ITEM_TYPE_META } from '@/lib/item-types'
import { PRIMARY_NAV_ICONS } from '@/lib/nav-icons'
import { readVault } from '@/lib/vault/reader'
import type { SidebarNav } from '@/types/dashboard'
import type { Collection, Item } from '@/types/vault'

/*
 * The nav getters read `$DEVVAULT_PATH` off disk, so the suite seeds a throwaway
 * vault and points the environment at it. Expectations are computed from a
 * direct `readVault` of the same directory rather than from `scripts/seed-data`:
 * a collection's `updatedAt` is derived on read, so the seed arrays are not
 * authoritative about the order the sidebar lists collections in.
 */

let root: string
let vault: { items: Item[]; collections: Collection[] }
const originalPath = process.env.DEVVAULT_PATH

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-nav-'))
  await seedVault(root)
  process.env.DEVVAULT_PATH = root
  vault = await readVault(root)
})

afterAll(async () => {
  process.env.DEVVAULT_PATH = originalPath
  await fs.rm(root, { recursive: true, force: true })
})

const nav = async (): Promise<SidebarNav> => ({
  primary: await getPrimaryNav(),
  types: await getTypeNav(),
  collections: await getCollectionNav(),
})

describe('getPrimaryNav', () => {
  it('counts every item and every favorite', async () => {
    const [dashboard, favorites] = await getPrimaryNav()

    expect(dashboard).toMatchObject({ id: 'all', label: 'Dashboard', href: '/' })
    expect(dashboard.count).toBe(vault.items.length)
    expect(favorites).toMatchObject({
      id: 'favorites',
      label: 'Favorites',
      href: '/favorites',
    })
    expect(favorites.count).toBe(
      vault.items.filter((item) => item.favorite).length,
    )
  })

  it('names an icon the client can resolve', async () => {
    for (const entry of await getPrimaryNav()) {
      expect(PRIMARY_NAV_ICONS[entry.icon]).toBeTypeOf('object')
    }
  })
})

describe('getTypeNav', () => {
  it('lists every item type in declaration order', async () => {
    expect((await getTypeNav()).map((entry) => entry.id)).toEqual([
      ...ITEM_TYPE_IDS,
    ])
  })

  it('counts each type and accounts for every item', async () => {
    const entries = await getTypeNav()

    for (const entry of entries) {
      expect(entry.count).toBe(
        vault.items.filter((item) => item.type === entry.id).length,
      )
    }

    const total = entries.reduce((sum, entry) => sum + entry.count, 0)
    expect(total).toBe(vault.items.length)
  })

  it('builds the route each row links to', async () => {
    for (const entry of await getTypeNav()) {
      expect(entry.href).toBe(`/items/${entry.id}`)
    }
  })

  /*
   * The icon and colour used to travel on the entry. They now come from
   * ITEM_TYPE_META in the client, so every id has to be a key of it — that
   * lookup is what keeps the rendered row identical.
   */
  it('yields ids that ITEM_TYPE_META can resolve', async () => {
    for (const entry of await getTypeNav()) {
      expect(ITEM_TYPE_META[entry.id]).toBeDefined()
    }
  })

  /*
   * The type list is the app's own vocabulary, not vault data: an empty vault
   * still has seven types, all reading zero. Regressing this to "the types the
   * vault happens to contain" would make the sidebar shrink as items are
   * deleted.
   */
  it('lists all seven types even for a vault with no items', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-none-'))
    process.env.DEVVAULT_PATH = empty

    try {
      const entries = await getTypeNav()
      expect(entries).toHaveLength(ITEM_TYPE_IDS.length)
      expect(entries.every((entry) => entry.count === 0)).toBe(true)
    } finally {
      process.env.DEVVAULT_PATH = root
      await fs.rm(empty, { recursive: true, force: true })
    }
  })
})

describe('getTypeNavEntry', () => {
  it('finds a real type', async () => {
    expect(await getTypeNavEntry('snippet')).toEqual(
      (await getTypeNav()).find((entry) => entry.id === 'snippet'),
    )
  })

  it('returns undefined for an unknown type, which is the 404 on /items/[type]', async () => {
    expect(await getTypeNavEntry('nope')).toBeUndefined()
    expect(await getTypeNavEntry('')).toBeUndefined()
    expect(await getTypeNavEntry('Snippet')).toBeUndefined()
  })
})

describe('getCollectionNav', () => {
  it('caps the list at the three most recently updated collections', async () => {
    const entries = await getCollectionNav()
    const expected = [...vault.collections]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, SIDEBAR_COLLECTION_LIMIT)

    expect(entries).toHaveLength(SIDEBAR_COLLECTION_LIMIT)
    expect(entries.map((entry) => entry.id)).toEqual(
      expected.map((collection) => collection.id),
    )
  })

  it('counts the items filed in each collection and links to its page', async () => {
    for (const entry of await getCollectionNav()) {
      expect(entry.count).toBe(
        vault.items.filter((item) => item.collectionIds.includes(entry.id))
          .length,
      )
      expect(entry.href).toBe(`/collections/${entry.id}`)
    }
  })

  it('takes its dot colour from the collection’s dominant type', async () => {
    const colors = Object.values(ITEM_TYPE_META).map((meta) => meta.color)

    for (const entry of await getCollectionNav()) {
      // undefined is legitimate: an empty collection has no dominant type.
      if (entry.color !== undefined) expect(colors).toContain(entry.color)
    }
  })
})

describe('the nav as a whole', () => {
  /*
   * The reason these became functions. Next.js rejects a non-serializable
   * prop at build time; this catches it in a unit run, and says which field.
   */
  it('is serializable, so it can cross into the client as a prop', async () => {
    const value = await nav()

    expect(JSON.parse(JSON.stringify(value))).toEqual(value)

    for (const entry of [...value.primary, ...value.types, ...value.collections]) {
      for (const [key, field] of Object.entries(entry)) {
        expect(
          typeof field,
          `${key} must not be a function or component`,
        ).not.toBe('function')
      }
    }
  })

  /*
   * They used to be shared module-scope constants. Now that every call builds
   * a fresh list, a caller sorting or splicing one must not affect the next.
   */
  it('hands out a fresh list on every call', async () => {
    const first = await getTypeNav()
    const before = first.length

    first.reverse()
    first.pop()

    expect(await getTypeNav()).toHaveLength(before)
    expect((await getTypeNav())[0].id).toBe(ITEM_TYPE_IDS[0])
  })
})
