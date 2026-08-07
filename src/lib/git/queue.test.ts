import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { GitError } from '@/lib/git/errors'
import {
  assertIndexUnlocked,
  enqueueGitWrite,
  resetGitQueue,
} from '@/lib/git/queue'

/*
 * §5.9's queue is the piece most likely to be skipped and most likely to
 * matter: without it, two mutations arriving together collide on
 * `.git/index.lock` and one fails intermittently, in a way that does not
 * reproduce under a debugger.
 */

const temporaryDirs: string[] = []

const makeDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-queue-'))
  temporaryDirs.push(dir)
  return dir
}

afterEach(() => {
  resetGitQueue()
})

afterAll(async () => {
  await Promise.all(
    temporaryDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('enqueueGitWrite', () => {
  it('runs tasks one at a time rather than concurrently', async () => {
    // The property the whole module exists for. Without the queue both tasks
    // would be in flight at once and `concurrent` would reach 2.
    let active = 0
    let peak = 0

    const task = async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
    }

    await Promise.all([
      enqueueGitWrite('/vault', task),
      enqueueGitWrite('/vault', task),
      enqueueGitWrite('/vault', task),
    ])

    expect(peak).toBe(1)
  })

  it('preserves the order tasks were enqueued in', async () => {
    const order: number[] = []

    await Promise.all(
      [1, 2, 3].map((n) =>
        enqueueGitWrite('/vault', async () => {
          // Descending delays: without the queue, 3 would finish first.
          await new Promise((resolve) => setTimeout(resolve, 15 - n * 4))
          order.push(n)
        }),
      ),
    )

    expect(order).toEqual([1, 2, 3])
  })

  it('keeps running after a task rejects', async () => {
    // A failed commit must not wedge every later write behind it.
    const failure = enqueueGitWrite('/vault', () =>
      Promise.reject(new Error('boom')),
    )
    await expect(failure).rejects.toThrow('boom')

    await expect(
      enqueueGitWrite('/vault', () => Promise.resolve('ok')),
    ).resolves.toBe('ok')
  })

  it('does not leave a rejected promise in the chain', async () => {
    // The stored tail is a swallowed copy. If it were not, the rejection would
    // resurface as an unhandled rejection when the next task chained onto it.
    const unhandled: unknown[] = []
    const listener = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', listener)

    await enqueueGitWrite('/vault', () => Promise.reject(new Error('x'))).catch(
      () => undefined,
    )
    await enqueueGitWrite('/vault', () => Promise.resolve())
    await new Promise((resolve) => setImmediate(resolve))

    process.off('unhandledRejection', listener)
    expect(unhandled).toEqual([])
  })

  it('keeps separate vaults independent', async () => {
    // Two vaults have two index locks; serializing across them would make one
    // slow commit block the other for no reason.
    const gate = deferred()
    let secondRan = false

    const blocked = enqueueGitWrite('/vault-a', () => gate.promise)
    await enqueueGitWrite('/vault-b', async () => {
      secondRan = true
    })

    expect(secondRan).toBe(true)

    gate.resolve()
    await blocked
  })
})

describe('assertIndexUnlocked', () => {
  it('passes when there is no .git directory at all', async () => {
    // A vault that was never `git init`ed is a supported state.
    await expect(assertIndexUnlocked(await makeDir())).resolves.toBeUndefined()
  })

  it('passes when the repository has no lock held', async () => {
    const root = await makeDir()
    await fs.mkdir(path.join(root, '.git'), { recursive: true })

    await expect(assertIndexUnlocked(root)).resolves.toBeUndefined()
  })

  it('reports a lock held right now as transient', async () => {
    const root = await makeDir()
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    await fs.writeFile(path.join(root, '.git', 'index.lock'), '', 'utf8')

    await expect(assertIndexUnlocked(root)).rejects.toMatchObject({
      code: 'INDEX_LOCKED',
      message: 'Another Git operation is in progress. Try again in a moment.',
    })
  })

  it('names the file when the lock is old enough to be stale', async () => {
    // "Try again in a moment" is useless advice for a lock left by a crashed
    // process, which never clears on its own.
    const root = await makeDir()
    await fs.mkdir(path.join(root, '.git'), { recursive: true })

    const lock = path.join(root, '.git', 'index.lock')
    await fs.writeFile(lock, '', 'utf8')
    const old = new Date(Date.now() - 120_000)
    await fs.utimes(lock, old, old)

    const error = await assertIndexUnlocked(root).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(GitError)
    expect((error as GitError).code).toBe('INDEX_LOCKED')
    expect((error as GitError).message).toContain('delete `.git/index.lock`')
  })
})
