import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import { GitError } from '@/lib/git/errors'

/**
 * Serializes every mutating Git call against a vault (§5.9).
 *
 * Git takes `.git/index.lock` for the duration of any command that touches the
 * index, and a second command that wants it fails outright rather than waiting.
 * Next.js serves requests concurrently, so two users — or one user
 * double-clicking, or a mutation racing an autocommit timer — is enough to
 * produce it. The failure is intermittent and does not reproduce under a
 * debugger, which is exactly why this is a queue rather than a retry.
 *
 * Reads are deliberately *not* queued. `status` and `log` take no lock, and
 * putting them behind the same queue would make every page render wait on
 * whatever commit happened to be in flight.
 */

/** The tail of each vault's chain. One entry per root, for the process. */
const tails = new Map<string, Promise<unknown>>()

/**
 * Runs `task` after every task already queued for this root, whether those
 * succeeded or failed.
 *
 * The stored tail is a swallowed copy: a caller's rejection belongs to that
 * caller, and leaving the rejected promise in the map would surface it a second
 * time as an unhandled rejection when the next task chains onto it.
 */
export const enqueueGitWrite = <T>(
  root: string,
  task: () => Promise<T>,
): Promise<T> => {
  const previous = tails.get(root) ?? Promise.resolve()
  const next = previous.then(task, task)

  tails.set(
    root,
    next.catch(() => undefined),
  )

  return next
}

/** Test seam — the queue would otherwise carry state between cases. */
export const resetGitQueue = (): void => {
  tails.clear()
}

/**
 * How old a lock has to be before it is worth mentioning it might be stale.
 *
 * A live Git command holds the lock for milliseconds. Anything still holding it
 * after this long is either a very slow network operation or — far more likely
 * on a local vault — a process that died without cleaning up.
 */
const STALE_LOCK_MS = 30_000

/**
 * Fails fast when `.git/index.lock` is held by something outside this process.
 *
 * The queue above guarantees we never collide with ourselves, so a lock found
 * here belongs to another Git process or to one that crashed. Both get the same
 * §7.6 sentence, because the user's next move is the same either way, and a
 * stale lock is called out by name so the fix is discoverable.
 *
 * Not a substitute for classifying the error Git itself returns: this closes
 * the window before the command runs, and `toGitError` closes the one after.
 */
export const assertIndexUnlocked = async (root: string): Promise<void> => {
  const lock = path.join(root, '.git', 'index.lock')

  let age: number
  try {
    const stats = await fs.stat(lock)
    age = Date.now() - stats.mtimeMs
  } catch {
    // No lock, or no `.git` at all. Both are fine — a vault that is not a
    // repository is a supported state, and Git will say so itself.
    return
  }

  throw new GitError(
    'INDEX_LOCKED',
    age > STALE_LOCK_MS
      ? 'Another Git operation is in progress. If nothing else is running, delete `.git/index.lock` in your vault.'
      : 'Another Git operation is in progress. Try again in a moment.',
  )
}
