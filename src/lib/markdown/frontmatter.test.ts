import { describe, expect, it } from 'vitest'

import {
  parseFrontmatter,
  serializeFrontmatter,
} from '@/lib/markdown/frontmatter'

describe('parseFrontmatter', () => {
  it('splits the block from the body', () => {
    const { data, body } = parseFrontmatter(
      '---\nid: a\ntitle: A\n---\n\nBody text\n',
    )

    expect(data).toEqual({ id: 'a', title: 'A' })
    expect(body).toBe('Body text')
  })

  it('treats a file with no block as all body', () => {
    const raw = '# Just Markdown\n\nNo frontmatter here.\n'
    expect(parseFrontmatter(raw)).toEqual({ data: {}, body: raw })
  })

  it('does not mistake a horizontal rule for an opening delimiter', () => {
    const raw = 'Intro\n\n---\n\nAfter the rule\n'
    expect(parseFrontmatter(raw).data).toEqual({})
  })

  it('keeps a `---` rule that appears inside the body', () => {
    const { body } = parseFrontmatter('---\nid: a\n---\n\nOne\n\n---\n\nTwo\n')
    expect(body).toBe('One\n\n---\n\nTwo')
  })

  it('handles an empty block', () => {
    expect(parseFrontmatter('---\n---\n\nBody\n')).toEqual({
      data: {},
      body: 'Body',
    })
  })

  it('returns an empty body when there is nothing after the block', () => {
    expect(parseFrontmatter('---\nid: a\n---\n').body).toBe('')
  })

  it('throws on malformed YAML so the reader can report the file', () => {
    expect(() => parseFrontmatter('---\nid: [unclosed\n---\n\nBody\n')).toThrow()
  })
})

describe('serializeFrontmatter', () => {
  it('emits short lists inline', () => {
    const out = serializeFrontmatter({ tags: ['react', 'hooks'] }, '')
    expect(out).toBe('---\ntags: [react, hooks]\n---\n')
  })

  it('drops undefined values rather than writing null', () => {
    const out = serializeFrontmatter({ id: 'a', description: undefined }, '')
    expect(out).toBe('---\nid: a\n---\n')
  })

  it('preserves the key order it is given', () => {
    const out = serializeFrontmatter({ z: 1, a: 2, m: 3 }, '')
    expect(out).toBe('---\nz: 1\na: 2\nm: 3\n---\n')
  })

  it('does not fold long values', () => {
    const long = 'x'.repeat(200)
    const out = serializeFrontmatter({ description: long }, '')
    expect(out).toBe(`---\ndescription: ${long}\n---\n`)
  })

  it('ends with exactly one newline', () => {
    const out = serializeFrontmatter({ id: 'a' }, 'Body\n\n\n')
    expect(out).toBe('---\nid: a\n---\n\nBody\n')
  })
})

describe('round trip', () => {
  /**
   * The property the whole module exists for: an unchanged item must
   * re-serialize byte for byte, or every save produces a phantom diff and the
   * readable-history value of a Git-backed vault evaporates. The reader test
   * asserts the same thing over every seeded file.
   */
  const cases: Record<string, string> = {
    'full item': `---
id: use-debounce-hook
title: useDebounce hook
type: snippet
description: Delays a rapidly changing value until it settles.
collections: [react-patterns]
tags: [react, hooks, typescript]
language: typescript
favorite: true
pinned: true
createdAt: 2026-05-14T09:20:00Z
updatedAt: 2026-08-01T16:05:00Z
---

const x = 1
`,
    'no body': `---
id: resources-links
name: Resources & Links
---
`,
    'body with blank lines and a rule': `---
id: a
---

One

---

Two
`,
    'body with trailing code fence': `---
id: a
---

\`\`\`ts
const x = 1
\`\`\`
`,
  }

  for (const [name, raw] of Object.entries(cases)) {
    it(`is byte-identical for ${name}`, () => {
      const { data, body } = parseFrontmatter(raw)
      expect(serializeFrontmatter(data as Record<string, unknown>, body)).toBe(raw)
    })
  }
})
