import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedVault } from '../../scripts/seed-vault'
import {
  getAllCollections,
  getCollectionById,
  getDashboardStats,
  getFavoriteItems,
  getItemsByCollection,
  getItemsByType,
  getPinnedItems,
  getRecentCollections,
  getRecentItems,
} from '@/lib/dashboard-data'
import { DEFAULT_COLLECTION_SORT, sortCollections } from '@/lib/collection-sort'
import { DEFAULT_ITEM_SORT, sortItems } from '@/lib/item-sort'
import { loadVault } from '@/lib/vault'

let root: string
const originalPath = process.env.DEVVAULT_PATH

/** One fixed clock, so every relative label is deterministic. */
const NOW = Date.parse('2026-08-07T12:00:00Z')

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-data-'))
  await seedVault(root)
  process.env.DEVVAULT_PATH = root
})

afterAll(async () => {
  process.env.DEVVAULT_PATH = originalPath
  await fs.rm(root, { recursive: true, force: true })
})

describe('getDashboardStats', () => {
  it('reports the four counts the stat row renders', async () => {
    const stats = await getDashboardStats()

    expect(stats.map((s) => [s.id, s.value])).toEqual([
      ['items', 12],
      ['collections', 6],
      ['favorite-items', 5],
      ['pinned-items', 3],
    ])
  })
})

describe('getRecentItems', () => {
  it('caps at ten and takes the newest', async () => {
    const items = await getRecentItems(NOW)
    const { items: all } = await loadVault()

    expect(all.length).toBeGreaterThan(10)
    expect(items).toHaveLength(10)

    // The two it dropped must be the two oldest.
    const dropped = all
      .filter((item) => !items.some((r) => r.id === item.id))
      .map((item) => Date.parse(item.updatedAt))
    const kept = items.map((item) => Date.parse(item.updatedAt))

    expect(Math.max(...dropped)).toBeLessThanOrEqual(Math.min(...kept))
  })

  it('orders newest first', async () => {
    const items = await getRecentItems(NOW)

    for (let i = 1; i < items.length; i += 1) {
      expect(Date.parse(items[i - 1].updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(items[i].updatedAt),
      )
    }
  })
})

describe('getPinnedItems and getFavoriteItems', () => {
  it('return only flagged items, and all of them', async () => {
    const { items: all } = await loadVault()

    const pinned = await getPinnedItems(NOW)
    expect(pinned).toHaveLength(all.filter((i) => i.pinned).length)
    expect(pinned.every((item) => item.pinned)).toBe(true)

    const favorites = await getFavoriteItems(NOW)
    expect(favorites).toHaveLength(all.filter((i) => i.favorite).length)
    expect(favorites.every((item) => item.favorite)).toBe(true)
  })

})

/*
 * Not tested here: that these accessors leave the vault's own array unsorted.
 * `getPinnedItems` sorts what `filter` returned and `getRecentItems` sorts a
 * spread copy, so both are safe by construction rather than by assertion. The
 * one accessor that could alias the vault's array is `topCollectionsByRecency`,
 * and `vault/index.test.ts` covers it with the reader mocked — outside React,
 * `cache()` does not memoize, so an aliasing test written against a seeded
 * vault passes whatever the source does.
 */

describe('getItemsByType', () => {
  it('returns exactly that type', async () => {
    const snippets = await getItemsByType('snippet', NOW)

    expect(snippets).toHaveLength(3)
    expect(snippets.every((item) => item.type === 'snippet')).toBe(true)
  })

  it('accounts for every item across all types', async () => {
    const { items } = await loadVault()
    const counts = await Promise.all(
      (['snippet', 'prompt', 'note', 'command', 'file', 'image', 'url'] as const).map(
        async (type) => (await getItemsByType(type, NOW)).length,
      ),
    )

    expect(counts.reduce((a, b) => a + b, 0)).toBe(items.length)
  })
})

describe('getItemsByCollection', () => {
  it('returns the collection’s members', async () => {
    const items = await getItemsByCollection('devops-commands', NOW)

    expect(items).toHaveLength(4)
    for (const item of items) {
      expect(item.collectionIds).toContain('devops-commands')
    }
  })

  it('returns empty for a collection with no members and for an unknown id', async () => {
    await expect(getItemsByCollection('resources-links', NOW)).resolves.toEqual([])
    await expect(getItemsByCollection('nope', NOW)).resolves.toEqual([])
  })
})

/*
 * The invariant the whole browser depends on. Each list page renders the server's
 * order first, then hydrates a client component whose `useState` initialises to
 * DEFAULT_ITEM_SORT. If the server pre-sorted with anything else, the list would
 * visibly reshuffle at hydration.
 */
describe('the server pre-sort matches the client’s initial sort', () => {
  it('holds for every item accessor', async () => {
    const { items } = await loadVault()

    const expected = (source: typeof items) =>
      sortItems(
        source.map((item) => ({ ...item })),
        DEFAULT_ITEM_SORT,
      ).map((item) => item.id)

    expect((await getItemsByType('snippet', NOW)).map((i) => i.id)).toEqual(
      expected(items.filter((i) => i.type === 'snippet')),
    )
    expect((await getFavoriteItems(NOW)).map((i) => i.id)).toEqual(
      expected(items.filter((i) => i.favorite)),
    )
    expect((await getItemsByCollection('devops-commands', NOW)).map((i) => i.id)).toEqual(
      expected(items.filter((i) => i.collectionIds.includes('devops-commands'))),
    )
  })

  it('holds for the collections page', async () => {
    const all = await getAllCollections(NOW)

    expect(all.map((c) => c.id)).toEqual(
      sortCollections(
        all.map((c) => ({ ...c })),
        DEFAULT_COLLECTION_SORT,
      ).map((c) => c.id),
    )
  })
})

describe('getAllCollections and getRecentCollections', () => {
  it('return every collection, and the four most recent of them', async () => {
    const all = await getAllCollections(NOW)
    const recent = await getRecentCollections(NOW)

    expect(all).toHaveLength(6)
    expect(recent).toHaveLength(4)
    expect(recent.map((c) => c.id)).toEqual(all.slice(0, 4).map((c) => c.id))
  })

  it('carries the derived count and dominant types onto each collection', async () => {
    const all = await getAllCollections(NOW)
    const byId = new Map(all.map((c) => [c.id, c]))

    expect(byId.get('devops-commands')).toMatchObject({
      count: 4,
      dominantTypes: ['command'],
    })
    // The empty collection: no members, so no dominant type and a muted dot.
    expect(byId.get('resources-links')).toMatchObject({
      count: 0,
      dominantTypes: [],
    })
  })
})

describe('getCollectionById', () => {
  it('finds a collection and returns undefined for an unknown id', async () => {
    await expect(getCollectionById('ai-prompts')).resolves.toMatchObject({
      name: 'AI Prompts',
    })
    await expect(getCollectionById('nope')).resolves.toBeUndefined()
  })
})

/*
 * Every accessor takes an optional `now` so a page can thread one clock through
 * every timestamp it renders. Two accessors given the same `now` must agree, or
 * the same item would show a different age in two places on one page.
 */
describe('the threaded clock', () => {
  it('produces the same label for the same item across accessors', async () => {
    const recent = await getRecentItems(NOW)
    const pinned = await getPinnedItems(NOW)

    const shared = pinned.find((p) => recent.some((r) => r.id === p.id))
    expect(shared).toBeDefined()

    const inRecent = recent.find((r) => r.id === shared?.id)
    expect(inRecent?.updatedLabel).toBe(shared?.updatedLabel)
  })

  it('moves the label when the clock moves', async () => {
    const [item] = await getRecentItems(NOW)
    const [later] = await getRecentItems(NOW + 400 * 24 * 60 * 60 * 1000)

    expect(item.updatedLabel).not.toBe(later.updatedLabel)
    expect(later.updatedLabel).toMatch(/y ago$/)
  })
})
