import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import { resolveInVault } from '@/lib/filesystem/paths'

/**
 * Reads a vault file as UTF-8 and normalises CRLF to LF. Normalising on the way
 * in means a file hand-edited on Windows still round-trips byte-identically
 * through the frontmatter serializer, which only ever writes LF.
 */
export const readTextFile = async (
  root: string,
  relative: string,
): Promise<string> => {
  const raw = await fs.readFile(resolveInVault(root, relative), 'utf8')
  return raw.replace(/\r\n/g, '\n')
}

/** Writes UTF-8 with LF endings, creating the parent directory if needed. */
export const writeTextFile = async (
  root: string,
  relative: string,
  contents: string,
): Promise<void> => {
  const full = resolveInVault(root, relative)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, contents.replace(/\r\n/g, '\n'), 'utf8')
}

export const ensureDir = async (
  root: string,
  relative: string,
): Promise<void> => {
  await fs.mkdir(resolveInVault(root, relative), { recursive: true })
}

/** Deleting something that is already gone is not an error. */
export const removeFile = async (
  root: string,
  relative: string,
): Promise<void> => {
  await fs.rm(resolveInVault(root, relative), { force: true })
}

/** The file's last-modified time as an ISO string, for derived timestamps. */
export const fileModifiedAt = async (
  root: string,
  relative: string,
): Promise<string> => {
  const stats = await fs.stat(resolveInVault(root, relative))
  return stats.mtime.toISOString()
}
