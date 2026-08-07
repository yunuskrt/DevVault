import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedVault } from '../../../scripts/seed-vault'
import { walkVault } from '@/lib/filesystem/walk'
import { readTextFile } from '@/lib/filesystem/read-write'
import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/lib/markdown/frontmatter'
import {
  collections as seedCollections,
  items as seedItems,
} from '../../../scripts/seed-data'
import { vaultGitignore } from '@/lib/vault/layout'
import { readVault } from '@/lib/vault/reader'
import type { Collection } from '@/types/vault'

const createSeededVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-test-'))
  await seedVault(root)
  return root
}

/** `readVault` returns files in path order; the seed arrays are in their own. */
const byId = <T extends { id: string }>(records: readonly T[]): T[] =>
  [...records].sort((a, b) => a.id.localeCompare(b.id))

/** The one field that is derived on read rather than stored (§3.4). */
const withoutUpdatedAt = ({ updatedAt: _updatedAt, ...rest }: Collection) => rest

describe('readVault over a freshly seeded vault', () => {
  let root: string
  let result: Awaited<ReturnType<typeof readVault>>

  beforeAll(async () => {
    root = await createSeededVault()
    result = await readVault(root)
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('loads every record with no errors', () => {
    expect(result.errors).toEqual([])
    expect(result.items).toHaveLength(12)
    expect(result.collections).toHaveLength(6)
  })

  it('reports where each record was read from (§3.2)', () => {
    /*
     * The path is not derivable from the id: it comes from the title on
     * create, and a title edit renames the file while the id stays put. The
     * writer would otherwise recompute a path from the id and write a *second*
     * file claiming an id that already exists.
     */
    expect(result.itemPaths.size).toBe(12)
    expect(result.collectionPaths.size).toBe(6)

    for (const item of result.items) {
      const path = result.itemPaths.get(item.id)
      expect(path).toBeDefined()
      expect(path?.endsWith('.md')).toBe(true)
    }

    for (const collection of result.collections) {
      expect(result.collectionPaths.get(collection.id)).toBe(
        `collections/${collection.id}.md`,
      )
    }
  })

  it('returns exactly the items the seed data describes', () => {
    expect(byId(result.items)).toEqual(byId(seedItems))
  })

  it('returns the collections the seed data describes, apart from updatedAt', () => {
    expect(byId(result.collections).map(withoutUpdatedAt)).toEqual(
      byId(seedCollections).map(withoutUpdatedAt),
    )
  })

  it('derives collection updatedAt as the newest member item', () => {
    const newestMember = (collectionId: string) =>
      seedItems
        .filter(item => item.collectionIds.includes(collectionId))
        .map(item => item.updatedAt)
        .sort()
        .at(-1)

    for (const collection of result.collections) {
      const expected = newestMember(collection.id)
      if (expected) expect(collection.updatedAt).toBe(expected)
    }
  })

  it('falls back to the file mtime for an empty collection', async () => {
    // `Resources & Links` is the vault's only collection with no members.
    const empty = result.collections.find(c => c.id === 'resources-links')
    const stats = await fs.stat(path.join(root, 'collections/resources-links.md'))

    expect(empty?.updatedAt).toBe(stats.mtime.toISOString())
  })

  /*
   * The mtime fallback above is only useful if seeding stamps it. Writing every
   * file "now" made the empty collection read as the most recently updated
   * thing in the vault, which put it in the sidebar's top three and pushed a
   * real collection out. The test above would pass either way — this is the one
   * that pins the date to what the seed data actually describes.
   */
  it('stamps each collection file mtime so the seeded dates survive', async () => {
    const empty = result.collections.find(c => c.id === 'resources-links')
    const seeded = seedCollections.find(c => c.id === 'resources-links')

    // Compared as instants: an mtime round-trips through `toISOString()` and
    // carries milliseconds the seed literal does not spell out.
    expect(Date.parse(empty?.updatedAt ?? '')).toBe(
      Date.parse(seeded?.updatedAt ?? ''),
    )

    // And it must not be the most recent collection in the vault.
    const newest = [...result.collections].sort((a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    )[0]
    expect(newest.id).not.toBe('resources-links')
  })

  /*
   * A collection sharing its newest item with another collection derives the
   * same `updatedAt` as that other one. This tie is live in the seeded vault
   * and is what `byUpdatedAtDesc`'s id tie-break exists to resolve.
   */
  it('derives an equal updatedAt for two collections sharing their newest member', async () => {
    const dateOf = (id: string) =>
      result.collections.find(c => c.id === id)?.updatedAt

    expect(dateOf('context-files')).toBe(dateOf('devops-commands'))
  })

  it('round-trips every seeded file byte for byte', async () => {
    const files = (await walkVault(root)).filter(file => file.endsWith('.md'))
    expect(files).toHaveLength(18)

    for (const file of files) {
      const raw = await readTextFile(root, file)
      const { data, body } = parseFrontmatter(raw)
      expect(
        serializeFrontmatter(data as Record<string, unknown>, body),
        `${file} did not round-trip`,
      ).toBe(raw)
    }
  })

  it('reads a binary item from its sidecar', () => {
    const image = result.items.find(item => item.id === 'architecture-diagram')
    expect(image).toMatchObject({ type: 'image', fileName: 'architecture-diagram.png' })
  })
})

describe('readVault over a damaged vault', () => {
  let root: string

  beforeAll(async () => {
    root = await createSeededVault()
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  const damage = async (
    file: string,
    edit: (raw: string) => string,
  ): Promise<void> => {
    const full = path.join(root, file)
    await fs.writeFile(full, edit(await fs.readFile(full, 'utf8')), 'utf8')
  }

  it('reports a file missing its type and still loads the rest', async () => {
    const file = 'notes/mongodb-index-strategy.md'
    await damage(file, raw => raw.replace('type: note\n', ''))

    const { items, errors } = await readVault(root)

    expect(items).toHaveLength(11)
    expect(errors).toHaveLength(1)
    expect(errors[0].path).toBe(file)
    expect(errors[0].message).toContain('type')
  })

  it('reports malformed YAML without throwing', async () => {
    await damage('notes/mongodb-index-strategy.md', () =>
      '---\nid: [unclosed\n---\n\nBody\n',
    )

    const { items, errors } = await readVault(root)

    expect(items).toHaveLength(11)
    expect(errors[0].message).toContain('not valid YAML')
  })

  it('reports two files claiming one id rather than picking one', async () => {
    const original = path.join(root, 'notes/docker-networking-notes.md')
    await fs.copyFile(original, path.join(root, 'notes/copy.md'))

    const { errors } = await readVault(root)
    const duplicate = errors.find(error =>
      error.message.includes('duplicate id'),
    )

    expect(duplicate?.message).toContain('docker-networking-notes')
    // Both paths are named: one as the error's own, one in its message.
    expect([duplicate?.path, duplicate?.message].join(' ')).toContain(
      'notes/copy.md',
    )

    await fs.rm(path.join(root, 'notes/copy.md'))
  })

  it('reports a type that disagrees with its directory', async () => {
    await fs.copyFile(
      path.join(root, 'commands/prune-docker-system.md'),
      path.join(root, 'notes/prune-docker-system.md'),
    )

    const { errors } = await readVault(root)
    const mismatch = errors.find(error => error.message.includes('belongs in'))

    expect(mismatch?.path).toBe('notes/prune-docker-system.md')
    expect(mismatch?.message).toContain('commands/')

    await fs.rm(path.join(root, 'notes/prune-docker-system.md'))
  })
})

describe('readVault over a directory that is not a vault', () => {
  it('returns empty rather than throwing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-empty-'))
    await fs.writeFile(path.join(root, 'README.md'), '# Not a vault\n', 'utf8')

    const result = await readVault(root)

    // A root-level README is neither an item nor a collection, and ignoring it
    // is what lets a user keep ordinary Markdown alongside their vault.
    expect(result).toEqual({
      items: [],
      collections: [],
      errors: [],
      itemPaths: new Map(),
      collectionPaths: new Map(),
    })

    await fs.rm(root, { recursive: true, force: true })
  })
})

describe('seedVault', () => {
  it('refuses a vault that already has content unless forced', async () => {
    const root = await createSeededVault()

    await expect(seedVault(root)).rejects.toThrow(/already has content/)
    await expect(seedVault(root, { force: true })).resolves.toBeInstanceOf(Array)

    await fs.rm(root, { recursive: true, force: true })
  })

  it('writes the tree from architecture §3.1', async () => {
    const root = await createSeededVault()
    const walked = await walkVault(root)

    expect(walked.filter(f => f.startsWith('collections/'))).toHaveLength(6)
    expect(walked.filter(f => f.endsWith('.md'))).toHaveLength(18)

    // Dotfiles are outside the walk, so they are checked directly.
    await expect(
      fs.readFile(path.join(root, '.devvault/config.json'), 'utf8'),
    ).resolves.toContain('"schemaVersion": 1')
    // The generated allow-list, not a literal — `layout.test.ts` asserts what
    // it actually ignores by asking `git check-ignore`. All this needs to know
    // is that seeding writes it rather than the one-line version it replaced.
    await expect(
      fs.readFile(path.join(root, '.gitignore'), 'utf8'),
    ).resolves.toBe(vaultGitignore())

    await fs.rm(root, { recursive: true, force: true })
  })
})
