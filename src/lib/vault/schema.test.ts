import { describe, expect, it } from 'vitest'

import { serializeFrontmatter } from '@/lib/markdown/frontmatter'
import {
  collectionFrontmatterSchema,
  describeValidationError,
  itemBody,
  itemFrontmatterSchema,
  toCollection,
  toCollectionFrontmatter,
  toItem,
  toItemFrontmatter,
} from '@/lib/vault/schema'
import type { Item } from '@/types/vault'

/** The keys every item carries, so each case below states only its own. */
const BASE = {
  id: 'use-debounce-hook',
  title: 'useDebounce hook',
  createdAt: '2026-05-14T09:20:00Z',
  updatedAt: '2026-08-01T16:05:00Z',
}

const parse = (frontmatter: Record<string, unknown>) =>
  itemFrontmatterSchema.safeParse(frontmatter)

const message = (frontmatter: Record<string, unknown>): string => {
  const result = parse(frontmatter)
  if (result.success) throw new Error('expected the frontmatter to be rejected')
  return describeValidationError(result.error)
}

describe('itemFrontmatterSchema', () => {
  it('defaults the keys a legible file is allowed to omit', () => {
    const result = parse({ ...BASE, type: 'note' })

    // Empty lists and false flags are not written to disk, so read has to put
    // them back or every item would need `tags: []` spelled out.
    expect(result.success && result.data).toMatchObject({
      collections: [],
      tags: [],
      favorite: false,
      pinned: false,
    })
  })

  it('requires each type to carry its own payload', () => {
    expect(parse({ ...BASE, type: 'snippet' }).success).toBe(false)
    expect(parse({ ...BASE, type: 'snippet', language: 'ts' }).success).toBe(true)

    expect(parse({ ...BASE, type: 'url' }).success).toBe(false)
    expect(parse({ ...BASE, type: 'url', url: 'https://x.dev' }).success).toBe(true)

    expect(parse({ ...BASE, type: 'image' }).success).toBe(false)
    expect(parse({ ...BASE, type: 'image', fileName: 'a.png' }).success).toBe(true)

    // A file's language is optional; a binary one has none.
    expect(parse({ ...BASE, type: 'file', fileName: 'a.pdf' }).success).toBe(true)
  })

  it('rejects a url that is not a url and a timestamp that is not ISO', () => {
    expect(parse({ ...BASE, type: 'url', url: 'not-a-url' }).success).toBe(false)
    expect(parse({ ...BASE, type: 'note', updatedAt: 'yesterday' }).success).toBe(
      false,
    )
  })

  it('rejects blank strings where a value is required', () => {
    expect(parse({ ...BASE, id: '', type: 'note' }).success).toBe(false)
    expect(parse({ ...BASE, title: '', type: 'note' }).success).toBe(false)
  })
})

describe('describeValidationError', () => {
  it('names the missing field rather than dumping the issue list', () => {
    expect(message({ ...BASE, type: 'snippet' })).toBe('`language` is missing')
  })

  it('names the discriminator when it is absent or unknown', () => {
    // Both cases have to point a reader at `type:` — a discriminated union
    // rejects the whole object and says nothing about the other fields.
    expect(message({ ...BASE })).toContain('`type`')
    expect(message({ ...BASE, type: 'thought' })).toContain('`type`')
  })

  it('joins several problems and reports each once', () => {
    const result = message({ type: 'note', createdAt: BASE.createdAt })

    expect(result).toContain('`id` is missing')
    expect(result).toContain('`title` is missing')
    expect(result).toContain('`updatedAt` is missing')
    expect(result.match(/is missing/g)).toHaveLength(3)
  })

  it('never leaks a Zod internal into the message', () => {
    const result = message({ ...BASE, type: 'url', url: 'not-a-url' })

    expect(result).toContain('`url`')
    expect(result).not.toContain('ZodError')
    expect(result).not.toContain('code')
  })
})

describe('collectionFrontmatterSchema', () => {
  it('takes an id and a name and nothing else', () => {
    expect(
      collectionFrontmatterSchema.safeParse({ id: 'a', name: 'A' }).success,
    ).toBe(true)
    expect(collectionFrontmatterSchema.safeParse({ id: 'a' }).success).toBe(false)
  })

  it('does not accept a stored updatedAt', () => {
    // §3.4 derives it from the members; a stored copy could disagree.
    const parsed = collectionFrontmatterSchema.parse({
      id: 'a',
      name: 'A',
      updatedAt: '2026-08-01T16:05:00Z',
    })

    expect(parsed).toEqual({ id: 'a', name: 'A' })
  })
})

describe('toItem', () => {
  const frontmatter = (extra: Record<string, unknown>) => {
    const result = parse({ ...BASE, ...extra })
    if (!result.success) throw new Error('fixture is not valid frontmatter')
    return result.data
  }

  it('renames the on-disk `collections` key to `collectionIds`', () => {
    const item = toItem(
      frontmatter({ type: 'note', collections: ['context-files'] }),
      'Body',
    )

    expect(item.collectionIds).toEqual(['context-files'])
    expect(item).not.toHaveProperty('collections')
  })

  it('attaches the body as content for text-bearing types', () => {
    for (const type of ['snippet', 'command'] as const) {
      const item = toItem(frontmatter({ type, language: 'ts' }), 'const x = 1')
      expect(item).toMatchObject({ type, content: 'const x = 1' })
    }

    for (const type of ['prompt', 'note'] as const) {
      expect(toItem(frontmatter({ type }), 'Prose')).toMatchObject({
        type,
        content: 'Prose',
      })
    }
  })

  it('leaves url and image items without content', () => {
    // A sidecar's body is not the asset, so it must not become the payload.
    expect(
      toItem(frontmatter({ type: 'url', url: 'https://x.dev' }), 'ignored'),
    ).not.toHaveProperty('content')
    expect(
      toItem(frontmatter({ type: 'image', fileName: 'a.png' }), 'ignored'),
    ).not.toHaveProperty('content')
  })

  it('gives a file content only when it has a body', () => {
    const fm = frontmatter({ type: 'file', fileName: 'a.md' })

    expect(toItem(fm, 'text')).toMatchObject({ content: 'text' })
    expect(toItem(fm, '')).not.toHaveProperty('content')
  })
})

describe('toCollection', () => {
  it('takes the body as the description and the derived updatedAt', () => {
    expect(
      toCollection({ id: 'a', name: 'A' }, 'What it holds', '2026-08-01T16:05:00Z'),
    ).toEqual({
      id: 'a',
      name: 'A',
      description: 'What it holds',
      updatedAt: '2026-08-01T16:05:00Z',
    })
  })

  it('omits the description when the file has no body', () => {
    expect(
      toCollection({ id: 'a', name: 'A' }, '', '2026-08-01T16:05:00Z'),
    ).not.toHaveProperty('description')
  })
})

describe('toItemFrontmatter', () => {
  const item: Item = {
    id: 'use-debounce-hook',
    title: 'useDebounce hook',
    type: 'snippet',
    description: 'Delays a rapidly changing value until it settles.',
    collectionIds: ['react-patterns'],
    tags: ['react', 'hooks'],
    language: 'typescript',
    content: 'const x = 1',
    favorite: true,
    pinned: true,
    createdAt: BASE.createdAt,
    updatedAt: BASE.updatedAt,
  }

  it('writes the canonical key order', () => {
    // Stable order is what keeps a one-field edit from rewriting the block, so
    // it is asserted as the bytes that reach disk rather than as object keys.
    expect(serializeFrontmatter(toItemFrontmatter(item), '')).toBe(
      `---
id: use-debounce-hook
title: useDebounce hook
type: snippet
description: Delays a rapidly changing value until it settles.
collections: [react-patterns]
tags: [react, hooks]
language: typescript
favorite: true
pinned: true
createdAt: ${BASE.createdAt}
updatedAt: ${BASE.updatedAt}
---
`,
    )
  })

  it('omits absent optionals, empty lists and false flags', () => {
    const bare: Item = {
      ...item,
      description: undefined,
      collectionIds: [],
      tags: [],
      favorite: false,
      pinned: false,
    }

    expect(serializeFrontmatter(toItemFrontmatter(bare), '')).toBe(
      `---
id: use-debounce-hook
title: useDebounce hook
type: snippet
language: typescript
createdAt: ${BASE.createdAt}
updatedAt: ${BASE.updatedAt}
---
`,
    )
  })

  it('writes the payload each type actually has', () => {
    const url = toItemFrontmatter({
      ...item,
      type: 'url',
      url: 'https://x.dev',
    } as Item)
    expect(url).toMatchObject({ url: 'https://x.dev' })
    expect(url.fileName).toBeUndefined()

    const image = toItemFrontmatter({
      ...item,
      type: 'image',
      fileName: 'a.png',
    } as Item)
    expect(image).toMatchObject({ fileName: 'a.png' })
    expect(image.url).toBeUndefined()
  })

  it('never writes the content, which is the body', () => {
    expect(toItemFrontmatter(item).content).toBeUndefined()
  })

  it('re-reads as the item it was written from', () => {
    const written = toItemFrontmatter(item)
    const reparsed = itemFrontmatterSchema.safeParse(
      JSON.parse(JSON.stringify(written)),
    )

    expect(reparsed.success).toBe(true)
    if (reparsed.success) {
      expect(toItem(reparsed.data, itemBody(item))).toEqual(item)
    }
  })
})

describe('toCollectionFrontmatter', () => {
  it('writes id and name only, leaving updatedAt derived', () => {
    expect(
      toCollectionFrontmatter({
        id: 'react-patterns',
        name: 'React Patterns',
        description: 'Hooks and components',
        updatedAt: BASE.updatedAt,
      }),
    ).toEqual({ id: 'react-patterns', name: 'React Patterns' })
  })
})

describe('itemBody', () => {
  it('is the content for a text item and empty for a binary one', () => {
    expect(
      itemBody({
        ...BASE,
        type: 'note',
        content: 'Prose',
        collectionIds: [],
        tags: [],
        favorite: false,
        pinned: false,
      }),
    ).toBe('Prose')

    expect(
      itemBody({
        ...BASE,
        type: 'image',
        fileName: 'a.png',
        collectionIds: [],
        tags: [],
        favorite: false,
        pinned: false,
      }),
    ).toBe('')
  })
})
