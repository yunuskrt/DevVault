import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import { resolveInVault } from '@/lib/filesystem/paths'

/**
 * Directories that are never part of the user's content. `.git/` is Git's own
 * storage and `.devvault/cache/` is derived state; both are covered by the
 * dotfile rule below, but naming them documents the intent.
 */
const SKIPPED = new Set(['.git', '.devvault', 'node_modules'])

const isHidden = (name: string) => name.startsWith('.')

/**
 * Walks the vault recursively and returns every file as a vault-relative,
 * POSIX-separated path, sorted so the result is stable across platforms and
 * filesystems.
 *
 * Nested directories under a type (`snippets/react/…`) are walked and flattened.
 * A folder is **not** a collection — collections are the many-to-many mechanism
 * and folders would be a second, conflicting one.
 */
export const walkVault = async (root: string): Promise<string[]> => {
  const files: string[] = []

  const visit = async (relativeDir: string): Promise<void> => {
    const absoluteDir = resolveInVault(root, relativeDir)
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true })

    for (const entry of entries) {
      if (isHidden(entry.name) || SKIPPED.has(entry.name)) continue

      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        await visit(relative)
      } else if (entry.isFile()) {
        files.push(relative)
      }
    }
  }

  await visit('')

  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** True when a vault-relative path names a Markdown file. */
export const isMarkdown = (relative: string): boolean =>
  path.extname(relative).toLowerCase() === '.md'
