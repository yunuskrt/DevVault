import 'server-only'

import path from 'node:path'

import { VaultError } from '@/lib/errors'

/**
 * **This is a security boundary.** Every path derived from user input — an item
 * id, a filename read out of frontmatter, an upload name, a route parameter —
 * goes through here before it reaches the filesystem. It blocks `../`
 * traversal and absolute-path injection, both of which would otherwise let a
 * crafted vault file read or write anywhere on the machine.
 *
 * Do not build vault paths with `path.join(root, …)` anywhere else.
 */
export const resolveInVault = (root: string, relative: string): string => {
  const absoluteRoot = path.resolve(root)
  const full = path.resolve(absoluteRoot, relative)

  if (full !== absoluteRoot && !full.startsWith(absoluteRoot + path.sep)) {
    throw new VaultError(
      'PATH_ESCAPE',
      `"${relative}" resolves outside the vault and was refused.`,
    )
  }

  return full
}

/**
 * Vault-relative paths are always POSIX-separated, so they read the same in
 * frontmatter, in error messages and in Git output regardless of platform.
 */
export const toVaultRelative = (root: string, absolute: string): string =>
  path.relative(path.resolve(root), absolute).split(path.sep).join('/')
