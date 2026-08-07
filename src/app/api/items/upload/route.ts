import fs from 'node:fs/promises'

import { VaultError } from '@/lib/errors'
import { resolveInVault } from '@/lib/filesystem/paths'
import { GitError } from '@/lib/git/errors'
import { safeAssetName, uniqueAssetName } from '@/lib/vault/assets'
import { resolveVaultPath } from '@/lib/vault/config'
import { TYPE_DIRECTORIES } from '@/lib/vault/layout'
import { createItem, stageVaultPaths } from '@/lib/vault/mutations'
import { deleteFiles } from '@/lib/vault/writer'
import type { ItemTypeId } from '@/types/vault'

/**
 * Creates an `image` or `file` item from a multipart upload.
 *
 * A Route Handler rather than a Server Action because the payload is a file
 * (§6.2). It writes two things — the asset, and the sidecar `.md` that
 * describes it (§3.5) — and the interesting part is the order: the asset lands
 * first, and if creating the sidecar then fails the asset is removed again,
 * because an asset with no sidecar is invisible to the reader and would sit in
 * the vault forever with nothing referencing it.
 */

/** Large enough for a screenshot or a PDF, small enough not to bloat a repo. */
const MAX_BYTES = 25 * 1024 * 1024

const jsonError = (message: string, status: number): Response =>
  Response.json({ success: false, error: message }, { status })

const field = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const list = (form: FormData, name: string): string[] | undefined => {
  const raw = field(form, name)
  return raw
    ? raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined
}

export const POST = async (request: Request): Promise<Response> => {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError('Expected a multipart form upload.', 400)
  }

  const upload = form.get('file')
  if (!(upload instanceof File) || upload.size === 0) {
    return jsonError('No file was uploaded.', 400)
  }

  if (upload.size > MAX_BYTES) {
    return jsonError('That file is larger than the 25MB limit.', 413)
  }

  // `image` unless told otherwise, decided from the browser's own content type
  // so a dropped screenshot lands in `images/` without the caller saying so.
  const requested = field(form, 'type')
  const type: ItemTypeId =
    requested === 'image' || requested === 'file'
      ? requested
      : upload.type.startsWith('image/')
        ? 'image'
        : 'file'

  let assetPath: string | undefined

  try {
    const root = await resolveVaultPath()
    const directory = TYPE_DIRECTORIES[type]

    const existing = await fs
      .readdir(resolveInVault(root, directory))
      .catch(() => [] as string[])
    const taken = new Set(existing)

    const fileName = uniqueAssetName(safeAssetName(upload.name), (candidate) =>
      taken.has(candidate),
    )

    assetPath = `${directory}/${fileName}`

    const bytes = Buffer.from(await upload.arrayBuffer())
    await fs.mkdir(resolveInVault(root, directory), { recursive: true })
    await fs.writeFile(resolveInVault(root, assetPath), bytes)

    const { data } = await createItem({
      type,
      // The upload's own name is the obvious default title, and the only one
      // available when the caller sends nothing but a file.
      title: field(form, 'title') ?? upload.name,
      description: field(form, 'description'),
      collectionIds: list(form, 'collectionIds'),
      tags: list(form, 'tags'),
      fileName,
    })

    // The sidecar was staged by `createItem`; the asset it describes was not.
    await stageVaultPaths([assetPath])

    return Response.json({ success: true, data: { item: data, path: assetPath } })
  } catch (error) {
    if (assetPath) {
      const root = await resolveVaultPath().catch(() => null)
      // Best effort: the upload has already failed, and a cleanup failure must
      // not replace the real error with its own.
      if (root) await deleteFiles(root, [assetPath]).catch(() => undefined)
    }

    if (error instanceof VaultError || error instanceof GitError) {
      return jsonError(error.message, 400)
    }

    console.error('[devvault] upload failed')
    return jsonError('The upload could not be saved to your vault.', 500)
  }
}
