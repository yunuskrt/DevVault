import { describe, expect, it } from 'vitest'

import {
  toDashboardCollection,
  toDashboardItem,
} from '@/lib/dashboard-mappers'
import type { Collection, Item } from '@/types/vault'

/*
 * These mappers take every lookup they need as an argument, which is what let
 * them stay synchronous when the vault moved to disk. That is also what makes
 * them testable without a vault at all — no temp directory, no environment.
 */

const NOW = Date.parse('2026-08-07T12:00:00Z')

const base = {
  collectionIds: [],
  tags: [],
  favorite: false,
  pinned: false,
  createdAt: '2026-08-01T12:00:00Z',
  updatedAt: '2026-08-05T12:00:00Z',
}

const collectionsById = new Map<string, Collection>([
  ['react-patterns', { id: 'react-patterns', name: 'React Patterns', updatedAt: base.updatedAt }],
  ['ai-prompts', { id: 'ai-prompts', name: 'AI Prompts', updatedAt: base.updatedAt }],
])

describe('toDashboardItem', () => {
  it('resolves each collection id to its name, in the order the item lists them', () => {
    const item: Item = {
      ...base,
      id: 'x',
      title: 'X',
      type: 'note',
      content: 'body',
      collectionIds: ['ai-prompts', 'react-patterns'],
    }

    expect(toDashboardItem(item, NOW, collectionsById).collectionNames).toEqual([
      'AI Prompts',
      'React Patterns',
    ])
  })

  /*
   * A dangling id is reachable in a Git-native vault: deleting a collection
   * file leaves every member item still naming it. Dropping the name is what
   * keeps the card rendering instead of showing "undefined".
   */
  it('drops ids with no collection rather than emitting a hole', () => {
    const item: Item = {
      ...base,
      id: 'x',
      title: 'X',
      type: 'note',
      content: 'body',
      collectionIds: ['react-patterns', 'deleted-collection'],
    }

    expect(toDashboardItem(item, NOW, collectionsById).collectionNames).toEqual([
      'React Patterns',
    ])
  })

  it('formats updatedAt against the clock it is handed', () => {
    const item: Item = { ...base, id: 'x', title: 'X', type: 'note', content: 'b' }

    expect(toDashboardItem(item, NOW, collectionsById).updatedLabel).toBe('2d ago')
  })

  /*
   * `copyText` is what the card's copy button writes. Each type stores its
   * payload in a different field, so a regression here is silent — the button
   * copies the wrong thing rather than failing.
   */
  describe('copyText', () => {
    const item = (over: Partial<Item> & Pick<Item, 'type'>): Item =>
      ({ ...base, id: 'x', title: 'Title', ...over }) as Item

    it.each([
      ['snippet', item({ type: 'snippet', content: 'const a = 1', language: 'ts' }), 'const a = 1'],
      ['command', item({ type: 'command', content: 'docker ps', language: 'bash' }), 'docker ps'],
      ['prompt', item({ type: 'prompt', content: 'Review this' }), 'Review this'],
      ['note', item({ type: 'note', content: 'Some prose' }), 'Some prose'],
      ['url', item({ type: 'url', url: 'https://example.com' }), 'https://example.com'],
      ['image', item({ type: 'image', fileName: 'diagram.png' }), 'diagram.png'],
      ['file with content', item({ type: 'file', fileName: 'c.json', content: '{}' }), '{}'],
      ['file without content', item({ type: 'file', fileName: 'c.json' }), 'c.json'],
    ])('resolves a %s to its own payload', (_label, value, expected) => {
      expect(toDashboardItem(value, NOW, collectionsById).copyText).toBe(expected)
    })

    it('never falls back to the title', () => {
      // The title fallback was removed deliberately: it was unreachable for six
      // of seven types and only ever masked a missing payload.
      const value = item({ type: 'note', content: '' })
      expect(toDashboardItem(value, NOW, collectionsById).copyText).toBe('')
    })
  })
})

describe('toDashboardCollection', () => {
  const collection: Collection = {
    id: 'c',
    name: 'C',
    updatedAt: '2026-08-05T12:00:00Z',
  }

  const typed = (id: string, type: Item['type']): Item =>
    ({ ...base, id, title: id, type, content: 'x', language: 'ts', url: 'u', fileName: 'f' }) as Item

  it('counts its members and reports their dominant type', () => {
    const result = toDashboardCollection(collection, NOW, [
      typed('a', 'snippet'),
      typed('b', 'snippet'),
      typed('c', 'note'),
    ])

    expect(result.count).toBe(3)
    expect(result.dominantTypes).toEqual(['snippet'])
  })

  /*
   * The empty case is the one that renders the muted dot and no footer icons —
   * `Resources & Links` in the seeded vault.
   */
  it('reports no dominant type for a collection with no members', () => {
    const result = toDashboardCollection(collection, NOW, [])

    expect(result.count).toBe(0)
    expect(result.dominantTypes).toEqual([])
  })

  it('returns every tied type in priority order', () => {
    const result = toDashboardCollection(collection, NOW, [
      typed('a', 'note'),
      typed('b', 'image'),
      typed('c', 'file'),
    ])

    // TYPE_PRIORITY is snippet, prompt, command, note, file, image, url.
    expect(result.dominantTypes).toEqual(['note', 'file', 'image'])
  })
})
