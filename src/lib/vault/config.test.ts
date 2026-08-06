import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { VaultError } from '@/lib/errors'
import { readVaultConfig, resolveVaultPath } from '@/lib/vault/config'

const withEnv = async <T>(value: string | undefined, run: () => Promise<T>) => {
  const previous = process.env.DEVVAULT_PATH
  if (value === undefined) delete process.env.DEVVAULT_PATH
  else process.env.DEVVAULT_PATH = value

  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.DEVVAULT_PATH
    else process.env.DEVVAULT_PATH = previous
  }
}

const temporaryDirs: string[] = []

const makeDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-config-'))
  temporaryDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('resolveVaultPath', () => {
  it('tells the user what to set when the variable is missing', async () => {
    await withEnv(undefined, async () => {
      await expect(resolveVaultPath()).rejects.toThrow(/DEVVAULT_PATH is not set/)
      await expect(resolveVaultPath()).rejects.toThrow(/\.env\.local/)
    })
  })

  it('treats an empty variable as unset', async () => {
    await withEnv('   ', async () => {
      const error = await resolveVaultPath().catch((e: unknown) => e)
      expect((error as VaultError).code).toBe('VAULT_PATH_UNSET')
    })
  })

  it('rejects a directory that does not exist', async () => {
    await withEnv('/nope/not/a/vault', async () => {
      const error = await resolveVaultPath().catch((e: unknown) => e)
      expect((error as VaultError).code).toBe('VAULT_PATH_INVALID')
    })
  })

  it('rejects a path that is a file', async () => {
    const dir = await makeDir()
    const file = path.join(dir, 'vault.txt')
    await fs.writeFile(file, 'x', 'utf8')

    await withEnv(file, async () => {
      await expect(resolveVaultPath()).rejects.toThrow(/not a directory/)
    })
  })

  it('resolves an existing directory to an absolute path', async () => {
    const dir = await makeDir()
    await withEnv(dir, async () => {
      await expect(resolveVaultPath()).resolves.toBe(path.resolve(dir))
    })
  })

  it('expands a leading ~ so one .env.local works on several machines', async () => {
    await withEnv('~/definitely-not-a-real-vault', async () => {
      const error = await resolveVaultPath().catch((e: unknown) => e)
      // It got as far as statting the expanded path rather than a literal "~".
      expect((error as VaultError).code).toBe('VAULT_PATH_INVALID')
    })
  })
})

describe('readVaultConfig', () => {
  it('falls back to documented defaults when there is no config file', async () => {
    const dir = await makeDir()

    await expect(readVaultConfig(dir)).resolves.toEqual({
      schemaVersion: 1,
      name: path.basename(dir),
      autoCommit: false,
      defaultBranch: 'main',
    })
  })

  it('reads a config file over the defaults', async () => {
    const dir = await makeDir()
    await fs.mkdir(path.join(dir, '.devvault'), { recursive: true })
    await fs.writeFile(
      path.join(dir, '.devvault/config.json'),
      JSON.stringify({ schemaVersion: 1, name: 'Work', autoCommit: true }),
      'utf8',
    )

    await expect(readVaultConfig(dir)).resolves.toEqual({
      schemaVersion: 1,
      name: 'Work',
      autoCommit: true,
      // Absent from the file, so the default fills in.
      defaultBranch: 'main',
    })
  })

  it('refuses a malformed config rather than guessing', async () => {
    const dir = await makeDir()
    await fs.mkdir(path.join(dir, '.devvault'), { recursive: true })
    await fs.writeFile(path.join(dir, '.devvault/config.json'), '{ not json', 'utf8')

    const error = await readVaultConfig(dir).catch((e: unknown) => e)
    expect((error as VaultError).code).toBe('CONFIG_INVALID')
  })

  it('refuses a config whose fields are the wrong shape', async () => {
    const dir = await makeDir()
    await fs.mkdir(path.join(dir, '.devvault'), { recursive: true })
    await fs.writeFile(
      path.join(dir, '.devvault/config.json'),
      JSON.stringify({ schemaVersion: 2, autoCommit: 'yes' }),
      'utf8',
    )

    await expect(readVaultConfig(dir)).rejects.toThrow(VaultError)
  })
})
