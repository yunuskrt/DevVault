import type { ItemTypeId } from '@/types/vault'

/**
 * Where each kind of record lives on disk (architecture §3.1). The reader and
 * the seed script both need this map, and they must never disagree — a file's
 * directory is derived from its `type`, and the reader treats a mismatch
 * between the two as a vault error rather than trusting one over the other.
 */

export const COLLECTIONS_DIR = 'collections'

export const CONFIG_PATH = '.devvault/config.json'

/** Note the one name that is not the plural of its type: `url` → `links/`. */
export const TYPE_DIRECTORIES: Record<ItemTypeId, string> = {
  snippet: 'snippets',
  prompt: 'prompts',
  note: 'notes',
  command: 'commands',
  file: 'files',
  image: 'images',
  url: 'links',
}

const DIRECTORY_TYPES: Record<string, ItemTypeId> = Object.fromEntries(
  Object.entries(TYPE_DIRECTORIES).map(([type, dir]) => [dir, type as ItemTypeId]),
)

/** The first segment of a vault-relative path, or `''` for a root-level file. */
export const topLevelDirectory = (relative: string): string => {
  const slash = relative.indexOf('/')
  return slash === -1 ? '' : relative.slice(0, slash)
}

/**
 * The item type a path's directory implies, or `undefined` if it is not under a
 * type directory at all. Nested directories are fine (`snippets/react/…`) —
 * only the first segment carries meaning, the rest is the user's own filing.
 */
export const typeForPath = (relative: string): ItemTypeId | undefined =>
  DIRECTORY_TYPES[topLevelDirectory(relative)]

/**
 * Binary items (`image`, `file`) store metadata in a sidecar beside the asset:
 * `images/diagram.png` is described by `images/diagram.png.md`. Everything else
 * is a plain `<id>.md`.
 */
export const itemFilePath = (
  type: ItemTypeId,
  id: string,
  fileName?: string,
): string => {
  const dir = TYPE_DIRECTORIES[type]
  const base = (type === 'image' || type === 'file') && fileName ? fileName : id
  return `${dir}/${base}.md`
}

export const collectionFilePath = (id: string): string =>
  `${COLLECTIONS_DIR}/${id}.md`

/** DevVault's own files, which live outside the content directories. */
const MANAGED_FILES = new Set([CONFIG_PATH, '.gitignore'])

/**
 * Whether DevVault put this path there, and may therefore stage it.
 *
 * §5.4 forbids `git add -A` because the vault is the *user's* repository and
 * may hold anything else they keep in it. This is the predicate that replaces
 * it: the sidebar's Commit button stages every dirty path this returns true
 * for, so a scratch file or an unrelated directory sitting in the vault is
 * left for the user to commit themselves.
 */
export const isVaultManagedPath = (relative: string): boolean =>
  MANAGED_FILES.has(relative) ||
  topLevelDirectory(relative) === COLLECTIONS_DIR ||
  typeForPath(relative) !== undefined

/**
 * OS and editor droppings. These are ignored *inside* the content directories
 * too, which the root allow-list below cannot reach on its own — `notes/` is
 * re-included wholesale, so a `notes/.DS_Store` would otherwise be tracked.
 */
const NOISE_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.swp',
  '*.swo',
  '*~',
]

/**
 * The root entries the allow-list re-includes, as Git needs them stated.
 *
 * A managed file nested in a directory contributes its *directory*, not itself:
 * `/*` excludes `.devvault` as a directory, and Git cannot re-include a file
 * whose parent is excluded — it never descends far enough to see it. So
 * `!/.devvault/config.json` silently does nothing, and `!/.devvault/` is what
 * actually works. `.devvault/cache/` is re-ignored afterwards.
 */
const rootAllowlist = (): string[] => {
  const entries = new Set<string>()

  for (const file of MANAGED_FILES) {
    const directory = topLevelDirectory(file)
    entries.add(directory ? `${directory}/` : file)
  }

  for (const directory of [COLLECTIONS_DIR, ...Object.values(TYPE_DIRECTORIES)]) {
    entries.add(`${directory}/`)
  }

  return [...entries].sort()
}

/**
 * The vault's `.gitignore`, as an allow-list.
 *
 * Everything in the vault directory is ignored except what DevVault owns, so a
 * file the user did not mean to version — a `.DS_Store`, a download, a scratch
 * directory — never appears as an uncommitted change and can never be swept
 * into a commit DevVault labelled.
 *
 * **Generated from the same constants as `isVaultManagedPath`** rather than
 * written out by hand. The two answer the same question, and a new item type
 * added to `TYPE_DIRECTORIES` would otherwise land in a directory Git ignores
 * — items that save correctly, show up in the app, and silently never commit.
 *
 * Note this cannot untrack anything: `.gitignore` only affects files Git is
 * not already tracking, so an existing repository keeps everything in it.
 */
export const vaultGitignore = (): string =>
  [
    '# DevVault vault repository.',
    '#',
    "# Everything is ignored except DevVault's own content, so a stray file",
    '# cannot end up in a commit DevVault labelled. Generated by `devvault`;',
    '# mirrors `isVaultManagedPath` in the app.',
    '',
    '# Ignore everything at the root...',
    '/*',
    '',
    "# ...except DevVault's own files and directories.",
    ...rootAllowlist().map((entry) => `!/${entry}`),
    '',
    '# Derived state, not content. Re-ignored after the rule above.',
    '.devvault/cache/',
    '',
    '# OS and editor noise, including inside the directories above.',
    ...NOISE_PATTERNS,
    '',
  ].join('\n')
