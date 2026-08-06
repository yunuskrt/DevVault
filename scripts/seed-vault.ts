/**
 * Writes the contents of `src/lib/mock-data.ts` into `$DEVVAULT_PATH` as real
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

import { writeTextFile } from '@/lib/filesystem/read-write'
import { serializeFrontmatter } from '@/lib/markdown/frontmatter'
import { collections, items } from '@/lib/mock-data'
import {
  CONFIG_PATH,
  collectionFilePath,
  itemFilePath,
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
    await write(
      collectionFilePath(collection.id),
      serializeFrontmatter(
        toCollectionFrontmatter(collection),
        collection.description ?? '',
      ),
    )
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

  // Derived state only; the vault's content is all committed.
  await write('.gitignore', '.devvault/cache/\n')

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
