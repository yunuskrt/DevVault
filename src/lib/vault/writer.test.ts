import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { parseFrontmatter } from '@/lib/markdown/frontmatter'
import { itemFrontmatterSchema, toItem } from '@/lib/vault/schema'
import {
  deleteFiles,
  moveFile,
  newItemPath,
  renamedItemPath,
  serializeItem,
  slugify,
  uniqueSlug,
  vaultFileExists,
  writeCollection,
  writeItem,
} from '@/lib/vault/writer'
import type { Item } from '@/types/vault'

const temporaryDirs: string[] = []

const makeVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-writer-'))
  temporaryDirs.push(root)
  return root
}

afterAll(async () => {
  await Promise.all(
    temporaryDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

const note = (overrides: Partial<Item> = {}): Item =>
  ({
    id: 'docker-networking',
    title: 'Docker networking',
    type: 'note',
    collectionIds: [],
    tags: ['docker'],
    favorite: false,
    pinned: false,
    content: 'Bridge networks are the default.',
    createdAt: '2026-08-01T12:00:00Z',
    updatedAt: '2026-08-01T12:00:00Z',
    ...overrides,
  }) as Item

describe('slugify', () => {
  it('reduces a title to a filename-safe slug', () => {
    expect(slugify('Docker Networking')).toBe('docker-networking')
    expect(slugify('useDebounce hook')).toBe('usedebounce-hook')
    expect(slugify('pandas: filter & sort!')).toBe('pandas-filter-sort')
  })

  it('keeps accented letters readable rather than dropping them', () => {
    // NFKD then stripping the combining marks; without the decomposition step
    // `Café` would slugify to `caf`.
    expect(slugify('Café résumé')).toBe('cafe-resume')
  })

  it('produces nothing that could escape a directory', () => {
    // The real boundary is `resolveInVault`; this is what stops a legitimate
    // title from ever reaching it as a traversal.
    for (const hostile of [
      '../../etc/passwd',
      '/etc/passwd',
      'C:\\Windows\\System32',
      '.hidden',
      'a/b/c',
    ]) {
      const slug = slugify(hostile)
      expect(slug).toMatch(/^[a-z0-9-]+$/)
      expect(slug).not.toContain('..')
      expect(slug).not.toContain('/')
      expect(slug.startsWith('.')).toBe(false)
    }
  })

  it('falls back rather than returning an empty string', () => {
    // An empty slug would produce the file `.md`, which is hidden and would be
    // skipped by the walker that has to read it back.
    expect(slugify('!!!')).toBe('item')
    expect(slugify('日本語')).toBe('item')
    expect(slugify('')).toBe('item')
  })

  it('bounds the length without leaving a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(78)} tail`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  it('returns the plain slug when nothing claims it', () => {
    expect(uniqueSlug('Docker networking', () => false)).toBe(
      'docker-networking',
    )
  })

  it('appends -2, -3 on collision (§3.2)', () => {
    const taken = new Set(['docker-networking', 'docker-networking-2'])
    expect(uniqueSlug('Docker networking', (c) => taken.has(c))).toBe(
      'docker-networking-3',
    )
  })
})

describe('newItemPath', () => {
  it('files an item under its type directory', () => {
    expect(newItemPath('note', 'docker-networking')).toBe(
      'notes/docker-networking.md',
    )
    expect(newItemPath('url', 'react-docs')).toBe('links/react-docs.md')
  })

  it('names a binary item for its asset, not its slug (§3.5)', () => {
    // The sidecar has to sit beside the file it describes.
    expect(newItemPath('image', 'architecture-diagram', 'diagram.png')).toBe(
      'images/diagram.png.md',
    )
  })
})

describe('renamedItemPath', () => {
  const free = () => false

  it('returns the new path when the title changed', () => {
    expect(
      renamedItemPath(
        note({ title: 'Docker DNS' }),
        'notes/docker-networking.md',
        free,
      ),
    ).toBe('notes/docker-dns.md')
  })

  it('returns null when the basename would not change', () => {
    // Editing a description must not produce a rename.
    expect(
      renamedItemPath(note(), 'notes/docker-networking.md', free),
    ).toBeNull()
  })

  it('keeps the item in whatever directory the user filed it under', () => {
    // `snippets/react/…` is the user's own filing, not a collection. Yanking
    // the file back to the top level on a title edit would move it without
    // being asked.
    expect(
      renamedItemPath(
        note({ type: 'snippet', title: 'Use throttle', language: 'ts' }),
        'snippets/react/use-debounce.md',
        free,
      ),
    ).toBe('snippets/react/use-throttle.md')
  })

  it('never renames a binary item', () => {
    // Its path tracks the asset filename, not the title.
    const image = note({
      type: 'image',
      title: 'A new title',
      fileName: 'diagram.png',
    })
    expect(renamedItemPath(image, 'images/diagram.png.md', free)).toBeNull()
  })

  it('avoids colliding with an existing file', () => {
    const taken = new Set(['notes/docker-dns.md'])
    expect(
      renamedItemPath(
        note({ title: 'Docker DNS' }),
        'notes/docker-networking.md',
        (candidate) => taken.has(candidate),
      ),
    ).toBe('notes/docker-dns-2.md')
  })

  it('does not treat the item\u2019s own file as a collision', () => {
    // The file being renamed is in the index of paths in use; if that counted,
    // every rename would gratuitously become `-2`.
    expect(
      renamedItemPath(
        note({ title: 'Docker networking' }),
        'notes/docker-networking.md',
        (candidate) => candidate === 'notes/docker-networking.md',
      ),
    ).toBeNull()
  })
})

describe('writeItem', () => {
  it('writes a file the schema reads back as the same item', async () => {
    // The end-to-end property verification item 1 asks for: what the writer
    // emits, the reader accepts.
    const root = await makeVault()
    const item = note()

    await writeItem(root, item, 'notes/docker-networking.md')

    const raw = await fs.readFile(
      path.join(root, 'notes/docker-networking.md'),
      'utf8',
    )
    const { data, body } = parseFrontmatter(raw)
    const parsed = itemFrontmatterSchema.parse(data)

    expect(toItem(parsed, body)).toEqual(item)
  })

  it('creates the type directory when it does not exist yet', async () => {
    const root = await makeVault()
    await writeItem(root, note(), 'notes/nested/deep/thing.md')

    expect(await vaultFileExists(root, 'notes/nested/deep/thing.md')).toBe(true)
  })

  it('serializes identically for an identical item', () => {
    // The comparison `updateItem` relies on to avoid a no-op write.
    expect(serializeItem(note())).toBe(serializeItem(note()))
  })
})

describe('writeCollection', () => {
  it('defaults to the id-derived path and writes the description as the body', async () => {
    const root = await makeVault()

    const written = await writeCollection(root, {
      id: 'react-patterns',
      name: 'React Patterns',
      description: 'Hooks and component patterns.',
      updatedAt: '2026-08-01T12:00:00Z',
    })

    expect(written).toBe('collections/react-patterns.md')

    const raw = await fs.readFile(path.join(root, written), 'utf8')
    // `updatedAt` is derived from members on read (§3.4) and must not be
    // stored, or every item save would rewrite its collections' files.
    expect(raw).not.toContain('updatedAt')
    expect(raw).toContain('Hooks and component patterns.')
  })
})

describe('moveFile', () => {
  it('moves a file and creates the destination directory', async () => {
    const root = await makeVault()
    await writeItem(root, note(), 'notes/docker-networking.md')

    await moveFile(root, 'notes/docker-networking.md', 'notes/dns/docker.md')

    expect(await vaultFileExists(root, 'notes/docker-networking.md')).toBe(false)
    expect(await vaultFileExists(root, 'notes/dns/docker.md')).toBe(true)
  })
})

describe('deleteFiles', () => {
  it('removes files and tolerates one that is already gone', async () => {
    const root = await makeVault()
    await writeItem(root, note(), 'notes/docker-networking.md')

    await deleteFiles(root, ['notes/docker-networking.md', 'notes/absent.md'])

    expect(await vaultFileExists(root, 'notes/docker-networking.md')).toBe(false)
  })
})
