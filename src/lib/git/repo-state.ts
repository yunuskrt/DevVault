import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import type { GitOperation } from '@/lib/git/types'

/**
 * Whether the vault is suspended mid-operation (§9.7).
 *
 * Filesystem rather than a subprocess: this is read on every request alongside
 * `status` and `log`, and four `fs.access` calls are cheaper than a fifth
 * `git`. It is also the only way to ask the question *before* running a
 * command, which is what `sync` needs — Git's own refusal to operate mid-rebase
 * is worded for someone who already knows what they did.
 *
 * **The markers are not the ones §9.7 names.** That section suggests
 * `.git/REBASE_HEAD`, but that is a ref pointing at the commit being replayed,
 * not a statement that anything is in progress; Git's own `git status` reads
 * the `rebase-merge/` and `rebase-apply/` *directories*, and so does this.
 * Verified against Git 2.39.3: a rebase or merge that completes cleanly leaves
 * no marker at all, a conflicted rebase leaves `REBASE_HEAD` + `rebase-merge/`,
 * and a conflicted merge leaves `MERGE_HEAD`. Keying on `REBASE_HEAD` risks
 * stranding the panel in a paused state no Sync can clear.
 */

/**
 * The real git directory, which is not always `<root>/.git`.
 *
 * In a linked worktree or a submodule that path is a *file* holding
 * `gitdir: <somewhere else>`, and the markers live at the target. Reading it
 * costs one extra `readFile` in a case that would otherwise report "no
 * operation" forever.
 */
const resolveGitDir = async (root: string): Promise<string> => {
  const dotGit = path.join(root, '.git')
  const stats = await fs.stat(dotGit)

  if (stats.isDirectory()) return dotGit

  const pointer = await fs.readFile(dotGit, 'utf8')
  const match = /^gitdir:\s*(.+)$/m.exec(pointer)
  if (!match) throw new Error('unrecognised .git pointer file')

  const target = match[1].trim()
  return path.isAbsolute(target) ? target : path.resolve(root, target)
}

const exists = (target: string): Promise<boolean> =>
  fs.access(target).then(
    () => true,
    () => false,
  )

export const readGitOperation = async (
  root: string,
): Promise<GitOperation | null> => {
  let gitDir: string

  try {
    gitDir = await resolveGitDir(root)
  } catch {
    // No `.git` at all. A vault that is not a repository is a supported state
    // and is not suspended in anything.
    return null
  }

  const [rebaseMerge, rebaseApply, merge, cherryPick, revert] =
    await Promise.all([
      // `rebase-merge/` is the interactive and merge-backend rebase;
      // `rebase-apply/` is the older `am` backend and `git am` itself. Either
      // one means a rebase is waiting on the user.
      exists(path.join(gitDir, 'rebase-merge')),
      exists(path.join(gitDir, 'rebase-apply')),
      exists(path.join(gitDir, 'MERGE_HEAD')),
      exists(path.join(gitDir, 'CHERRY_PICK_HEAD')),
      exists(path.join(gitDir, 'REVERT_HEAD')),
    ])

  if (rebaseMerge || rebaseApply) return 'rebase'
  if (merge) return 'merge'
  if (cherryPick) return 'cherry-pick'
  if (revert) return 'revert'

  return null
}
