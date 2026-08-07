import 'server-only'

import fs from 'node:fs/promises'
import path from 'node:path'

import { VaultError } from '@/lib/errors'
import { resolveInVault } from '@/lib/filesystem/paths'
import { TYPE_DIRECTORIES } from '@/lib/vault/layout'
import { slugify } from '@/lib/vault/writer'

/**
 * Binary assets: naming them safely, and serving them safely.
 *
 * `image` and `file` items store the asset itself beside a sidecar `.md`
 * (§3.5), which puts two things in this module that do not exist anywhere else
 * in the vault layer: a filename that came from a user's upload, and a path
 * that came from a URL. Both are the classic shape of a traversal bug, so both
 * are handled here rather than inline in a route handler.
 */

/** Only these two directories hold assets, and only they may be served. */
const ASSET_DIRECTORIES = new Set([
  TYPE_DIRECTORIES.image,
  TYPE_DIRECTORIES.file,
])

/**
 * An upload's filename, reduced to something safe to put in a path.
 *
 * The extension is kept because it is what `contentTypeFor` and every external
 * tool reads, but it is slugified like the stem — an "extension" of
 * `.png/../../evil` is not one. `path.basename` first discards any directory
 * the browser included; some clients send a full path in `filename`.
 */
export const safeAssetName = (rawName: string): string => {
  const base = path.basename(rawName.replace(/\\/g, '/'))
  const extension = path.extname(base)
  const stem = extension ? base.slice(0, -extension.length) : base

  const safeStem = slugify(stem)
  const safeExtension = slugify(extension)

  return safeExtension ? `${safeStem}.${safeExtension}` : safeStem
}

/**
 * `diagram.png`, `diagram-2.png`, … until one is free.
 *
 * The suffix goes on the stem rather than the whole name so the extension keeps
 * its meaning — `diagram.png-2` would be served as an unknown type.
 */
export const uniqueAssetName = (
  name: string,
  taken: (candidate: string) => boolean,
): string => {
  if (!taken(name)) return name

  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}${extension}`
    if (!taken(candidate)) return candidate
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.zip': 'application/zip',
}

/**
 * The `Content-Type` for a vault asset.
 *
 * Unknown extensions get `application/octet-stream` rather than a guess, which
 * makes the browser download them instead of rendering them — the safe default
 * for a file whose contents nothing has vouched for.
 */
export const contentTypeFor = (name: string): string =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] ??
  'application/octet-stream'

/**
 * Resolves a request path to an absolute file inside the vault, or throws.
 *
 * Three independent checks, because each one alone has a hole:
 *
 * 1. `resolveInVault` normalises `..` away and rejects anything landing outside
 *    the root. This is the primary boundary.
 * 2. The first segment must be `images/` or `files/`. Without it a valid path
 *    like `.devvault/config.json` would be served over HTTP.
 * 3. `realpath` is compared against the root *after* resolution, because a
 *    symlink inside the vault pointing at `/etc/passwd` passes both checks
 *    above — every path in them is textual, and the link is only followed when
 *    the file is opened.
 */
export const resolveAssetPath = async (
  root: string,
  segments: string[],
): Promise<string> => {
  const relative = segments.join('/')

  if (!ASSET_DIRECTORIES.has(segments[0] ?? '')) {
    throw new VaultError(
      'PATH_ESCAPE',
      'That file is not available.',
    )
  }

  const absolute = resolveInVault(root, relative)

  let real: string
  try {
    real = await fs.realpath(absolute)
  } catch {
    throw new VaultError('ASSET_NOT_FOUND', 'That file is not available.')
  }

  const realRoot = await fs.realpath(root)
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new VaultError(
      'PATH_ESCAPE',
      'That file is not available.',
    )
  }

  const stats = await fs.stat(real)
  if (!stats.isFile()) {
    throw new VaultError('ASSET_NOT_FOUND', 'That file is not available.')
  }

  return real
}
