import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { seedVault } from '../../../scripts/seed-vault'
import { VaultError } from '@/lib/errors'
import {
  findCollection,
  getAllCollectionIds,
  getItemsInCollection,
  loadVault,
  loadVaultIndex,
  topCollectionsByRecency,
} from '@/lib/vault'

/*
 * `loadVault` is wrapped in React's `cache()`, which only memoizes inside a
 * request. Outside React it falls through to the raw function, so these tests
 * exercise the loading and indexing behaviour but cannot assert the dedupe —
 * that was verified against a running server, where one request to `/` makes
 * seven accessor calls and produces exactly one disk read.
 */

let root: string
const originalPath = process.env.DEVVAULT_PATH

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-index-'))
  await seedVault(root)
  process.env.DEVVAULT_PATH = root
})

afterAll(async () => {
  process.env.DEVVAULT_PATH = originalPath
  await fs.rm(root, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadVault', () => {
  it('reads the vault the environment points at', async () => {
    const { items, collections, errors } = await loadVault()

    expect(items).toHaveLength(12)
    expect(collections).toHaveLength(6)
    expect(errors).toEqual([])
  })

  it('surfaces a setup error rather than an empty vault when the path is unset', async () => {
    delete process.env.DEVVAULT_PATH

    try {
      await expect(loadVault()).rejects.toBeInstanceOf(VaultError)
      await expect(loadVault()).rejects.toMatchObject({
        code: 'VAULT_PATH_UNSET',
      })
    } finally {
      process.env.DEVVAULT_PATH = root
    }
  })

  /*
   * A file the app silently ignores is worse than a noisy log. Everything that
   * parsed must still load — one bad file cannot take the vault down.
   */
  it('logs a malformed file server-side and still returns the rest', async () => {
    const damaged = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-bad-'))
    await seedVault(damaged)
    await fs.writeFile(
      path.join(damaged, 'notes/mongodb-index-strategy.md'),
      '---\nid: [unclosed\n---\n\nBody\n',
      'utf8',
    )
    process.env.DEVVAULT_PATH = damaged

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const { items, errors } = await loadVault()

      expect(items).toHaveLength(11)
      expect(errors).toHaveLength(1)
      expect(spy).toHaveBeenCalledTimes(1)

      const logged = spy.mock.calls[0][0] as string
      expect(logged).toContain('notes/mongodb-index-strategy.md')
      // Vault-relative and POSIX-separated: safe to read, and never an
      // absolute path into the user's filesystem.
      expect(logged).not.toContain(damaged)
    } finally {
      process.env.DEVVAULT_PATH = root
      await fs.rm(damaged, { recursive: true, force: true })
    }
  })

  it('says nothing when every file parses', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await loadVault()

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('findCollection', () => {
  it('finds a collection by id', async () => {
    await expect(findCollection('react-patterns')).resolves.toMatchObject({
      id: 'react-patterns',
      name: 'React Patterns',
    })
  })

  it('returns undefined for an unknown id, which is the 404 on /collections/[id]', async () => {
    await expect(findCollection('nope')).resolves.toBeUndefined()
    await expect(findCollection('')).resolves.toBeUndefined()
  })
})

describe('getAllCollectionIds', () => {
  it('returns every collection id', async () => {
    const ids = await getAllCollectionIds()
    const { collections } = await loadVault()

    expect(ids).toHaveLength(6)
    expect([...ids].sort()).toEqual(collections.map((c) => c.id).sort())
  })
})

describe('topCollectionsByRecency', () => {
  it('returns the newest first, capped at the limit', async () => {
    const top = await topCollectionsByRecency(3)
    const all = await topCollectionsByRecency(99)

    expect(top).toHaveLength(3)
    expect(top.map((c) => c.id)).toEqual(all.slice(0, 3).map((c) => c.id))

    for (let i = 1; i < all.length; i += 1) {
      expect(Date.parse(all[i - 1].updatedAt)).toBeGreaterThanOrEqual(
        Date.parse(all[i].updatedAt),
      )
    }
  })

  /*
   * It sorts an array that belongs to the loaded vault. Within a request that
   * array is shared with every other reader, so sorting in place would reorder
   * what they see.
   *
   * This needs the reader mocked rather than a seeded vault. Outside React,
   * `cache()` falls through to the raw function, so two `loadVault()` calls
   * return two different arrays and an in-place sort would be unobservable —
   * the test would pass no matter what the source did. Pinning `readVault` to
   * one result object reproduces the aliasing that `cache()` creates inside a
   * real request.
   */
  it('does not reorder the array it sorts', async () => {
    vi.resetModules()

    const collections = [
      { id: 'a', name: 'A', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', name: 'B', updatedAt: '2026-05-01T00:00:00Z' },
      { id: 'c', name: 'C', updatedAt: '2026-03-01T00:00:00Z' },
    ]
    const shared = { items: [], collections, errors: [] }

    vi.doMock('@/lib/vault/reader', () => ({ readVault: async () => shared }))

    try {
      const fresh = await import('@/lib/vault')
      const top = await fresh.topCollectionsByRecency(2)

      expect(top.map((c) => c.id)).toEqual(['b', 'c'])
      // The vault's own array is untouched.
      expect(collections.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    } finally {
      vi.doUnmock('@/lib/vault/reader')
      vi.resetModules()
    }
  })

  it('caps at the limit even when asked for more than exist', async () => {
    await expect(topCollectionsByRecency(0)).resolves.toEqual([])
    expect(await topCollectionsByRecency(100)).toHaveLength(6)
  })
})

describe('getItemsInCollection', () => {
  it('returns the items filed under a collection', async () => {
    const items = await getItemsInCollection('react-patterns')

    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.collectionIds).toContain('react-patterns')
    }
  })

  /*
   * Membership is many-to-many and stored on the item, so one item legitimately
   * appears under two collections.
   */
  it('counts an item under every collection it belongs to', async () => {
    const devops = await getItemsInCollection('devops-commands')
    const context = await getItemsInCollection('context-files')

    expect(devops.map((i) => i.id)).toContain('docker-networking-notes')
    expect(context.map((i) => i.id)).toContain('docker-networking-notes')
  })

  it('returns empty for a collection with no members and for an unknown id', async () => {
    await expect(getItemsInCollection('resources-links')).resolves.toEqual([])
    await expect(getItemsInCollection('nope')).resolves.toEqual([])
  })
})

describe('loadVaultIndex', () => {
  it('indexes every collection and accounts for every membership', async () => {
    const { collectionsById, itemsByCollection } = await loadVaultIndex()
    const { items, collections } = await loadVault()

    expect(collectionsById.size).toBe(collections.length)

    const memberships = items.reduce(
      (sum, item) => sum + item.collectionIds.length,
      0,
    )
    const indexed = [...itemsByCollection.values()].reduce(
      (sum, list) => sum + list.length,
      0,
    )

    expect(indexed).toBe(memberships)
  })
})
