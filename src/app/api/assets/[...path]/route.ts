import fs from 'node:fs/promises'

import { VaultError } from '@/lib/errors'
import { contentTypeFor, resolveAssetPath } from '@/lib/vault/assets'
import { resolveVaultPath } from '@/lib/vault/config'

/**
 * Serves a binary from the vault.
 *
 * A Route Handler rather than a Server Action because this is the one thing an
 * action cannot do: vault assets live outside `public/`, so an `<img src>` has
 * no way to reach them without an HTTP endpoint (§6.2).
 *
 * Every path check lives in `resolveAssetPath` — traversal, directory
 * allow-list and symlink escape. This handler's only job is to keep the
 * response indistinguishable between "you asked for something outside the
 * vault" and "that file does not exist": both are 404 with the same body, so
 * the endpoint cannot be used to probe the filesystem.
 */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> => {
  const { path: segments } = await params

  try {
    const root = await resolveVaultPath()
    const absolute = await resolveAssetPath(root, segments)
    const file = await fs.readFile(absolute)

    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': contentTypeFor(absolute),
        'Content-Length': String(file.byteLength),
        // The vault is local and mutable; a cached asset would survive the user
        // replacing the file it came from.
        'Cache-Control': 'no-store',
        // An uploaded SVG or HTML file is script the user did not write. Both
        // headers stop it running against this origin.
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    /*
     * One sentence for every failure, deliberately — including `VaultError`,
     * whose message is safe to show but is *specific*. `PATH_ESCAPE` echoes the
     * requested path and names the boundary that was hit, which distinguishes
     * "outside the vault" from "not an asset directory" from "no such file" and
     * turns this endpoint into a probe for what the vault contains. Nothing
     * downstream needs to tell them apart, so nothing upstream should be able
     * to either.
     */
    if (!(error instanceof VaultError)) {
      console.error('[devvault] asset request failed')
    }

    return Response.json({ error: 'That file is not available.' }, { status: 404 })
  }
}
