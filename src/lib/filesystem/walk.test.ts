import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { isMarkdown, walkVault } from '@/lib/filesystem/walk'

/**
 * The seeded vault the reader test walks has no `.git/`, no nested type
 * directory and no dotfiles at depth, so none of the skip rules are exercised
 * there. This builds a tree that has all of them.
 */
const TREE: Record<string, string> = {
  'snippets/use-debounce-hook.md': 'a',
  'snippets/react/use-previous.md': 'b',
  'snippets/react/deep/still-a-snippet.md': 'c',
  'notes/docker.md': 'd',
  'images/diagram.png': 'e',
  'images/diagram.png.md': 'f',
  'README.md': 'g',
  '.gitignore': 'skip',
  '.git/objects/abc': 'skip',
  '.devvault/config.json': 'skip',
  '.devvault/cache/index.json': 'skip',
  'notes/.draft.md': 'skip',
  'node_modules/pkg/index.js': 'skip',
}

describe('walkVault', () => {
  let root: string
  let walked: string[]

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-walk-'))

    for (const [relative, contents] of Object.entries(TREE)) {
      const full = path.join(root, relative)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, contents, 'utf8')
    }

    walked = await walkVault(root)
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('returns every visible file as a sorted vault-relative path', () => {
    expect(walked).toEqual([
      'README.md',
      'images/diagram.png',
      'images/diagram.png.md',
      'notes/docker.md',
      'snippets/react/deep/still-a-snippet.md',
      'snippets/react/use-previous.md',
      'snippets/use-debounce-hook.md',
    ])
  })

  it('skips Git storage, derived state, dotfiles and node_modules', () => {
    const skipped = Object.entries(TREE)
      .filter(([, contents]) => contents === 'skip')
      .map(([relative]) => relative)

    for (const relative of skipped) {
      expect(walked, `${relative} should not have been walked`).not.toContain(
        relative,
      )
    }
  })

  it('flattens nested type directories rather than treating them as folders', () => {
    // `snippets/react/…` is the user's own filing, not a collection — the walk
    // returns the file at whatever depth it sits, and `typeForPath` reads only
    // the first segment.
    expect(walked).toContain('snippets/react/deep/still-a-snippet.md')
  })

  it('walks an empty directory without failing', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-empty-'))
    await expect(walkVault(empty)).resolves.toEqual([])
    await fs.rm(empty, { recursive: true, force: true })
  })
})

describe('isMarkdown', () => {
  it('accepts .md in any case', () => {
    expect(isMarkdown('notes/a.md')).toBe(true)
    expect(isMarkdown('notes/A.MD')).toBe(true)
  })

  it('rejects an asset and an extensionless file', () => {
    // The sidecar is Markdown; the asset beside it is not, which is what keeps
    // the reader from trying to parse a PNG as frontmatter.
    expect(isMarkdown('images/diagram.png')).toBe(false)
    expect(isMarkdown('images/diagram.png.md')).toBe(true)
    expect(isMarkdown('LICENSE')).toBe(false)
  })
})
