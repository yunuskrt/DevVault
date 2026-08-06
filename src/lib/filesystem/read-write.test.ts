import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { VaultError } from '@/lib/errors'
import {
  ensureDir,
  fileModifiedAt,
  readTextFile,
  removeFile,
  writeTextFile,
} from '@/lib/filesystem/read-write'

const temporaryDirs: string[] = []

const makeRoot = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-rw-'))
  temporaryDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map(dir => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('readTextFile', () => {
  it('normalises CRLF to LF', async () => {
    const root = await makeRoot()
    await fs.writeFile(path.join(root, 'a.md'), '---\r\nid: a\r\n---\r\n', 'utf8')

    // A file hand-edited on Windows has to round-trip through the serializer,
    // which only ever writes LF; normalising on read is what makes that hold.
    expect(await readTextFile(root, 'a.md')).toBe('---\nid: a\n---\n')
  })

  it('leaves a lone CR alone', async () => {
    const root = await makeRoot()
    await fs.writeFile(path.join(root, 'a.md'), 'one\rtwo\n', 'utf8')

    expect(await readTextFile(root, 'a.md')).toBe('one\rtwo\n')
  })
})

describe('writeTextFile', () => {
  it('creates missing parent directories', async () => {
    const root = await makeRoot()
    await writeTextFile(root, 'snippets/react/use-previous.md', 'body\n')

    expect(await readTextFile(root, 'snippets/react/use-previous.md')).toBe(
      'body\n',
    )
  })

  it('writes LF even when handed CRLF', async () => {
    const root = await makeRoot()
    await writeTextFile(root, 'a.md', 'one\r\ntwo\r\n')

    const raw = await fs.readFile(path.join(root, 'a.md'), 'utf8')
    expect(raw).toBe('one\ntwo\n')
  })

  it('overwrites rather than appending', async () => {
    const root = await makeRoot()
    await writeTextFile(root, 'a.md', 'first\n')
    await writeTextFile(root, 'a.md', 'second\n')

    expect(await readTextFile(root, 'a.md')).toBe('second\n')
  })
})

describe('ensureDir', () => {
  it('creates a nested directory and tolerates one that exists', async () => {
    const root = await makeRoot()
    await ensureDir(root, 'images/screenshots')
    await ensureDir(root, 'images/screenshots')

    const stats = await fs.stat(path.join(root, 'images/screenshots'))
    expect(stats.isDirectory()).toBe(true)
  })
})

describe('removeFile', () => {
  it('deletes a file and treats a missing one as done', async () => {
    const root = await makeRoot()
    await writeTextFile(root, 'a.md', 'x\n')

    await removeFile(root, 'a.md')
    await expect(fs.stat(path.join(root, 'a.md'))).rejects.toThrow()

    await expect(removeFile(root, 'a.md')).resolves.toBeUndefined()
  })
})

describe('fileModifiedAt', () => {
  it('returns the file mtime as an ISO string', async () => {
    const root = await makeRoot()
    await writeTextFile(root, 'a.md', 'x\n')

    const stats = await fs.stat(path.join(root, 'a.md'))
    expect(await fileModifiedAt(root, 'a.md')).toBe(stats.mtime.toISOString())
  })
})

describe('the traversal boundary', () => {
  /**
   * Every entry point resolves through `resolveInVault`, so a crafted relative
   * path is refused before it reaches `fs` rather than at each call site.
   */
  it('refuses an escaping path on read, write and delete alike', async () => {
    const root = await makeRoot()

    await expect(readTextFile(root, '../../etc/passwd')).rejects.toThrow(
      VaultError,
    )
    await expect(writeTextFile(root, '../escaped.md', 'x')).rejects.toThrow(
      VaultError,
    )
    await expect(removeFile(root, '../escaped.md')).rejects.toThrow(VaultError)
    await expect(ensureDir(root, '../escaped')).rejects.toThrow(VaultError)
    await expect(fileModifiedAt(root, '../escaped.md')).rejects.toThrow(
      VaultError,
    )

    // Nothing was created beside the vault on the way to failing.
    await expect(
      fs.stat(path.join(path.dirname(root), 'escaped.md')),
    ).rejects.toThrow()
  })
})
