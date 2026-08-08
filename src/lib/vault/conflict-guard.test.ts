import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which Git read the conflict guard uses — pinned deterministically.
 *
 * This is a white-box test, which the rest of the suite avoids, and it earns
 * the exception. The guard added to every mutation must use
 * `conflictedPaths()` (a plain index read) and **not** `status()`, because
 * `git status` refreshes the index and so takes `.git/index.lock` — and the
 * guard runs outside the write queue, where that collides with whatever
 * mutation is in flight.
 *
 * The consequence is intermittent by nature. Swapping the guard back to
 * `status()` broke `mutations.test.ts`'s ten-concurrent-creates test once and
 * then survived three consecutive re-runs, so that test cannot be relied on to
 * hold the line. Recording *which method was called* is the only observation
 * that fails every time.
 *
 * Lives in its own file because the module mock below would otherwise apply to
 * all of `mutations.test.ts`.
 */

const calls = vi.hoisted(() => [] as string[])

vi.mock('@/lib/git/simple-git-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/git/simple-git-service')>()

  return {
    ...actual,
    createGitService: (root: string) => {
      const service = actual.createGitService(root)

      return new Proxy(service, {
        get(target, property, receiver) {
          if (typeof property === 'string') calls.push(property)
          return Reflect.get(target, property, receiver)
        },
      })
    },
  }
})

const { createItem, updateItem } = await import('@/lib/vault/mutations')

const temporaryDirs: string[] = []
const originalVaultPath = process.env.DEVVAULT_PATH

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-guard-'))
  temporaryDirs.push(root)

  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Vault Tester')
  git(root, 'config', 'user.email', 'tester@example.com')

  process.env.DEVVAULT_PATH = root
  return root
}

beforeEach(() => {
  calls.length = 0
})

afterEach(async () => {
  process.env.DEVVAULT_PATH = originalVaultPath
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('the conflict guard reads the index without locking it', () => {
  it('asks conflictedPaths, never status, when creating', async () => {
    await makeVault()

    await createItem({ type: 'note', title: 'Docker networking', content: 'x' })

    expect(calls).toContain('conflictedPaths')
    // `status` would work and would be the obvious call. It is the bug.
    expect(calls).not.toContain('status')
  })

  it('asks conflictedPaths, never status, when updating', async () => {
    await makeVault()
    const created = await createItem({
      type: 'note',
      title: 'Docker networking',
      content: 'x',
    })

    calls.length = 0
    await updateItem(created.data.id, { description: 'edited' })

    expect(calls).toContain('conflictedPaths')
    expect(calls).not.toContain('status')
  })
})
