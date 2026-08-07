/**
 * Writes the contents of `scripts/seed-data.ts` into `$DEVVAULT_PATH` as real
 * Markdown files.
 *
 * This is the only writer in this spec, and it deliberately lives outside
 * `src/` — the app reads the vault, it does not seed it. It `git init`s nothing
 * and commits nothing; Git arrives in spec 4.
 *
 *   npm run seed            # refuses if the vault already has content
 *   npm run seed -- --force # overwrites
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { resolveInVault } from '@/lib/filesystem/paths'
import { writeTextFile } from '@/lib/filesystem/read-write'
import { serializeFrontmatter } from '@/lib/markdown/frontmatter'
import { collections, items } from './seed-data'
import {
  CONFIG_PATH,
  collectionFilePath,
  itemFilePath,
  vaultGitignore,
} from '@/lib/vault/layout'
import {
  itemBody,
  toCollectionFrontmatter,
  toItemFrontmatter,
} from '@/lib/vault/schema'
import { resolveVaultPath } from '@/lib/vault/config'

type SeedOptions = { force?: boolean }

/** Hidden entries do not count: seeding into a fresh `git init` is normal. */
const hasContent = async (root: string): Promise<boolean> => {
  const entries = await fs.readdir(root)
  return entries.some(entry => !entry.startsWith('.'))
}

export const seedVault = async (
  root: string,
  { force = false }: SeedOptions = {},
): Promise<string[]> => {
  if (!force && (await hasContent(root))) {
    throw new Error(
      'The vault already has content. Re-run with --force to overwrite it.',
    )
  }

  const written: string[] = []

  const write = async (relative: string, contents: string) => {
    await writeTextFile(root, relative, contents)
    written.push(relative)
  }

  for (const collection of collections) {
    const file = collectionFilePath(collection.id)

    await write(
      file,
      serializeFrontmatter(
        toCollectionFrontmatter(collection),
        collection.description ?? '',
      ),
    )

    // A collection's `updatedAt` is derived on read (§3.4): from its newest
    // member, or — for a collection with no members — from the file's own
    // mtime. Seeding writes every file "now", which would leave an empty
    // collection reading as the most recently updated thing in the vault.
    // Stamping the mtime is what makes the seeded vault reproduce the dates
    // the seed data describes, without storing `updatedAt` on disk.
    const stamp = new Date(collection.updatedAt)
    await fs.utimes(resolveInVault(root, file), stamp, stamp)
  }

  for (const item of items) {
    const fileName = 'fileName' in item ? item.fileName : undefined
    await write(
      itemFilePath(item.type, item.id, fileName),
      serializeFrontmatter(toItemFrontmatter(item), itemBody(item)),
    )
  }

  await write(
    CONFIG_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: path.basename(root),
        autoCommit: false,
        defaultBranch: 'main',
      },
      null,
      2,
    )}\n`,
  )

  // An allow-list: only DevVault's own content is trackable, so a `.DS_Store`
  // or a stray download never shows up as an uncommitted change.
  await write('.gitignore', vaultGitignore())

  return written
}

const main = async () => {
  const force = process.argv.includes('--force')
  const root = await resolveVaultPath()
  const written = await seedVault(root, { force })

  console.log(`Seeded ${written.length} files into the vault.`)
}

// Runs only when invoked as a script; the tests import `seedVault` directly.
if (process.argv[1]?.endsWith('seed-vault.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
