import 'server-only'

import { cache } from 'react'

import { describeForLog, messageFor, toGitError } from '@/lib/git/errors'
import {
  checkRepository,
  createGitService,
  isGitInstalled,
} from '@/lib/git/simple-git-service'
import type { GitErrorCode, GitStatusResult } from '@/lib/git/types'
import { resolveVaultPath } from '@/lib/vault/config'

const failure = (code: GitErrorCode): GitStatusResult => ({
  ok: false,
  code,
  message: messageFor(code),
})

/**
 * The vault's Git state, read once per request.
 *
 * React `cache()` for the same reason `loadVault` uses it: the root layout is
 * the only caller today, but nothing should have to know that, and a second
 * caller must not mean a second `git status`. Deliberately no cross-request
 * cache and **no polling** (§5.2) — status recomputes on navigation, which is
 * every render given `force-dynamic`.
 *
 * Never throws for a Git reason. Every failure below is a state the panel has
 * to render; only a `VaultError` (no vault at all) propagates, and the layout
 * already turns that into the setup screen.
 */
export const loadGitStatus = cache(async (): Promise<GitStatusResult> => {
  const root = await resolveVaultPath()

  if (!(await isGitInstalled(root))) {
    return failure('GIT_NOT_INSTALLED')
  }

  // Checked per request rather than once per process: a user who runs
  // `git init` or sets `user.email` while DevVault is open should see the
  // panel change on reload, not on restart.
  const { isRepo, hasIdentity } = await checkRepository(root)

  if (!isRepo) return failure('NOT_A_REPOSITORY')
  if (!hasIdentity) return failure('IDENTITY_UNSET')

  const git = createGitService(root)

  try {
    // Both reads are independent, and `log` is the slower of the two.
    const [status, commits] = await Promise.all([
      git.status(),
      git.log({ limit: 1 }),
    ])

    return { ok: true, status, lastCommit: commits[0] ?? null }
  } catch (error) {
    const gitError = toGitError(error)
    console.error(`[devvault] git status failed: ${describeForLog(error)}`)
    return { ok: false, code: gitError.code, message: gitError.message }
  }
})
