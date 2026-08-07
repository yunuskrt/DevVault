import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VaultError } from '@/lib/errors'
import { GitError } from '@/lib/git/errors'
import { resetGitCaches } from '@/lib/git/simple-git-service'
import {
  cancelPendingAutoCommits,
  commitAll,
  createCollection,
  createItem,
  deleteCollection,
  deleteItem,
  setItemFlag,
  updateCollection,
  updateItem,
} from '@/lib/vault/mutations'
import { readVault } from '@/lib/vault/reader'
import type { NewItemInput } from '@/lib/vault/mutations'

/*
 * The mutation layer against a real vault in a real repository.
 *
 * `DEVVAULT_PATH` is set per test rather than mocked, because `openVault`
 * resolving the root from the environment is part of what is under test — a
 * mock would let a regression in `resolveVaultPath` pass unnoticed.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeVault = async (options: { repo?: boolean } = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-mutate-'))
  temporaryDirs.push(root)

  if (options.repo !== false) {
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
  }

  process.env.DEVVAULT_PATH = root
  return root
}

const commitEverything = (root: string, message = 'baseline'): void => {
  git(root, 'add', '-A')
  git(root, 'commit', '-m', message)
}

/**
 * Commit subjects, newest first. `git log` *exits non-zero* on a repository
 * with no commits, so asserting "nothing has been committed yet" has to go
 * through this rather than through a bare `git log`.
 */
const subjects = (root: string): string[] => {
  try {
    return git(root, 'log', '--format=%s').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const note = (title: string): NewItemInput => ({
  type: 'note',
  title,
  content: 'Bridge networks are the default.',
  tags: ['docker'],
})

const originalVaultPath = process.env.DEVVAULT_PATH

beforeEach(() => {
  resetGitCaches()
})

afterEach(async () => {
  cancelPendingAutoCommits()
  process.env.DEVVAULT_PATH = originalVaultPath

  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('createItem', () => {
  it('writes each of the seven types where readVault finds it again', async () => {
    // Verification item 1. The round-trip is the property that matters: what
    // the writer emits, the reader accepts, with nothing lost in between.
    const root = await makeVault()

    const inputs: NewItemInput[] = [
      { type: 'snippet', title: 'Use debounce', content: 'const x = 1', language: 'ts' },
      { type: 'command', title: 'Prune docker', content: 'docker system prune', language: 'bash' },
      { type: 'prompt', title: 'Code review', content: 'Review this diff.' },
      { type: 'note', title: 'Docker networking', content: 'Bridge networks.' },
      { type: 'url', title: 'React docs', url: 'https://react.dev' },
      { type: 'image', title: 'Architecture', fileName: 'diagram.png' },
      { type: 'file', title: 'Config', fileName: 'tsconfig.json' },
    ]

    const created = []
    for (const input of inputs) created.push(await createItem(input))

    const vault = await readVault(root)

    expect(vault.errors).toEqual([])
    expect(vault.items).toHaveLength(7)

    for (const { data } of created) {
      expect(vault.items.find((item) => item.id === data.id)).toEqual(data)
    }

    // Each type lands in its own directory, `url` in `links/` (§3.1).
    expect([...vault.itemPaths.values()].sort()).toEqual([
      'commands/prune-docker.md',
      'files/tsconfig.json.md',
      'images/diagram.png.md',
      'links/react-docs.md',
      'notes/docker-networking.md',
      'prompts/code-review.md',
      'snippets/use-debounce.md',
    ])
  })

  it('derives the id from the title and appends -2 on collision (§3.2)', async () => {
    await makeVault()

    const first = await createItem(note('Docker networking'))
    const second = await createItem(note('Docker networking'))
    const third = await createItem(note('Docker networking'))

    expect(first.data.id).toBe('docker-networking')
    expect(second.data.id).toBe('docker-networking-2')
    expect(third.data.id).toBe('docker-networking-3')
    expect(second.paths).toEqual(['notes/docker-networking-2.md'])
  })

  it('refuses a second binary item claiming the same file, without hanging', async () => {
    /*
     * A binary item's path comes from `fileName`, not from its slug (§3.5), so
     * no `-2` suffix can ever free it. Folding that path into the slug-loop's
     * `taken` predicate made it constant-true, and `uniqueSlug` spun forever —
     * synchronously, so it blocked the event loop and took the whole server
     * with it rather than failing one request.
     *
     * The upload route never reaches this, because it uniquifies the asset
     * name first. `createItem` is exported, though, and the CLI and the phase
     * 2b UI both call it directly — which is how this arrives.
     */
    await makeVault()

    const first = await createItem({
      type: 'image',
      title: 'Architecture',
      fileName: 'diagram.png',
    })
    expect(first.data.id).toBe('architecture')

    const error = await createItem({
      // A different title, so the *id* is free — only the path is taken.
      type: 'image',
      title: 'Something else entirely',
      fileName: 'diagram.png',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(VaultError)
    expect((error as VaultError).code).toBe('ITEM_EXISTS')
    expect((error as VaultError).message).toContain('diagram.png')
  }, 10_000)

  it('still suffixes the id when two binary items share a title', async () => {
    // The id loop must keep working for binary items; only the *path* check
    // moved out of it.
    const root = await makeVault()

    const first = await createItem({
      type: 'image',
      title: 'Diagram',
      fileName: 'one.png',
    })
    const second = await createItem({
      type: 'image',
      title: 'Diagram',
      fileName: 'two.png',
    })

    expect(first.data.id).toBe('diagram')
    expect(second.data.id).toBe('diagram-2')
    expect((await readVault(root)).errors).toEqual([])
  }, 10_000)

  it('refuses an item that could not be read back', async () => {
    // A snippet with no `language` would load as a vault error. Catching it
    // here means it never reaches the disk in the first place.
    await makeVault()

    const error = await createItem({
      type: 'snippet',
      title: 'Broken',
      content: 'x',
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(VaultError)
    expect((error as VaultError).code).toBe('ITEM_INVALID')
    expect((error as VaultError).message).toContain('language')
  })

  it('stages the file it wrote', async () => {
    const root = await makeVault()
    await createItem(note('Docker networking'))

    expect(git(root, 'status', '--porcelain').trim()).toBe(
      'A  notes/docker-networking.md',
    )
  })

  it('works in a vault that is not a Git repository', async () => {
    // Spec 3 shipped with exactly this state; refusing to save until the user
    // runs `git init` would make DevVault less useful than a folder.
    const root = await makeVault({ repo: false })

    const { data } = await createItem(note('Docker networking'))

    expect(data.id).toBe('docker-networking')
    expect((await readVault(root)).items).toHaveLength(1)
  })
})

describe('updateItem', () => {
  it('produces no diff when nothing changed (verification item 2)', async () => {
    /*
     * The end-to-end proof of spec 1's stable serialization. A save that
     * rewrote the file — even identically-but-reordered, or with a bumped
     * `updatedAt` — would put a diff in front of the user for work they did
     * not do.
     */
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    commitEverything(root)

    const result = await updateItem(data.id, { title: data.title })

    expect(git(root, 'diff').trim()).toBe('')
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
    expect(result.paths).toEqual([])
    expect(result.data.updatedAt).toBe(data.updatedAt)
  })

  it('bumps updatedAt only when something actually changed', async () => {
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    commitEverything(root)

    const result = await updateItem(data.id, {
      description: 'How bridge networks resolve names.',
    })

    expect(result.data.updatedAt).not.toBe(data.updatedAt)
    expect(result.data.description).toBe('How bridge networks resolve names.')
    expect(git(root, 'diff', '--cached', '--name-only').trim()).toBe(
      'notes/docker-networking.md',
    )
  })

  it('renames the file via git mv on a title edit, keeping the id (§3.2)', async () => {
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    commitEverything(root)

    const result = await updateItem(data.id, { title: 'Docker DNS' })

    // The id is the identity and never changes; the path is derived and free to.
    expect(result.data.id).toBe('docker-networking')
    expect(result.data.title).toBe('Docker DNS')

    const vault = await readVault(root)
    expect(vault.itemPaths.get('docker-networking')).toBe('notes/docker-dns.md')
    expect(vault.errors).toEqual([])

    // Recorded as a rename, so `log --follow` keeps the item's history.
    expect(git(root, 'status', '--porcelain').trim()).toContain(
      'notes/docker-networking.md -> notes/docker-dns.md',
    )
  })

  it('keeps collection membership working across a rename', async () => {
    // The reason §3.2 puts identity in frontmatter rather than the path: a
    // path-keyed membership would break on every title edit.
    const root = await makeVault()
    await createCollection({ name: 'DevOps' })
    const { data } = await createItem({
      ...note('Docker networking'),
      collectionIds: ['devops'],
    })
    commitEverything(root)

    await updateItem(data.id, { title: 'Docker DNS' })

    const vault = await readVault(root)
    const moved = vault.items.find((item) => item.id === 'docker-networking')
    expect(moved?.collectionIds).toEqual(['devops'])
  })

  it('renames without Git when the vault is not a repository', async () => {
    const root = await makeVault({ repo: false })
    const { data } = await createItem(note('Docker networking'))

    await updateItem(data.id, { title: 'Docker DNS' })

    const vault = await readVault(root)
    expect(vault.itemPaths.get('docker-networking')).toBe('notes/docker-dns.md')
  })

  it('reports a missing item rather than creating one', async () => {
    await makeVault()

    const error = await updateItem('nope', { title: 'x' }).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(VaultError)
    expect((error as VaultError).code).toBe('ITEM_NOT_FOUND')
  })
})

describe('setItemFlag', () => {
  it('sets the value it was given rather than flipping what it read', async () => {
    // Idempotent, so a double-click settles on what the user asked for rather
    // than on whichever request read the file second.
    await makeVault()
    const { data } = await createItem(note('Docker networking'))

    const on = await setItemFlag(data.id, 'favorite', true)
    expect(on.data.favorite).toBe(true)

    const again = await setItemFlag(data.id, 'favorite', true)
    expect(again.data.favorite).toBe(true)

    const off = await setItemFlag(data.id, 'pinned', false)
    expect(off.data.pinned).toBe(false)
  })
})

describe('deleteItem', () => {
  it('removes the file and drops it from the vault', async () => {
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    commitEverything(root)

    const result = await deleteItem(data.id)

    expect(result.paths).toEqual(['notes/docker-networking.md'])
    expect((await readVault(root)).items).toEqual([])
    expect(git(root, 'status', '--porcelain').trim()).toBe(
      'D  notes/docker-networking.md',
    )
  })

  it('removes a binary item’s asset alongside its sidecar (§3.5)', async () => {
    // Leaving the asset behind would orphan a file nothing references.
    const root = await makeVault()
    await fs.mkdir(path.join(root, 'images'), { recursive: true })
    await fs.writeFile(path.join(root, 'images/diagram.png'), 'binary')

    const { data } = await createItem({
      type: 'image',
      title: 'Architecture',
      fileName: 'diagram.png',
    })
    commitEverything(root)

    const result = await deleteItem(data.id)

    expect(result.paths).toEqual(['images/diagram.png.md', 'images/diagram.png'])
    expect(
      await fs.access(path.join(root, 'images/diagram.png')).catch(() => 'gone'),
    ).toBe('gone')
  })

  it('deletes an item created but never committed', async () => {
    // Staged but not committed. `git rm` handles this itself, so it is the
    // easy case — the test below is the one that needs the fallback.
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))

    await deleteItem(data.id)

    expect((await readVault(root)).items).toEqual([])
  })

  it('stages the tracked half of a mixed batch (§5.4)', async () => {
    /*
     * A binary item is a tracked sidecar beside an asset that may never have
     * been committed. `git rm` is all-or-nothing, so handing it both at once
     * refuses the whole set — which would drop the *sidecar* to the filesystem
     * fallback and leave its deletion unstaged, showing as ` D` rather than
     * `D `. Removing them one at a time is what keeps each correct.
     */
    const root = await makeVault()
    await fs.mkdir(path.join(root, 'images'), { recursive: true })
    await fs.writeFile(path.join(root, 'images/diagram.png'), 'binary')

    const { data } = await createItem({
      type: 'image',
      title: 'Architecture',
      fileName: 'diagram.png',
    })
    // The sidecar is committed; the asset never is.
    git(root, 'add', 'images/diagram.png.md')
    git(root, 'commit', '-m', 'sidecar only')

    await deleteItem(data.id)

    // Staged deletion, not a bare working-tree one.
    expect(git(root, 'status', '--porcelain', '-u').trim()).toBe(
      'D  images/diagram.png.md',
    )
    expect(
      await fs.access(path.join(root, 'images/diagram.png')).catch(() => 'gone'),
    ).toBe('gone')
  })

  it('deletes a file Git has never seen, via the filesystem fallback', async () => {
    /*
     * The case the `UNTRACKED_PATH` fallback in `removePaths` exists for: a
     * file the user wrote into the vault by hand, so it is in neither the
     * index nor a commit and `git rm` refuses it outright. Without the
     * fallback, DevVault could not delete an item it had not created itself —
     * which in a Git-native app is an ordinary way for one to arrive.
     */
    const root = await makeVault()

    await fs.mkdir(path.join(root, 'notes'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'notes/hand-written.md'),
      [
        '---',
        'id: hand-written',
        'title: Hand written',
        'type: note',
        'createdAt: 2026-08-01T12:00:00Z',
        'updatedAt: 2026-08-01T12:00:00Z',
        '---',
        '',
        'Written in an editor, never staged.',
        '',
      ].join('\n'),
      'utf8',
    )

    // Precondition: Git genuinely does not know about it.
    expect(git(root, 'status', '--porcelain', '-u').trim()).toBe(
      '?? notes/hand-written.md',
    )

    await deleteItem('hand-written')

    expect((await readVault(root)).items).toEqual([])
    expect(
      await fs.access(path.join(root, 'notes/hand-written.md')).catch(() => 'gone'),
    ).toBe('gone')
  })
})

describe('collections', () => {
  it('creates one with a slugified id and no stored updatedAt (§3.4)', async () => {
    const root = await makeVault()

    const { data, paths } = await createCollection({
      name: 'React Patterns',
      description: 'Hooks and components.',
    })

    expect(data.id).toBe('react-patterns')
    expect(paths).toEqual(['collections/react-patterns.md'])

    const raw = await fs.readFile(
      path.join(root, 'collections/react-patterns.md'),
      'utf8',
    )
    expect(raw).not.toContain('updatedAt')
  })

  it('skips the write when an update changes nothing', async () => {
    const root = await makeVault()
    await createCollection({ name: 'React Patterns' })
    commitEverything(root)

    const result = await updateCollection('react-patterns', {
      name: 'React Patterns',
    })

    expect(result.paths).toEqual([])
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
  })

  it('drops the collection from every member item when deleted', async () => {
    /*
     * Membership lives on the item (§3.4), so deleting only the collection
     * file would leave items pointing at an id that resolves to nothing.
     */
    const root = await makeVault()
    await createCollection({ name: 'DevOps' })
    await createItem({ ...note('Docker networking'), collectionIds: ['devops'] })
    await createItem({ ...note('Nginx config'), collectionIds: ['devops'] })
    commitEverything(root)

    const { data } = await deleteCollection('devops')

    expect(data.itemsUpdated).toBe(2)

    const vault = await readVault(root)
    expect(vault.collections).toEqual([])
    expect(vault.items.every((item) => item.collectionIds.length === 0)).toBe(true)
    expect(vault.errors).toEqual([])
  })
})

describe('commitAll', () => {
  it('commits every dirty vault-managed path with the batch message', async () => {
    const root = await makeVault()
    await createItem(note('Docker networking'))
    await createItem({ ...note('Nginx config'), title: 'Nginx config' })

    const { hash, files } = await commitAll()

    expect(files).toBe(2)
    expect(hash).toMatch(/^[0-9a-f]{7,40}$/)
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe(
      'Update vault: 2 files',
    )
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
  })

  it('leaves files DevVault did not put there alone (§5.4)', async () => {
    /*
     * The vault is the *user's* repository. `git add -A` would sweep their own
     * scratch files into a commit DevVault labelled, which is the failure this
     * whole predicate exists to prevent.
     */
    const root = await makeVault()
    await createItem(note('Docker networking'))
    await fs.writeFile(path.join(root, 'scratch.txt'), 'mine', 'utf8')
    await fs.mkdir(path.join(root, 'vendor'), { recursive: true })
    await fs.writeFile(path.join(root, 'vendor/thing.md'), 'theirs', 'utf8')

    const { files } = await commitAll()

    expect(files).toBe(1)
    expect(git(root, 'status', '--porcelain', '-u').trim().split('\n').sort()).toEqual(
      ['?? scratch.txt', '?? vendor/thing.md'],
    )
  })

  it('commits a hand-edited file, not only its own writes', async () => {
    // The Git-native promise: the panel counts what `git status` reports, so
    // the button has to commit the same set.
    const root = await makeVault()
    await createItem(note('Docker networking'))
    await commitAll()

    await fs.appendFile(
      path.join(root, 'notes/docker-networking.md'),
      '\nHand-edited.\n',
      'utf8',
    )

    const { files } = await commitAll()

    expect(files).toBe(1)
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
  })

  it('commits a deletion', async () => {
    /*
     * The gap the delete tests above left: they assert `git status` and stop,
     * so nothing exercised committing a *staged deletion*. `git rm` leaves the
     * path in neither the working tree nor the index, and `git add` rejects the
     * whole command for it — so before the filter in `commitAll`, Commit failed
     * outright whenever the pending changes included a deleted item.
     */
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    await commitAll()

    await deleteItem(data.id)
    const { files } = await commitAll()

    expect(files).toBe(1)
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
    expect(subjects(root)[0]).toBe('Update vault: 1 file')
    // And it really is gone from the committed tree, not merely from disk.
    expect(git(root, 'ls-files').trim()).toBe('')
  })

  it('commits a mix of additions, edits and deletions together', async () => {
    const root = await makeVault()
    const keep = await createItem(note('Kept note'))
    const doomed = await createItem(note('Doomed note'))
    await commitAll()

    await updateItem(keep.data.id, { description: 'Edited.' })
    await deleteItem(doomed.data.id)
    await createItem(note('Brand new note'))

    const { files } = await commitAll()

    expect(files).toBe(3)
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
    expect(git(root, 'ls-files').trim().split('\n').sort()).toEqual([
      'notes/brand-new-note.md',
      'notes/kept-note.md',
    ])
  })

  it('commits a rename', async () => {
    // `git mv` also stages ahead of time, and the source path is gone.
    const root = await makeVault()
    const { data } = await createItem(note('Docker networking'))
    await commitAll()

    await updateItem(data.id, { title: 'Docker DNS' })
    const { files } = await commitAll()

    // One, not two: `git status` prints a rename as a single `R from -> to`
    // line, and the user moved one item.
    expect(files).toBe(1)
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
    expect(git(root, 'ls-files').trim()).toBe('notes/docker-dns.md')
  })

  it('reports nothing to commit rather than making an empty commit', async () => {
    const root = await makeVault()
    await createItem(note('Docker networking'))
    await commitAll()

    const error = await commitAll().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('NOTHING_TO_COMMIT')
    expect(subjects(root)).toHaveLength(1)
  })

  it('explains itself in a vault with no repository', async () => {
    await makeVault({ repo: false })
    await createItem(note('Docker networking'))

    const error = await commitAll().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('NOT_A_REPOSITORY')
    expect((error as GitError).message).toContain('git init')
  })

  it('accepts an explicit message for the CLI to pass', async () => {
    const root = await makeVault()
    await createItem(note('Docker networking'))

    await commitAll('Add note: Docker networking')

    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe(
      'Add note: Docker networking',
    )
  })
})

describe('concurrent mutations', () => {
  it('both succeed rather than colliding on index.lock (verification item 5)', async () => {
    /*
     * The check the spec calls out as most likely to be skipped. Each
     * `createItem` stages, and a stage takes the index lock — without the
     * queue in `lib/git/queue.ts` these fail intermittently.
     */
    const root = await makeVault()

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        createItem(note(`Concurrent note ${index}`)),
      ),
    )

    expect(results).toHaveLength(6)

    const vault = await readVault(root)
    expect(vault.items).toHaveLength(6)
    expect(vault.errors).toEqual([])

    // Every id distinct: the slug collision check held under concurrency for
    // distinct titles.
    expect(new Set(vault.items.map((item) => item.id)).size).toBe(6)

    const staged = git(root, 'status', '--porcelain').trim().split('\n')
    expect(staged).toHaveLength(6)
    expect(staged.every((line) => line.startsWith('A  notes/'))).toBe(true)
  })
})

describe('autoCommit', () => {
  const enableAutoCommit = async (root: string): Promise<void> => {
    await fs.mkdir(path.join(root, '.devvault'), { recursive: true })
    await fs.writeFile(
      path.join(root, '.devvault/config.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'test',
        autoCommit: true,
        defaultBranch: 'main',
      }),
      'utf8',
    )
    // Committed straight away so the config file itself is not one of the
    // dirty paths the burst below is counted against.
    commitEverything(root, 'Enable autoCommit')
  }

  it('is off by default, leaving changes uncommitted', async () => {
    const root = await makeVault()
    await createItem(note('Docker networking'))

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(subjects(root)).toEqual([])
    expect(git(root, 'status', '--porcelain').trim()).not.toBe('')
  })

  it('turns a burst of edits into one commit, not five (verification item 8)', async () => {
    /*
     * Runs against the real 5s debounce rather than fake timers: the debounce
     * schedules a `setTimeout` whose callback awaits real subprocesses, and
     * fake timers would only prove the timer was set, not that one commit came
     * out the other end.
     */
    const root = await makeVault()
    await enableAutoCommit(root)

    for (let index = 0; index < 5; index += 1) {
      await createItem(note(`Burst note ${index}`))
    }

    // Nothing new yet — the burst is still inside the debounce window.
    expect(subjects(root)).toEqual(['Enable autoCommit'])

    await new Promise((resolve) => setTimeout(resolve, 7_000))

    // One commit for five edits, which is the whole point of the debounce.
    expect(subjects(root)).toEqual([
      'Update vault: 5 files',
      'Enable autoCommit',
    ])
    expect(git(root, 'status', '--porcelain').trim()).toBe('')
  }, 20_000)

  it('keeps the specific message when only one edit happened', async () => {
    const root = await makeVault()
    await enableAutoCommit(root)

    await createItem(note('Docker networking'))
    await new Promise((resolve) => setTimeout(resolve, 7_000))

    expect(subjects(root)).toEqual([
      'Add note: Docker networking',
      'Enable autoCommit',
    ])
  }, 20_000)
})
