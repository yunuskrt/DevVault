import 'server-only'

import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'

import { VaultError } from '@/lib/errors'
import { resolveInVault } from '@/lib/filesystem/paths'

/**
 * Opens a vault file in whatever the OS considers its default application.
 *
 * This exists because a browser cannot follow a `file://` link from an `http://`
 * page — every browser blocks it — so the spec's **Open in editor** action has
 * to be performed by the server. DevVault is a local application whose server
 * and user are the same person on the same machine, which is what makes that
 * reasonable here and nowhere else.
 *
 * Three properties make it safe to hand a client-supplied path to:
 *
 * 1. **`resolveInVault` is the boundary.** A path that escapes the vault root
 *    throws before anything is spawned, so this cannot be used to open
 *    arbitrary files on the machine.
 * 2. **No shell, ever.** Arguments go to `spawn` as an array, so a filename
 *    containing `;`, `&&` or a quote is an argument and never a command. This
 *    is why Windows goes through `cmd /c start` with array args rather than
 *    `shell: true`.
 * 3. **The absolute path stays here.** The caller passes and receives only the
 *    vault-relative path; the resolved one is never returned to the browser.
 */

/**
 * Detached, with all three streams ignored: the editor outlives this request by
 * design, and an unread pipe would eventually block the child.
 */
const SPAWN_OPTIONS = { detached: true, stdio: 'ignore' } as const

/**
 * Spawns the platform's opener, or returns `null` on a platform with none.
 *
 * **The command is a literal in every branch, deliberately.** A table lookup
 * (`OPENERS[process.platform].command`) reads better and was the first
 * implementation, but Turbopack's file tracer cannot see through a dynamic
 * `spawn` target — it concludes the runtime might need anything and traces the
 * entire project, which surfaced as a build warning that the baseline did not
 * have. Bisected: replacing the dynamic command with a literal cleared it while
 * the surrounding `fs` calls were left untouched.
 */
const spawnOpener = (target: string) => {
  switch (process.platform) {
    case 'darwin':
      return spawn('open', [target], SPAWN_OPTIONS)
    case 'win32':
      // The empty string is `start`'s title argument. Without it, a quoted path
      // is taken *as* the title and nothing opens.
      return spawn('cmd', ['/c', 'start', '', target], SPAWN_OPTIONS)
    case 'linux':
      return spawn('xdg-open', [target], SPAWN_OPTIONS)
    default:
      return null
  }
}

export const openInDefaultApp = async (
  root: string,
  relativePath: string,
): Promise<void> => {
  const target = resolveInVault(root, relativePath)

  try {
    await fs.access(target)
  } catch {
    throw new VaultError(
      'OPEN_FAILED',
      `\`${relativePath}\` is no longer in your vault.`,
    )
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawnOpener(target)

    if (!child) {
      reject(
        new VaultError(
          'OPEN_FAILED',
          'DevVault cannot open files on this platform. Open the file in your editor manually.',
        ),
      )
      return
    }

    child.once('error', () => {
      reject(
        new VaultError(
          'OPEN_FAILED',
          'DevVault could not open that file. Open it in your editor manually.',
        ),
      )
    })

    // `unref` so a long-lived GUI process does not keep the Node event loop
    // referenced after the request has returned.
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
