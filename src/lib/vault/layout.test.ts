import { describe, expect, it } from 'vitest'

import { ITEM_TYPE_IDS } from '@/lib/item-types'
import {
  COLLECTIONS_DIR,
  TYPE_DIRECTORIES,
  collectionFilePath,
  itemFilePath,
  topLevelDirectory,
  typeForPath,
} from '@/lib/vault/layout'

describe('TYPE_DIRECTORIES', () => {
  it('names a directory for every declared item type', () => {
    // Drift guard: a new item type must be given a home here, or its files land
    // in a directory the reader does not recognise as an item directory at all.
    for (const type of ITEM_TYPE_IDS) {
      expect(TYPE_DIRECTORIES[type], `${type} has no directory`).toBeTruthy()
    }
  })

  it('maps each type to a distinct directory', () => {
    const dirs = Object.values(TYPE_DIRECTORIES)
    expect(new Set(dirs).size).toBe(dirs.length)
  })

  it('files url items under links/, the one name that is not a plural', () => {
    expect(TYPE_DIRECTORIES.url).toBe('links')
  })

  it('keeps collections out of the item directories', () => {
    expect(Object.values(TYPE_DIRECTORIES)).not.toContain(COLLECTIONS_DIR)
  })
})

describe('topLevelDirectory', () => {
  it('returns the first segment, or empty for a root-level file', () => {
    expect(topLevelDirectory('snippets/react/use-previous.md')).toBe('snippets')
    expect(topLevelDirectory('snippets/a.md')).toBe('snippets')
    expect(topLevelDirectory('README.md')).toBe('')
  })
})

describe('typeForPath', () => {
  it('reads the type off the first segment', () => {
    expect(typeForPath('snippets/use-debounce-hook.md')).toBe('snippet')
    expect(typeForPath('links/tailwind.md')).toBe('url')
  })

  it('ignores nesting below the type directory', () => {
    // `snippets/react/` is the user's own filing, not a collection.
    expect(typeForPath('snippets/react/deep/use-previous.md')).toBe('snippet')
  })

  it('returns undefined for collections and for loose files', () => {
    expect(typeForPath('collections/react-patterns.md')).toBeUndefined()
    expect(typeForPath('README.md')).toBeUndefined()
    expect(typeForPath('docs/notes.md')).toBeUndefined()
  })
})

describe('itemFilePath', () => {
  it('names a text item after its id', () => {
    expect(itemFilePath('snippet', 'use-debounce-hook')).toBe(
      'snippets/use-debounce-hook.md',
    )
  })

  it('names a binary item after its asset, as a sidecar', () => {
    expect(
      itemFilePath('image', 'architecture-diagram', 'architecture-diagram.png'),
    ).toBe('images/architecture-diagram.png.md')
    expect(itemFilePath('file', 'env-example', '.env.example')).toBe(
      'files/.env.example.md',
    )
  })

  it('falls back to the id when a binary item has no filename yet', () => {
    expect(itemFilePath('file', 'draft')).toBe('files/draft.md')
  })

  it('ignores a filename on a type that does not store an asset', () => {
    expect(itemFilePath('snippet', 'use-debounce-hook', 'hook.ts')).toBe(
      'snippets/use-debounce-hook.md',
    )
  })

  it('round-trips through typeForPath for every type', () => {
    // The invariant the reader enforces: a file's directory is derived from its
    // type, so reading the directory back must return the type it was written
    // from. A disagreement is a vault error, never a silent move.
    for (const type of ITEM_TYPE_IDS) {
      expect(typeForPath(itemFilePath(type, 'some-id', 'asset.bin'))).toBe(type)
    }
  })
})

describe('collectionFilePath', () => {
  it('puts one file per collection under collections/', () => {
    expect(collectionFilePath('react-patterns')).toBe(
      'collections/react-patterns.md',
    )
    expect(topLevelDirectory(collectionFilePath('x'))).toBe(COLLECTIONS_DIR)
  })
})
