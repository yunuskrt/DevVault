import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { VaultError } from '@/lib/errors'
import {
  contentTypeFor,
  resolveAssetPath,
  safeAssetName,
  uniqueAssetName,
} from '@/lib/vault/assets'

/*
 * Verification item 6. This module holds the two values in the whole vault
 * layer that come straight from an attacker-controllable place — an upload's
 * filename, and a URL path — so it gets the adversarial tests.
 */

const temporaryDirs: string[] = []

const makeVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-assets-'))
  temporaryDirs.push(root)
  await fs.mkdir(path.join(root, 'images'), { recursive: true })
  await fs.writeFile(path.join(root, 'images/diagram.png'), 'binary', 'utf8')
  return root
}

afterAll(async () => {
  await Promise.all(
    temporaryDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('safeAssetName', () => {
  it('keeps an ordinary filename readable', () => {
    expect(safeAssetName('diagram.png')).toBe('diagram.png')
    expect(safeAssetName('My Screenshot 2026.PNG')).toBe(
      'my-screenshot-2026.png',
    )
  })

  it('strips any directory the client sent', () => {
    // Some clients put a full path in the multipart `filename`.
    expect(safeAssetName('/Users/someone/secret/diagram.png')).toBe(
      'diagram.png',
    )
    expect(safeAssetName('C:\\Users\\someone\\diagram.png')).toBe('diagram.png')
  })

  it('cannot produce a traversal', () => {
    for (const hostile of [
      '../../etc/passwd',
      '....//....//etc/passwd',
      'x.png/../../../../etc/passwd',
      '..',
    ]) {
      const safe = safeAssetName(hostile)
      expect(safe).not.toContain('..')
      expect(safe).not.toContain('/')
      expect(safe).not.toContain('\\')
      expect(safe.startsWith('.')).toBe(false)
    }
  })

  it('slugifies the extension too', () => {
    // An "extension" is not automatically trustworthy just because it follows
    // the last dot.
    expect(safeAssetName('evil.png/../../shell')).not.toContain('/')
    expect(safeAssetName('report.tar.gz')).toBe('report-tar.gz')
  })
})

describe('uniqueAssetName', () => {
  it('suffixes the stem so the extension keeps its meaning', () => {
    // `diagram.png-2` would be served as an unknown type.
    const taken = new Set(['diagram.png', 'diagram-2.png'])
    expect(uniqueAssetName('diagram.png', (c) => taken.has(c))).toBe(
      'diagram-3.png',
    )
  })

  it('leaves a free name alone', () => {
    expect(uniqueAssetName('diagram.png', () => false)).toBe('diagram.png')
  })
})

describe('contentTypeFor', () => {
  it('maps known extensions', () => {
    expect(contentTypeFor('images/diagram.png')).toBe('image/png')
    expect(contentTypeFor('a/b/PHOTO.JPEG')).toBe('image/jpeg')
    expect(contentTypeFor('files/notes.md')).toBe('text/markdown; charset=utf-8')
  })

  it('falls back to a type the browser will not execute', () => {
    // A guess would be worse than a download for a file nothing has vouched for.
    expect(contentTypeFor('files/thing.xyz')).toBe('application/octet-stream')
    expect(contentTypeFor('files/noextension')).toBe('application/octet-stream')
  })
})

describe('resolveAssetPath', () => {
  it('resolves a real asset', async () => {
    const root = await makeVault()

    const resolved = await resolveAssetPath(root, ['images', 'diagram.png'])

    expect(resolved).toBe(await fs.realpath(path.join(root, 'images/diagram.png')))
  })

  it('rejects traversal attempts (verification item 6)', async () => {
    const root = await makeVault()

    for (const segments of [
      ['..', '..', 'etc', 'passwd'],
      ['images', '..', '..', '..', 'etc', 'passwd'],
      ['images', '..', '..', 'etc', 'passwd'],
      ['/etc/passwd'],
    ]) {
      await expect(resolveAssetPath(root, segments)).rejects.toBeInstanceOf(
        VaultError,
      )
    }
  })

  it('refuses paths outside the two asset directories', async () => {
    // Without the allow-list, a perfectly valid in-vault path like the config
    // file would be served over HTTP.
    const root = await makeVault()
    await fs.mkdir(path.join(root, '.devvault'), { recursive: true })
    await fs.writeFile(path.join(root, '.devvault/config.json'), '{}', 'utf8')
    await fs.mkdir(path.join(root, 'notes'), { recursive: true })
    await fs.writeFile(path.join(root, 'notes/secret.md'), 'x', 'utf8')

    await expect(
      resolveAssetPath(root, ['.devvault', 'config.json']),
    ).rejects.toBeInstanceOf(VaultError)
    await expect(
      resolveAssetPath(root, ['notes', 'secret.md']),
    ).rejects.toBeInstanceOf(VaultError)
  })

  it('does not follow a symlink out of the vault', async () => {
    /*
     * The check the textual ones cannot make: every path in them is a string,
     * and a symlink is only followed when the file is opened. `images/escape`
     * is a legitimate in-vault path by any textual measure.
     */
    const root = await makeVault()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-outside-'))
    temporaryDirs.push(outside)
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret', 'utf8')

    await fs.symlink(
      path.join(outside, 'secret.txt'),
      path.join(root, 'images/escape.txt'),
    )

    const error = await resolveAssetPath(root, ['images', 'escape.txt']).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(VaultError)
    expect((error as VaultError).code).toBe('PATH_ESCAPE')
  })

  it('allows a symlink that stays inside the vault', async () => {
    // The check is "escapes the vault", not "is a symlink".
    const root = await makeVault()
    await fs.symlink(
      path.join(root, 'images/diagram.png'),
      path.join(root, 'images/alias.png'),
    )

    await expect(
      resolveAssetPath(root, ['images', 'alias.png']),
    ).resolves.toContain('diagram.png')
  })

  it('reports a missing file without saying whether the directory exists', async () => {
    const root = await makeVault()

    const error = await resolveAssetPath(root, ['images', 'absent.png']).catch(
      (e: unknown) => e,
    )

    expect(error).toBeInstanceOf(VaultError)
    // Same sentence as a refused traversal, so the endpoint cannot be used to
    // probe for what exists.
    expect((error as VaultError).message).toBe('That file is not available.')
  })

  it('refuses a directory', async () => {
    const root = await makeVault()

    await expect(resolveAssetPath(root, ['images'])).rejects.toBeInstanceOf(
      VaultError,
    )
  })
})
