import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetGitCaches } from '@/lib/git/simple-git-service'
import { readVault } from '@/lib/vault/reader'
import { POST } from './route'

/*
 * The upload endpoint, end to end against a real vault.
 *
 * It is the only place in the app where a *filename* arrives from outside, and
 * the only mutation that writes two files that must agree — an asset and the
 * sidecar describing it (§3.5). Both are worth pinning here rather than only in
 * `assets.test.ts`, because the handler owns the part those units cannot: what
 * happens to the asset when creating the sidecar fails.
 */

const temporaryDirs: string[] = []

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const makeVault = async (options: { repo?: boolean } = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-upload-'))
  temporaryDirs.push(root)

  if (options.repo !== false) {
    git(root, 'init', '-b', 'main')
    git(root, 'config', 'user.name', 'Vault Tester')
    git(root, 'config', 'user.email', 'tester@example.com')
  }

  process.env.DEVVAULT_PATH = root
  return root
}

type UploadFields = Record<string, string>

const upload = (
  file: { name: string; body: string; type?: string } | null,
  fields: UploadFields = {},
): Promise<Response> => {
  const form = new FormData()
  if (file) {
    form.set(
      'file',
      new File([file.body], file.name, { type: file.type ?? 'image/png' }),
    )
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)

  return POST(
    new Request('http://localhost/api/items/upload', {
      method: 'POST',
      body: form,
    }),
  )
}

const originalVaultPath = process.env.DEVVAULT_PATH

beforeEach(() => {
  resetGitCaches()
})

afterEach(async () => {
  process.env.DEVVAULT_PATH = originalVaultPath
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('POST /api/items/upload', () => {
  it('writes the asset and a sidecar the reader loads as one item', async () => {
    const root = await makeVault()

    const response = await upload(
      { name: 'diagram.png', body: 'PNG-BYTES' },
      { title: 'Architecture diagram', tags: 'design,verify' },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.data.path).toBe('images/diagram.png')

    // Asset and sidecar both on disk, beside each other (§3.5).
    expect(await fs.readFile(path.join(root, 'images/diagram.png'), 'utf8')).toBe(
      'PNG-BYTES',
    )

    const vault = await readVault(root)
    expect(vault.errors).toEqual([])
    expect(vault.items).toHaveLength(1)
    expect(vault.items[0]).toMatchObject({
      type: 'image',
      title: 'Architecture diagram',
      fileName: 'diagram.png',
      tags: ['design', 'verify'],
    })
    expect(vault.itemPaths.get(vault.items[0].id)).toBe('images/diagram.png.md')
  })

  it('stages both files, not just the sidecar', async () => {
    // `createItem` stages what it wrote; the asset it describes is the
    // handler's own responsibility, and an untracked asset beside a staged
    // sidecar would commit an item whose file is missing.
    const root = await makeVault()

    await upload({ name: 'diagram.png', body: 'PNG' })

    expect(git(root, 'status', '--porcelain', '-u').trim().split('\n').sort()).toEqual([
      'A  images/diagram.png',
      'A  images/diagram.png.md',
    ])
  })

  it('infers the type from the browser’s content type', async () => {
    const root = await makeVault()

    await upload({ name: 'notes.txt', body: 'text', type: 'text/plain' })

    const vault = await readVault(root)
    expect(vault.items[0]).toMatchObject({ type: 'file' })
    expect(vault.itemPaths.get(vault.items[0].id)).toBe('files/notes.txt.md')
  })

  it('honours an explicit type over the inferred one', async () => {
    const root = await makeVault()

    await upload({ name: 'diagram.png', body: 'PNG' }, { type: 'file' })

    const vault = await readVault(root)
    expect(vault.items[0]).toMatchObject({ type: 'file' })
  })

  it('falls back to the filename as the title', async () => {
    // The only title available when the caller sends nothing but a file.
    const root = await makeVault()

    await upload({ name: 'diagram.png', body: 'PNG' })

    expect((await readVault(root)).items[0].title).toBe('diagram.png')
  })

  it('sanitises a hostile filename instead of trusting it', async () => {
    const root = await makeVault()

    const response = await upload({
      name: '../../../../etc/passwd.png',
      body: 'PNG',
    })
    const payload = await response.json()

    expect(payload.success).toBe(true)
    expect(payload.data.path).toBe('images/passwd.png')

    // Nothing was written outside the vault, and nothing escaped `images/`.
    expect(await fs.readdir(path.join(root, 'images'))).toEqual(
      expect.arrayContaining(['passwd.png', 'passwd.png.md']),
    )
    expect(
      await fs.readdir(path.dirname(root)).then((entries) =>
        entries.includes('etc'),
      ),
    ).toBe(false)
  })

  it('suffixes a colliding filename rather than overwriting', async () => {
    // Overwriting would silently destroy the asset an existing item points at.
    const root = await makeVault()

    await upload({ name: 'diagram.png', body: 'FIRST' })
    const second = await upload({ name: 'diagram.png', body: 'SECOND' })

    expect((await second.json()).data.path).toBe('images/diagram-2.png')
    expect(await fs.readFile(path.join(root, 'images/diagram.png'), 'utf8')).toBe(
      'FIRST',
    )
    expect(
      await fs.readFile(path.join(root, 'images/diagram-2.png'), 'utf8'),
    ).toBe('SECOND')

    const vault = await readVault(root)
    expect(vault.items).toHaveLength(2)
    expect(vault.errors).toEqual([])
  })

  it('rejects a request with no file', async () => {
    await makeVault()

    const response = await upload(null, { title: 'Nothing attached' })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('No file was uploaded.')
  })

  it('rejects a request that is not multipart at all', async () => {
    await makeVault()

    const response = await POST(
      new Request('http://localhost/api/items/upload', {
        method: 'POST',
        body: 'not a form',
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('multipart')
  })

  it('rejects a file over the size limit before writing it', async () => {
    const root = await makeVault()

    const response = await upload({
      name: 'huge.png',
      body: 'x'.repeat(26 * 1024 * 1024),
    })

    expect(response.status).toBe(413)
    expect((await response.json()).error).toContain('25MB')
    // Nothing on disk, and no half-created item.
    expect(await fs.readdir(root).then((e) => e.includes('images'))).toBe(false)
    expect((await readVault(root)).items).toEqual([])
  })

  it('removes the asset when the sidecar cannot be written', async () => {
    /*
     * The handler's own invariant, and the reason the asset is written first
     * and removed again on failure: an asset with no sidecar is invisible to
     * the reader, so it would sit in the vault forever with nothing
     * referencing it and no way to find it from the UI.
     *
     * The failure is forced without mocking — a *directory* already occupying
     * the sidecar's path makes `fs.writeFile` fail with EISDIR after the asset
     * has landed, which is exactly the mid-flight shape being tested. It also
     * leaves the asset name free, so the upload does not simply dodge the
     * collision by renaming itself.
     */
    const root = await makeVault()
    await fs.mkdir(path.join(root, 'images/diagram.png.md'), { recursive: true })

    const response = await upload({ name: 'diagram.png', body: 'PNG' })
    const payload = await response.json()

    expect(payload.success).toBe(false)
    expect(response.status).toBe(500)

    // The asset it wrote is gone again; only the pre-existing directory remains.
    expect(await fs.readdir(path.join(root, 'images'))).toEqual([
      'diagram.png.md',
    ])
    expect((await readVault(root)).items).toEqual([])
  })

  it('works in a vault that is not a Git repository', async () => {
    const root = await makeVault({ repo: false })

    const response = await upload({ name: 'diagram.png', body: 'PNG' })

    expect((await response.json()).success).toBe(true)
    expect((await readVault(root)).items).toHaveLength(1)
  })

  it('leaks no path when the vault is misconfigured', async () => {
    await makeVault()
    process.env.DEVVAULT_PATH = '/no/such/vault/anywhere'

    const response = await upload({ name: 'diagram.png', body: 'PNG' })
    const payload = await response.json()

    expect(payload.success).toBe(false)
    expect(payload.error).not.toContain('/no/such/vault')
    expect(payload.error).not.toMatch(/\n\s*at /)
  })
})
