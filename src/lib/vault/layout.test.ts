import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import nodePath from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { ITEM_TYPE_IDS } from '@/lib/item-types'
import {
  COLLECTIONS_DIR,
  TYPE_DIRECTORIES,
  collectionFilePath,
  isVaultManagedPath,
  itemFilePath,
  vaultGitignore,
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

describe('isVaultManagedPath', () => {
  /*
   * This predicate is what stands in for `git add -A` (§5.4). The vault
   * repository belongs to the *user* and may hold anything else they keep in
   * it; sweeping those into a commit DevVault labelled would misrepresent what
   * happened, so the sidebar's Commit button stages only what this claims.
   */

  it('claims every item type directory', () => {
    for (const type of ITEM_TYPE_IDS) {
      expect(isVaultManagedPath(itemFilePath(type, 'thing', 'asset.bin'))).toBe(
        true,
      )
    }
  })

  it('claims collection files and nested item files', () => {
    expect(isVaultManagedPath(collectionFilePath('react-patterns'))).toBe(true)
    // `snippets/react/…` is the user's own filing, still a snippet.
    expect(isVaultManagedPath('snippets/react/use-debounce.md')).toBe(true)
  })

  it("claims DevVault's own files", () => {
    expect(isVaultManagedPath('.devvault/config.json')).toBe(true)
    expect(isVaultManagedPath('.gitignore')).toBe(true)
  })

  it('disclaims anything else the user keeps in the repository', () => {
    for (const path of [
      'scratch.txt',
      'README.md',
      'vendor/thing.md',
      'src/index.ts',
      '.env',
      '.devvault/cache/index.json',
      'notes.md',
    ]) {
      expect(isVaultManagedPath(path)).toBe(false)
    }
  })

  it('does not claim a directory merely because its name resembles one', () => {
    // `topLevelDirectory` compares whole segments, so a near-miss is not a hit.
    expect(isVaultManagedPath('notes-backup/a.md')).toBe(false)
    expect(isVaultManagedPath('my-snippets/a.md')).toBe(false)
  })
})

describe('vaultGitignore', () => {
  /*
   * Asserted against `git check-ignore` rather than by reading the text,
   * because Git's allow-list semantics are the thing being relied on and they
   * are easy to get subtly wrong. The trap this caught during development:
   * `/*` excludes `.devvault` as a *directory*, and Git cannot re-include a
   * file whose parent is excluded — so `!/.devvault/config.json` silently does
   * nothing and the config file would have stopped being tracked.
   */

  const dirs: string[] = []

  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  })

  const ignoredIn = (paths: string[]): Record<string, boolean> => {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'devvault-ignore-'))
    dirs.push(root)

    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
    fs.writeFileSync(nodePath.join(root, '.gitignore'), vaultGitignore())

    return Object.fromEntries(
      paths.map((path) => {
        try {
          execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: root })
          return [path, true]
        } catch {
          return [path, false]
        }
      }),
    )
  }

  it("tracks DevVault's own content and ignores everything else", () => {
    const result = ignoredIn([
      // Trackable.
      '.gitignore',
      '.devvault/config.json',
      'notes/docker.md',
      'snippets/use-debounce.md',
      'snippets/react/nested.md',
      'collections/react-patterns.md',
      'images/diagram.png',
      'links/react-docs.md',
      // Not.
      '.DS_Store',
      'scratch.txt',
      'README.md',
      'vendor/thing.md',
      '.devvault/cache/index.json',
    ])

    expect(result).toEqual({
      '.gitignore': false,
      '.devvault/config.json': false,
      'notes/docker.md': false,
      'snippets/use-debounce.md': false,
      'snippets/react/nested.md': false,
      'collections/react-patterns.md': false,
      'images/diagram.png': false,
      'links/react-docs.md': false,
      '.DS_Store': true,
      'scratch.txt': true,
      'README.md': true,
      'vendor/thing.md': true,
      '.devvault/cache/index.json': true,
    })
  })

  it('ignores OS and editor noise inside the tracked directories too', () => {
    // The root allow-list cannot reach these: `notes/` is re-included
    // wholesale, so without the unanchored patterns a `notes/.DS_Store` would
    // be tracked — which is the bug that started this, one level down.
    const result = ignoredIn([
      'notes/.DS_Store',
      'images/.DS_Store',
      'notes/draft.md.swp',
      'snippets/a.md~',
    ])

    expect(Object.values(result).every(Boolean)).toBe(true)
  })

  it('allows every directory isVaultManagedPath claims', () => {
    /*
     * The invariant that makes generating this file worthwhile. A new entry in
     * `TYPE_DIRECTORIES` that the allow-list did not know about would produce
     * items that save correctly, appear in the app, and silently never commit.
     */
    const managed = [
      '.gitignore',
      '.devvault/config.json',
      collectionFilePath('some-collection'),
      ...ITEM_TYPE_IDS.map((type) => itemFilePath(type, 'thing', 'asset.bin')),
    ]

    expect(managed.every(isVaultManagedPath)).toBe(true)

    const result = ignoredIn(managed)
    expect(Object.entries(result).filter(([, ignored]) => ignored)).toEqual([])
  })
})
