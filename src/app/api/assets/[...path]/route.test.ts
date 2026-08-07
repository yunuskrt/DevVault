import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GET } from './route'

/*
 * The asset endpoint, exercised as an endpoint.
 *
 * `assets.test.ts` covers `resolveAssetPath`, which is where the path checks
 * live — but the handler owns two things that module cannot: the response
 * headers a browser acts on, and the promise that every failure is
 * indistinguishable. The second is the one worth pinning, because the natural
 * implementation (pass the `VaultError` message through) quietly breaks it:
 * `PATH_ESCAPE` names the boundary it hit and echoes the requested path, which
 * turns a 404 into a probe for what the vault contains.
 */

const temporaryDirs: string[] = []

const makeVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-assetroute-'))
  temporaryDirs.push(root)

  await fs.mkdir(path.join(root, 'images'), { recursive: true })
  await fs.mkdir(path.join(root, 'notes'), { recursive: true })
  await fs.mkdir(path.join(root, '.devvault'), { recursive: true })
  await fs.writeFile(path.join(root, 'images/diagram.png'), 'PNG-BYTES')
  await fs.writeFile(path.join(root, 'notes/secret.md'), 'private note')
  await fs.writeFile(path.join(root, '.devvault/config.json'), '{}')

  process.env.DEVVAULT_PATH = root
  return root
}

/** The handler takes its route params as a promise, as Next 16 hands them over. */
const get = (segments: string[]): Promise<Response> =>
  GET(new Request('http://localhost/api/assets'), {
    params: Promise.resolve({ path: segments }),
  })

const originalVaultPath = process.env.DEVVAULT_PATH

afterEach(async () => {
  process.env.DEVVAULT_PATH = originalVaultPath
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('GET /api/assets/[...path]', () => {
  it('serves a vault binary with the headers a browser needs', async () => {
    // Vault assets live outside `public/`, so this endpoint is the only way an
    // `<img src>` can reach one (§6.2).
    await makeVault()

    const response = await get(['images', 'diagram.png'])

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('9')
    expect(await response.text()).toBe('PNG-BYTES')
  })

  it('sends headers that stop an uploaded file executing', async () => {
    /*
     * An uploaded SVG or HTML file is script the user did not write, served
     * from the app's own origin. Without these it would run against it.
     */
    await makeVault()

    const response = await get(['images', 'diagram.png'])

    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'none'; sandbox",
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    // The vault is local and mutable; a cached asset would outlive the file.
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('falls back to a type the browser will download, not render', async () => {
    const root = await makeVault()
    await fs.writeFile(path.join(root, 'images/thing.weird'), 'x')

    const response = await get(['images', 'thing.weird'])

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
  })

  it('answers every failure identically, so it cannot be used to probe', async () => {
    /*
     * The property that has to hold across *causes*: traversal, a file outside
     * the asset directories, a directory, and a plain miss all look the same.
     * Anything that distinguishes them tells an attacker what exists.
     */
    await makeVault()

    const cases: string[][] = [
      ['..', '..', 'etc', 'passwd'],
      ['images', '..', '..', '..', 'etc', 'passwd'],
      ['notes', 'secret.md'],
      ['.devvault', 'config.json'],
      ['images', 'does-not-exist.png'],
      ['images'],
      [],
    ]

    const responses = await Promise.all(
      cases.map(async (segments) => {
        const response = await get(segments)
        return { status: response.status, body: await response.text() }
      }),
    )

    for (const response of responses) {
      expect(response.status).toBe(404)
      expect(response.body).toBe('{"error":"That file is not available."}')
    }

    // One distinct answer between them, not several.
    expect(new Set(responses.map((r) => r.body)).size).toBe(1)
  })

  it('does not serve a file a symlink points at outside the vault', async () => {
    // The check no textual comparison can make: `images/escape.txt` is a
    // perfectly in-vault path until the file is opened.
    const root = await makeVault()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-outside-'))
    temporaryDirs.push(outside)
    await fs.writeFile(path.join(outside, 'secret.txt'), 'SECRET')
    await fs.symlink(
      path.join(outside, 'secret.txt'),
      path.join(root, 'images/escape.txt'),
    )

    const response = await get(['images', 'escape.txt'])

    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('SECRET')
  })

  it('404s rather than throwing when the vault is not configured', async () => {
    await makeVault()
    delete process.env.DEVVAULT_PATH

    const response = await get(['images', 'diagram.png'])

    expect(response.status).toBe(404)
    // The setup error names an environment variable; the endpoint must not.
    expect(await response.text()).not.toContain('DEVVAULT_PATH')
  })
})
