import 'server-only'

import { VaultError } from '@/lib/errors'
import {
  buildBatchCommitMessage,
  buildCommitMessage,
} from '@/lib/git/commit-message'
import { GitError } from '@/lib/git/errors'
import { createGitService, checkRepository } from '@/lib/git/simple-git-service'
import type { GitService } from '@/lib/git/types'
import { readVaultConfig, resolveVaultPath } from '@/lib/vault/config'
import { isVaultManagedPath } from '@/lib/vault/layout'
import { readVault } from '@/lib/vault/reader'
import {
  describeValidationError,
  itemBody,
  itemFrontmatterSchema,
  toItem,
  toItemFrontmatter,
} from '@/lib/vault/schema'
import {
  deleteFiles,
  moveFile,
  newItemPath,
  renamedItemPath,
  serializeItem,
  uniqueSlug,
  vaultFileExists,
  writeCollection,
  writeItem,
} from '@/lib/vault/writer'
import type { Collection, Item, ItemTypeId } from '@/types/vault'

/**
 * The domain operations: create, update and delete a record, and commit.
 *
 * This is the layer that knows the *order* things happen in, which is the whole
 * of §7.2's write-through model: **the file is written first and
 * unconditionally**, and only then is Git told. A Git failure therefore never
 * costs the user their edit — the worst case is a file on disk that is not yet
 * committed, which is a state the panel already renders.
 *
 * It sits between `writer.ts` (filesystem, no Git) and `src/actions/vault.ts`
 * (validation, `revalidatePath`, error mapping). Keeping it out of the actions
 * file is what makes it testable without a request, and what will let the CLI
 * reuse it (todo phase 4).
 */

/** Everything a mutation did, for the caller to report and revalidate on. */
export type MutationResult<T> = {
  data: T
  /** Vault-relative paths this mutation created, changed or removed. */
  paths: string[]
  /** Set when `autoCommit` was on and the commit has already happened. */
  commit: { hash: string } | null
}

const nowIso = (): string => new Date().toISOString()

/**
 * The vault root plus a Git service, or `null` when the vault is not a
 * repository.
 *
 * A vault that has never been `git init`ed is a supported state — spec 3 shipped
 * with exactly that — so every Git step below is conditional. The alternative,
 * refusing to save until the user runs `git init`, would make DevVault less
 * useful than a folder of Markdown.
 */
const openVault = async (): Promise<{ root: string; git: GitService | null }> => {
  const root = await resolveVaultPath()
  const { isRepo } = await checkRepository(root)

  return { root, git: isRepo ? createGitService(root) : null }
}

/**
 * Round-trips a candidate through the on-disk schema.
 *
 * Serializing to frontmatter, validating that, and parsing it back is what
 * makes "anything written can be read back identically" true by construction
 * rather than by inspection — the exact property verification item 1 asks for.
 * It also catches an incoherent record (a snippet with no `language`) before it
 * reaches the disk instead of after, when it would show up as a vault error.
 */
const validated = (candidate: Item): Item => {
  const parsed = itemFrontmatterSchema.safeParse(toItemFrontmatter(candidate))

  if (!parsed.success) {
    throw new VaultError(
      'ITEM_INVALID',
      `This item cannot be saved: ${describeValidationError(parsed.error)}.`,
    )
  }

  return toItem(parsed.data, itemBody(candidate))
}

/** Drops `undefined` values so a partial patch does not blank a field. */
const definedOnly = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>

// --- Git steps, each a no-op on a vault without a repository ---------------

/**
 * Stages paths, tolerating a vault with no repository.
 *
 * Staging on every write — rather than only at commit time — is what makes a
 * delete and a rename visible to Git as such. It costs one subprocess per
 * mutation and buys a correct `git status` at all times.
 */
const stage = async (git: GitService | null, paths: string[]): Promise<void> => {
  if (!git || paths.length === 0) return
  await git.stage(paths)
}

/**
 * Stages paths written by something other than a mutation — currently the
 * upload route, which writes an asset beside the sidecar `createItem` wrote.
 * Without this the asset would sit untracked while its sidecar was staged.
 */
export const stageVaultPaths = async (paths: string[]): Promise<void> => {
  if (paths.length === 0) return
  const { git } = await openVault()
  await stage(git, paths)
}

/**
 * `git rm` where possible, a plain delete otherwise (§5.4).
 *
 * `UNTRACKED_PATH` is the ordinary case for an item created and deleted without
 * an intervening commit, so it falls through to the filesystem rather than
 * surfacing. Any other Git failure propagates — a delete that half-happened is
 * worth hearing about.
 */
const removePaths = async (
  root: string,
  git: GitService | null,
  paths: string[],
): Promise<void> => {
  if (paths.length === 0) return

  if (!git) {
    await deleteFiles(root, paths)
    return
  }

  /*
   * One path at a time, deliberately. `git rm` is all-or-nothing: handed a
   * batch containing a single untracked path it refuses the whole set, which
   * would drop a *tracked* sibling back to the filesystem fallback and leave
   * its deletion unstaged. A binary item is exactly that mixed batch — a
   * tracked sidecar beside an asset that may never have been committed.
   */
  for (const path of paths) {
    try {
      await git.remove([path])
    } catch (error) {
      if (!(error instanceof GitError && error.code === 'UNTRACKED_PATH')) {
        throw error
      }
      await deleteFiles(root, [path])
    }
  }
}

/**
 * `git mv` where possible, a plain rename otherwise.
 *
 * The point of preferring `git mv` is §3.2: an item's path changes when its
 * title does, and `log --follow` only keeps its history across the rename if
 * Git recorded it as one.
 */
const movePath = async (
  root: string,
  git: GitService | null,
  from: string,
  to: string,
): Promise<void> => {
  if (git) {
    try {
      await git.move(from, to)
      return
    } catch (error) {
      if (!(error instanceof GitError && error.code === 'UNTRACKED_PATH')) {
        throw error
      }
    }
  }

  await moveFile(root, from, to)
}

// --- autoCommit ------------------------------------------------------------

/** §7.2: long enough that a burst of edits becomes one commit. */
const AUTO_COMMIT_DEBOUNCE_MS = 5_000

type PendingAutoCommit = {
  timer: ReturnType<typeof setTimeout>
  /** One per mutation since the timer last fired, in order. */
  messages: string[]
}

const pending = new Map<string, PendingAutoCommit>()

/**
 * Commits after a quiet period, so five saves in a row become one commit rather
 * than five (§7.2).
 *
 * The debounce lives here rather than in a component because a component
 * unmounts on navigation and would drop the pending commit on the floor.
 *
 * Deliberately fire-and-forget: the mutation has already written the file and
 * returned, and the user is not waiting on this. That means no `revalidatePath`
 * — there is no request to revalidate by the time it fires — so the panel picks
 * the commit up on the next navigation, which `force-dynamic` makes certain.
 */
const scheduleAutoCommit = (root: string, message: string): void => {
  const existing = pending.get(root)
  if (existing) clearTimeout(existing.timer)

  const messages = [...(existing?.messages ?? []), message]

  const timer = setTimeout(() => {
    pending.delete(root)

    void commitAll(
      // A burst has no single subject, so it falls back to the batch wording;
      // a lone edit keeps its specific `Add note: …` message.
      messages.length === 1 ? messages[0] : undefined,
    ).catch((error: unknown) => {
      console.error(
        `[devvault] autoCommit failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }, AUTO_COMMIT_DEBOUNCE_MS)

  // Without this a pending commit keeps the process alive, which hangs `next
  // build` and leaves Vitest waiting on a timer nobody is watching.
  timer.unref?.()

  pending.set(root, { timer, messages })
}

/** Test seam, and what a shutdown would call if DevVault ever had one. */
export const cancelPendingAutoCommits = (): void => {
  for (const { timer } of pending.values()) clearTimeout(timer)
  pending.clear()
}

/**
 * Runs after every mutation. Reads the config each time rather than caching it,
 * so toggling `autoCommit` in `.devvault/config.json` takes effect on the next
 * save instead of the next restart.
 */
const afterMutation = async (
  root: string,
  message: string,
): Promise<void> => {
  const { autoCommit } = await readVaultConfig(root)
  if (autoCommit) scheduleAutoCommit(root, message)
}

// --- Commit ----------------------------------------------------------------

/**
 * Stages every dirty vault-managed path and commits them.
 *
 * This is what the sidebar's Commit button calls, so it commits what the panel
 * counted — including files the user hand-edited in their own editor, which is
 * the Git-native promise. `isVaultManagedPath` is what keeps that from becoming
 * `git add -A`: anything else in the user's repository is left alone.
 */
export const commitAll = async (
  message?: string,
): Promise<{ hash: string; files: number }> => {
  const { root, git } = await openVault()

  if (!git) {
    throw new GitError(
      'NOT_A_REPOSITORY',
      'This vault is not a Git repository yet. Run `git init` inside it to start versioning your items.',
    )
  }

  const status = await git.status()

  const paths = [
    ...new Set([
      ...status.staged,
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.untracked,
      // A rename lands in none of the arrays above (§3.2 makes these routine —
      // a title edit renames the file), so without this a vault whose only
      // pending change was a renamed item would report nothing to commit.
      // The destination only: the source is already recorded by `git mv`, and
      // it no longer exists for `git add` to be asked about.
      ...status.renamed.map((rename) => rename.to),
    ]),
  ].filter(isVaultManagedPath)

  if (paths.length === 0) {
    throw new GitError(
      'NOTHING_TO_COMMIT',
      'There is nothing to commit — the vault has no uncommitted changes.',
    )
  }

  /*
   * A path that is already staged *and* no longer on disk — a deletion recorded
   * by `git rm` — must not be handed to `git add`. It is in neither the working
   * tree nor the index, so Git rejects the whole command with "pathspec did not
   * match any files", which would make Commit fail outright whenever the
   * pending changes included a deleted item.
   *
   * It also needs no staging: `git rm` already put it in the index. Everything
   * else does, including an *unstaged* deletion, where `git add` is what
   * records it.
   */
  const alreadyStaged = new Set(status.staged)
  const toStage: string[] = []

  for (const path of paths) {
    if (alreadyStaged.has(path) && !(await vaultFileExists(root, path))) continue
    toStage.push(path)
  }

  await git.stage(toStage)
  const { hash } = await git.commit(message ?? buildBatchCommitMessage(paths.length))

  // The count is of everything committed, not just what needed staging — it is
  // the number the panel showed, and the message the user will read.
  return { hash, files: paths.length }
}

// --- Items -----------------------------------------------------------------

/**
 * The fields a caller supplies. Identity and timestamps are ours to set.
 *
 * Flat and fully optional past `type` and `title` rather than derived from the
 * `Item` union, for two reasons. `Omit` over a union collapses to the keys its
 * members share, so a derived type would silently drop `content`, `language`,
 * `url` and `fileName` — the very fields that distinguish the members. And
 * input arrives from a form or a JSON body, where every field is optional until
 * something checks: `validated()` is that check, and it enforces the per-type
 * requirements at runtime where they can actually be violated.
 */
export type NewItemInput = {
  type: ItemTypeId
  title: string
  description?: string
  collectionIds?: string[]
  tags?: string[]
  favorite?: boolean
  pinned?: boolean
  content?: string
  language?: string
  url?: string
  fileName?: string
}

/** Every field an edit may touch. `type` is not one of them — see `updateItem`. */
export type ItemPatch = Partial<Omit<NewItemInput, 'type'>>

/**
 * Creates an item and writes its file.
 *
 * The `id` is `slugify(title)` with `-2`/`-3` on collision (§3.2) and never
 * changes again. "Collision" here means either an id already in use *or* a file
 * already at the path that id implies — an item whose file was renamed can leave
 * its old slug free while its path is occupied by something else.
 */
export const createItem = async (
  input: NewItemInput,
): Promise<MutationResult<Item>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const ids = new Set(vault.items.map((item) => item.id))
  const paths = new Set(vault.itemPaths.values())
  const { fileName } = input

  /*
   * A binary item's file is named for its asset, not its slug (§3.5), so its
   * path does not vary with the candidate id. That has to be checked *once*,
   * before the slug loop: folding it into the predicate below would make
   * `taken` true for every candidate a bumped suffix could ever produce, and
   * `uniqueSlug` would spin forever — a synchronous loop that blocks the event
   * loop, taking the whole server with it rather than failing one request.
   *
   * The upload route avoids ever reaching this by uniquifying the asset name
   * first, but `createItem` is exported and the CLI and the phase 2b UI will
   * both call it directly.
   */
  const isBinary = input.type === 'image' || input.type === 'file'

  if (isBinary && paths.has(newItemPath(input.type, '', fileName))) {
    throw new VaultError(
      'ITEM_EXISTS',
      `An item already describes the file \`${fileName}\`. Rename the file, or edit the existing item.`,
    )
  }

  const id = uniqueSlug(
    input.title,
    (candidate) =>
      ids.has(candidate) ||
      (!isBinary && paths.has(newItemPath(input.type, candidate, fileName))),
  )

  const timestamp = nowIso()

  const item = validated({
    collectionIds: [],
    tags: [],
    favorite: false,
    pinned: false,
    ...definedOnly(input),
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  } as Item)

  const path = newItemPath(item.type, id, fileName)

  await writeItem(root, item, path)
  await stage(git, [path])

  const message = buildCommitMessage('Add', item.type, item.title)
  await afterMutation(root, message)

  return { data: item, paths: [path], commit: null }
}

/**
 * Applies a patch to an existing item.
 *
 * **An unchanged item is not rewritten.** The comparison is between the two
 * items' serialized forms rather than against the file, so it holds even if the
 * file on disk was hand-edited into a different key order — and it is what
 * makes `git diff` empty after a no-op save, the end-to-end proof of spec 1's
 * stable serialization.
 *
 * `type` is deliberately not patchable: changing it would move the file between
 * type directories and change which fields are required, which is a different
 * operation from an edit.
 */
export const updateItem = async (
  id: string,
  patch: ItemPatch,
): Promise<MutationResult<Item>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const current = vault.items.find((item) => item.id === id)
  const currentPath = vault.itemPaths.get(id)

  if (!current || !currentPath) {
    throw new VaultError('ITEM_NOT_FOUND', 'That item no longer exists.')
  }

  const candidate = validated({
    ...current,
    ...definedOnly(patch),
    id: current.id,
    type: current.type,
    createdAt: current.createdAt,
  } as Item)

  const inUse = new Set(vault.itemPaths.values())
  const nextPath = renamedItemPath(candidate, currentPath, (path) =>
    inUse.has(path),
  )

  if (serializeItem(candidate) === serializeItem(current) && !nextPath) {
    // Nothing changed. Touching the file would bump `updatedAt` and produce a
    // diff, which is exactly what the write-through model must not do.
    return { data: current, paths: [], commit: null }
  }

  const item = validated({ ...candidate, updatedAt: nowIso() } as Item)

  // The move happens first so the write lands on the file Git is now tracking;
  // the other order leaves the old path holding the new content.
  if (nextPath) await movePath(root, git, currentPath, nextPath)

  const path = nextPath ?? currentPath
  await writeItem(root, item, path)

  /*
   * Only the new path is staged, never the old one. `git mv` has already
   * recorded the source's deletion in the index, and staging a path that no
   * longer exists on disk fails with "pathspec did not match any files" — so
   * adding both would turn every successful rename into an error. In the
   * fallback case the source was untracked, so there is nothing to record for
   * it either. Both paths are still *reported*, because both changed on disk.
   */
  await stage(git, [path])

  const touched = nextPath ? [currentPath, nextPath] : [path]

  await afterMutation(root, buildCommitMessage('Update', item.type, item.title))

  return { data: item, paths: touched, commit: null }
}

/**
 * Deletes an item, and for a binary item its asset alongside the sidecar —
 * leaving the asset behind would orphan a file nothing references (§3.5).
 */
export const deleteItem = async (
  id: string,
): Promise<MutationResult<{ id: string }>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const item = vault.items.find((entry) => entry.id === id)
  const path = vault.itemPaths.get(id)

  if (!item || !path) {
    throw new VaultError('ITEM_NOT_FOUND', 'That item no longer exists.')
  }

  // `images/diagram.png.md` describes `images/diagram.png`.
  const assetPath =
    (item.type === 'image' || item.type === 'file') && path.endsWith('.md')
      ? path.slice(0, -'.md'.length)
      : null

  const paths = assetPath ? [path, assetPath] : [path]

  await removePaths(root, git, paths)
  await afterMutation(root, buildCommitMessage('Delete', item.type, item.title))

  return { data: { id }, paths, commit: null }
}

/**
 * Sets an item's favorite or pinned flag.
 *
 * Takes the value rather than flipping what it finds: two clicks racing each
 * other then settle on what the user last asked for instead of on whichever
 * request read the file second.
 */
export const setItemFlag = async (
  id: string,
  flag: 'favorite' | 'pinned',
  value: boolean,
): Promise<MutationResult<Item>> => updateItem(id, { [flag]: value })

// --- Collections -----------------------------------------------------------

export type NewCollectionInput = { name: string; description?: string }

export const createCollection = async (
  input: NewCollectionInput,
): Promise<MutationResult<Collection>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const ids = new Set(vault.collections.map((collection) => collection.id))
  const id = uniqueSlug(input.name, (candidate) => ids.has(candidate))

  const collection: Collection = {
    id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    // Derived from members on read (§3.4) and never stored; this value only
    // exists to satisfy the type and is discarded by the next read.
    updatedAt: nowIso(),
  }

  const path = await writeCollection(root, collection)
  await stage(git, [path])
  await afterMutation(root, buildCommitMessage('Add', 'collection', collection.name))

  return { data: collection, paths: [path], commit: null }
}

export const updateCollection = async (
  id: string,
  patch: { name?: string; description?: string },
): Promise<MutationResult<Collection>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const current = vault.collections.find((collection) => collection.id === id)
  const currentPath = vault.collectionPaths.get(id)

  if (!current || !currentPath) {
    throw new VaultError(
      'COLLECTION_NOT_FOUND',
      'That collection no longer exists.',
    )
  }

  const collection: Collection = { ...current, ...definedOnly(patch) }

  // A collection's file is named for its id, which never changes, so unlike an
  // item there is no rename to consider — only whether anything differs.
  if (
    collection.name === current.name &&
    collection.description === current.description
  ) {
    return { data: current, paths: [], commit: null }
  }

  const path = await writeCollection(root, collection, currentPath)
  await stage(git, [path])
  await afterMutation(
    root,
    buildCommitMessage('Update', 'collection', collection.name),
  )

  return { data: collection, paths: [path], commit: null }
}

/**
 * Deletes a collection's file and drops its id from every member item.
 *
 * Membership lives on the item (§3.4), so deleting only the collection file
 * would leave items pointing at an id that resolves to nothing. Each affected
 * item is rewritten, which is why this returns more paths than it was asked
 * about.
 */
export const deleteCollection = async (
  id: string,
): Promise<MutationResult<{ id: string; itemsUpdated: number }>> => {
  const { root, git } = await openVault()
  const vault = await readVault(root)

  const collection = vault.collections.find((entry) => entry.id === id)
  const path = vault.collectionPaths.get(id)

  if (!collection || !path) {
    throw new VaultError(
      'COLLECTION_NOT_FOUND',
      'That collection no longer exists.',
    )
  }

  const members = vault.items.filter((item) => item.collectionIds.includes(id))
  const updatedPaths: string[] = []

  for (const member of members) {
    const memberPath = vault.itemPaths.get(member.id)
    if (!memberPath) continue

    const next = validated({
      ...member,
      collectionIds: member.collectionIds.filter((entry) => entry !== id),
      updatedAt: nowIso(),
    } as Item)

    await writeItem(root, next, memberPath)
    updatedPaths.push(memberPath)
  }

  await removePaths(root, git, [path])
  await stage(git, updatedPaths)
  await afterMutation(
    root,
    buildCommitMessage('Delete', 'collection', collection.name),
  )

  return {
    data: { id, itemsUpdated: members.length },
    paths: [path, ...updatedPaths],
    commit: null,
  }
}
