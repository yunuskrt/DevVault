import 'server-only'

import { cache } from 'react'

import { describeForLog } from '@/lib/git/errors'
import { loadGitStatus } from '@/lib/git'
import { createGitService } from '@/lib/git/simple-git-service'
import { parseFrontmatter } from '@/lib/markdown/frontmatter'
import { resolveVaultPath } from '@/lib/vault/config'
import { loadVault } from '@/lib/vault/index'
import { typeForPath } from '@/lib/vault/layout'
import { itemFrontmatterSchema } from '@/lib/vault/schema'
import type { ConflictEntry, VaultAlerts } from '@/types/dashboard'

/**
 * The two things the vault can be shouting about: files Git could not merge,
 * and files DevVault could not read.
 *
 * They are loaded together because they surface together — both are persistent
 * sidebar affordances, both are threaded to the client as one prop, and both
 * are empty in the ordinary case. They are otherwise unrelated, and the type
 * keeps them in separate fields rather than pretending they are one list.
 *
 * `cache()` for the same reason `loadVault` and `loadGitStatus` use it: the
 * layout is the only caller today, and nothing should have to know that.
 */

/**
 * A conflicted path, named for its item where that is possible at all.
 *
 * "Where possible" is doing real work. A conflicted file usually will *not*
 * parse — if the markers landed in the frontmatter it is not valid YAML, and if
 * they landed in the body the file parses but is full of `<<<<<<<`. So the title
 * is looked for in three places, cheapest first:
 *
 * 1. The loaded vault, when the file still parsed (markers in the body only).
 * 2. This computer's side out of the index, which is always a clean file.
 * 3. Nothing — the path stands on its own, which the UI always shows anyway.
 *
 * The *type* is a separate question and almost always answerable: it comes from
 * the directory (§3.1), which conflict markers cannot corrupt.
 */
const describeConflict = async (
  path: string,
  titleFromVault: string | undefined,
  readSide: (path: string) => Promise<string>,
): Promise<ConflictEntry> => {
  const type = typeForPath(path) ?? null

  if (titleFromVault) return { path, title: titleFromVault, type }

  try {
    const { data } = parseFrontmatter(await readSide(path))
    const parsed = itemFrontmatterSchema.safeParse(data)

    return {
      path,
      title: parsed.success ? parsed.data.title : null,
      // The frontmatter is more authoritative than the directory when both are
      // available — though the reader treats a disagreement between them as a
      // vault error, so in practice they agree.
      type: parsed.success ? parsed.data.type : type,
    }
  } catch {
    // A conflicted file that will not parse from either side is exactly the
    // case the spec says must not crash. The path is still actionable.
    return { path, title: null, type }
  }
}

export const loadVaultAlerts = cache(async (): Promise<VaultAlerts> => {
  const [git, vault] = await Promise.all([loadGitStatus(), loadVault()])

  const issues = vault.errors.map((error) => ({
    path: error.path,
    message: error.message,
  }))

  // No Git, no repository, no identity — all states with no conflicts to
  // report. The panel already renders them; the vault issues still stand.
  if (!git.ok) return { conflicts: [], operation: null, issues }

  const { conflicted } = git.status

  /*
   * `operation` is reported even with nothing conflicted, and that is not a
   * detail: resolving the *last* file leaves a rebase still suspended, and the
   * dialog's Abort button is drawn from this field. Defaulting it to `null`
   * here made Abort vanish at exactly the moment the user might want it,
   * stranding a paused rebase with no way out but a terminal — which is the
   * situation this whole spec exists to remove. Caught in the browser, not by
   * a test; `vault-alerts.test.ts` now pins it.
   */
  if (conflicted.length === 0) {
    return { conflicts: [], operation: git.operation, issues }
  }

  const titleByPath = new Map(
    [...vault.itemPaths].flatMap(([id, path]) => {
      const item = vault.items.find((entry) => entry.id === id)
      return item ? [[path, item.title] as const] : []
    }),
  )

  const service = createGitService(await resolveVaultPath())

  const readMine = async (path: string): Promise<string> =>
    (await service.readConflictSides(path)).mine

  const conflicts = await Promise.all(
    conflicted.map((path) =>
      describeConflict(path, titleByPath.get(path), readMine),
    ),
  ).catch((error: unknown) => {
    // Naming the files is a nicety; listing them is the feature. A Git failure
    // while reading the index must not take the whole conflict view down.
    console.error(
      `[devvault] could not read conflict sides: ${describeForLog(error)}`,
    )
    return conflicted.map((path) => ({
      path,
      title: null,
      type: typeForPath(path) ?? null,
    }))
  })

  return { conflicts, operation: git.operation, issues }
})
