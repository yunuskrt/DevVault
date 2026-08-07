import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The action layer: validation, the `{ success, data, error }` contract, and
 * the promise that nothing internal reaches the browser.
 *
 * `next/cache` is mocked because `revalidatePath` throws outside a request —
 * but the mock is also the *assertion*: the spy is what proves the scope is
 * `'layout'` rather than the default. §6.2 is explicit that a page-scoped
 * revalidation leaves `GitSyncPanel`'s dirty count stale, and nothing else in
 * the suite would catch it.
 */
const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

const {
  commitChanges,
  createCollection,
  createItem,
  deleteItem,
  toggleFavorite,
  togglePinned,
  updateItem,
} = await import('@/actions/vault')
const { resetGitCaches } = await import('@/lib/git/simple-git-service')
const { readVault } = await import('@/lib/vault/reader')

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeVault = async (options: { repo?: boolean } = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-actions-'))
  temporaryDirs.push(root)

  if (options.repo !== false) {
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
  }

  process.env.DEVVAULT_PATH = root
  return root
}

const originalVaultPath = process.env.DEVVAULT_PATH

beforeEach(() => {
  resetGitCaches()
  revalidatePath.mockClear()
})

afterEach(async () => {
  process.env.DEVVAULT_PATH = originalVaultPath
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('the action contract', () => {
  it('returns { success: true, data } and revalidates layout-scoped', async () => {
    const root = await makeVault()

    const result = await createItem({
      type: 'note',
      title: 'Docker networking',
      content: 'Bridge networks.',
    })

    expect(result.success).toBe(true)
    expect(result.data?.id).toBe('docker-networking')
    expect((await readVault(root)).items).toHaveLength(1)

    // §6.2: the panel renders from `layout.tsx`, so page scope would leave the
    // dirty count stale.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('returns { success: false, error } rather than throwing', async () => {
    await makeVault()

    const result = await createItem({ type: 'note', title: '   ' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('A title is required.')
    expect(result.data).toBeUndefined()
  })

  it('does not revalidate when the mutation failed', async () => {
    await makeVault()

    await createItem({ type: 'nonsense', title: 'x' })

    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('validation at the boundary', () => {
  it('rejects an unknown item type', async () => {
    await makeVault()
    const result = await createItem({ type: 'spreadsheet', title: 'x' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed URL before it reaches the disk', async () => {
    const root = await makeVault()

    const result = await createItem({
      type: 'url',
      title: 'Bad link',
      url: 'not a url',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('That is not a valid URL.')
    expect((await readVault(root)).items).toEqual([])
  })

  it('rejects input that is not an object at all', async () => {
    // Server Action arguments arrive over the wire; the type annotation is not
    // a guarantee.
    await makeVault()

    for (const hostile of [null, undefined, 'string', 42, []]) {
      expect((await createItem(hostile)).success).toBe(false)
    }
  })

  it('requires a boolean for a flag rather than coercing', async () => {
    await makeVault()
    await createItem({ type: 'note', title: 'A note', content: 'x' })

    expect((await toggleFavorite({ id: 'a-note', value: 'yes' })).success).toBe(
      false,
    )
    expect((await toggleFavorite({ id: 'a-note', value: true })).success).toBe(
      true,
    )
  })

  it('sets the flag each toggle action names, and only that one', async () => {
    /*
     * The two actions differ by a single string argument to `setItemFlag`, so
     * the failure mode is one of them writing the other's field — which no
     * type catches, since both are booleans on the same record.
     */
    const root = await makeVault()
    await createItem({ type: 'note', title: 'A note', content: 'x' })

    const favorited = await toggleFavorite({ id: 'a-note', value: true })
    expect(favorited.data).toMatchObject({ favorite: true, pinned: false })

    const pinned = await togglePinned({ id: 'a-note', value: true })
    expect(pinned.data).toMatchObject({ favorite: true, pinned: true })

    const unpinned = await togglePinned({ id: 'a-note', value: false })
    expect(unpinned.data).toMatchObject({ favorite: true, pinned: false })

    // And it is on disk, not just in the returned object.
    const stored = (await readVault(root)).items[0]
    expect(stored).toMatchObject({ favorite: true, pinned: false })
  })

  it('trims free text', async () => {
    await makeVault()

    const result = await createCollection({ name: '  React Patterns  ' })

    expect(result.data?.name).toBe('React Patterns')
  })
})

describe('error mapping', () => {
  it('passes through a VaultError message, which is written for a user', async () => {
    await makeVault()

    const result = await updateItem({ id: 'does-not-exist', title: 'x' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('That item no longer exists.')
  })

  it('passes through a GitError message', async () => {
    await makeVault({ repo: false })

    const result = await commitChanges({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('git init')
  })

  it('names no absolute path when the vault is misconfigured', async () => {
    const root = await makeVault()
    process.env.DEVVAULT_PATH = path.join(root, 'no', 'such', 'place')

    const result = await deleteItem({ id: 'whatever' })

    expect(result.success).toBe(false)
    // A `VaultError`, so the sentence is deliberate and tells the user the fix.
    expect(result.error).toContain('npm run seed')
    expect(result.error).not.toContain(root)
    expect(result.error).not.toContain(os.tmpdir())
  })

  it('replaces an unexpected error rather than passing it through', async () => {
    /*
     * The standing constraint for the whole series, tested against a failure
     * nobody wrote a message for. An unreadable vault directory throws a raw
     * `EACCES` whose message carries the absolute path — exactly the shape
     * that must not reach a browser.
     */
    const root = await makeVault()
    await fs.chmod(root, 0o000)

    try {
      const result = await deleteItem({ id: 'whatever' })

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        'Something went wrong saving to your vault. Check the server log for details.',
      )
      expect(result.error).not.toContain(root)
      expect(result.error).not.toContain('EACCES')
      // No stack frame — `\n    at …` is what one looks like.
      expect(result.error).not.toMatch(/\n\s*at /)
      expect(result.error).not.toMatch(/\.ts:\d+/)
    } finally {
      // Restore, or the afterEach cleanup cannot remove the directory.
      await fs.chmod(root, 0o755)
    }
  })
})

describe('commitChanges', () => {
  it('commits and reports how many files went in', async () => {
    const root = await makeVault()
    await createItem({ type: 'note', title: 'One', content: 'a' })
    await createItem({ type: 'note', title: 'Two', content: 'b' })

    const result = await commitChanges({})

    expect(result.success).toBe(true)
    expect(result.data?.files).toBe(2)
    expect(git(root, 'log', '-1', '--format=%s').trim()).toBe(
      'Update vault: 2 files',
    )
  })

  it('defaults its input, since the sidebar button sends nothing', async () => {
    await makeVault()
    await createItem({ type: 'note', title: 'One', content: 'a' })

    expect((await commitChanges()).success).toBe(true)
  })

  it('reports having nothing to commit as an ordinary failure', async () => {
    await makeVault()

    const result = await commitChanges({})

    expect(result.success).toBe(false)
    expect(result.error).toContain('nothing to commit')
  })
})
