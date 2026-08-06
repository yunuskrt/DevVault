import 'server-only'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { VaultError } from '@/lib/errors'
import { resolveInVault } from '@/lib/filesystem/paths'
import { CONFIG_PATH } from '@/lib/vault/layout'
import { vaultConfigSchema } from '@/lib/vault/schema'

export type VaultConfig = {
  schemaVersion: 1
  name: string
  autoCommit: boolean
  defaultBranch: string
}

const ENV_VAR = 'DEVVAULT_PATH'

/**
 * Resolves the vault root from `DEVVAULT_PATH`.
 *
 * Unset is a setup error, never a fallback to `process.cwd()` — the vault is a
 * *different* repository from this app, and silently writing items into the
 * app's own source tree would be worse than failing.
 */
export const resolveVaultPath = async (): Promise<string> => {
  const raw = process.env[ENV_VAR]?.trim()

  if (!raw) {
    throw new VaultError(
      'VAULT_PATH_UNSET',
      `${ENV_VAR} is not set. Add \`${ENV_VAR}=/absolute/path/to/your/vault\` to .env.local in the project root — see the README.`,
    )
  }

  // `~` never expands on its own outside a shell, and a home-relative path is
  // what makes one .env.local usable on more than one machine.
  const expanded = raw.startsWith('~/')
    ? path.join(os.homedir(), raw.slice(2))
    : raw
  const root = path.resolve(expanded)

  try {
    const stats = await fs.stat(root)
    if (!stats.isDirectory()) {
      throw new VaultError(
        'VAULT_PATH_INVALID',
        `${ENV_VAR} points at a file, not a directory.`,
      )
    }
  } catch (error) {
    if (error instanceof VaultError) throw error
    throw new VaultError(
      'VAULT_PATH_INVALID',
      `${ENV_VAR} points at a directory that does not exist. Create it, or run \`npm run seed\` to populate a new vault.`,
    )
  }

  return root
}

/** What a vault without a config file behaves like. */
const defaults = (root: string): VaultConfig => ({
  schemaVersion: 1,
  name: path.basename(root),
  autoCommit: false,
  defaultBranch: 'main',
})

/**
 * A missing `.devvault/config.json` is not fatal — a user can point DevVault at
 * an ordinary directory of Markdown and have it work. A *malformed* one is
 * fatal, because guessing at what the user meant is how settings get silently
 * reverted.
 */
export const readVaultConfig = async (root: string): Promise<VaultConfig> => {
  let raw: string

  try {
    raw = await fs.readFile(resolveInVault(root, CONFIG_PATH), 'utf8')
  } catch {
    return defaults(root)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new VaultError(
      'CONFIG_INVALID',
      `${CONFIG_PATH} is not valid JSON.`,
    )
  }

  const result = vaultConfigSchema.safeParse({ ...defaults(root), ...(parsed as object) })

  if (!result.success) {
    throw new VaultError(
      'CONFIG_INVALID',
      `${CONFIG_PATH} is not a valid vault config.`,
    )
  }

  return result.data
}
