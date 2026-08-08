'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { VaultError } from '@/lib/errors'
import { GitError, describeForLog } from '@/lib/git/errors'
import { createGitService } from '@/lib/git/simple-git-service'
import type {
  ContinueOutcome,
  GitOperation,
  SyncOutcome,
} from '@/lib/git/types'
import { resolveVaultPath } from '@/lib/vault/config'
import { openInDefaultApp } from '@/lib/vault/open-external'
import {
  commitAll,
  createCollection as createCollectionMutation,
  createItem as createItemMutation,
  deleteCollection as deleteCollectionMutation,
  deleteItem as deleteItemMutation,
  setItemFlag,
  updateCollection as updateCollectionMutation,
  updateItem as updateItemMutation,
} from '@/lib/vault/mutations'
import type { Collection, Item } from '@/types/vault'

/**
 * Every mutation the UI can perform.
 *
 * The three things this layer owns, and nothing else — the domain logic lives
 * in `lib/vault/mutations.ts` so that the CLI can reuse it without a request:
 *
 * 1. **Validate at the boundary.** Server Action arguments arrive over the wire
 *    and are `unknown` however they are typed, so every one is parsed with Zod
 *    before it reaches anything that touches the disk.
 * 2. **Revalidate layout-scoped.** `GitSyncPanel` renders from `layout.tsx`, so
 *    a page-scoped revalidation would refresh the item lists and leave the
 *    dirty count stale (§6.2).
 * 3. **Map errors.** A `VaultError` or `GitError` carries a sentence written
 *    for a user; anything else becomes a generic one. Raw stderr, filesystem
 *    paths and stack traces stop here.
 */

/** The shape `coding-standards.md` specifies for every action. */
export type ActionResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; error: string; data?: never }

const ITEM_TYPES = [
  'snippet',
  'prompt',
  'note',
  'command',
  'file',
  'image',
  'url',
] as const

/**
 * Bounds on free text. Not security — `resolveInVault` and `slugify` handle
 * that — but a 10MB paste into a title would produce a file no one can read and
 * a commit subject nothing can display.
 */
const title = z.string().trim().min(1, 'A title is required.').max(200)
const description = z.string().trim().max(2_000).optional()
const content = z.string().max(1_000_000).optional()

const itemFields = {
  description,
  content,
  language: z.string().trim().max(50).optional(),
  url: z.url('That is not a valid URL.').optional(),
  fileName: z.string().trim().max(255).optional(),
  collectionIds: z.array(z.string().min(1)).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  favorite: z.boolean().optional(),
  pinned: z.boolean().optional(),
}

const createItemSchema = z.object({
  type: z.enum(ITEM_TYPES),
  title,
  ...itemFields,
})

const updateItemSchema = z.object({
  id: z.string().min(1),
  // `type` is absent by design: changing it would move the file between type
  // directories and change which fields are required, which is not an edit.
  title: title.optional(),
  ...itemFields,
})

const idSchema = z.object({ id: z.string().min(1) })

const flagSchema = z.object({ id: z.string().min(1), value: z.boolean() })

const createCollectionSchema = z.object({
  name: z.string().trim().min(1, 'A name is required.').max(200),
  description,
})

const updateCollectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  description,
})

const commitSchema = z.object({
  message: z.string().trim().min(1).max(500).optional(),
})

/**
 * Sync takes no arguments — what it does is decided entirely from the
 * repository's own state (§5.6), never from the client. The schema exists so it
 * goes through the same `action` wrapper as everything else rather than being
 * the one export that skips validation.
 */
const syncSchema = z.object({})

/**
 * A vault-relative path from the client, which is *untrusted* however it is
 * typed. `resolveInVault` is still the boundary that enforces this; the schema
 * rejects the obvious shapes early so a traversal attempt never reaches a
 * `git checkout` argument list.
 */
const vaultPath = z
  .string()
  .min(1)
  .max(1_000)
  .refine((value) => !value.startsWith('-'), {
    // A path beginning with `-` would be read by Git as a flag rather than a
    // pathspec. Every path DevVault writes is `<type-dir>/…`, so nothing
    // legitimate is lost.
    message: 'That is not a valid vault path.',
  })

const resolveConflictSchema = z.object({
  path: vaultPath,
  side: z.enum(['mine', 'theirs']),
})

const pathSchema = z.object({ path: vaultPath })

/**
 * The first Zod message, which `describeValidationError`'s counterpart in the
 * schema layer is not available for here — these are UI inputs, not files, and
 * the messages above are already written for a user.
 */
const firstIssue = (error: z.ZodError): string =>
  error.issues[0]?.message ?? 'That input is not valid.'

/**
 * Turns anything thrown below the action layer into one safe sentence.
 *
 * `VaultError` and `GitError` messages are written for users and are safe by
 * construction — that is what those classes are for. Everything else is an
 * unexpected failure whose message may name a path or a stack frame, so it is
 * logged server-side and replaced.
 */
const toUserMessage = (error: unknown, context: string): string => {
  if (error instanceof VaultError || error instanceof GitError) {
    return error.message
  }

  console.error(`[devvault] ${context} failed: ${describeForLog(error)}`)
  return 'Something went wrong saving to your vault. Check the server log for details.'
}

/**
 * The one place `revalidatePath` is called, so the layout scope cannot be got
 * wrong in one action and right in the others.
 */
const revalidateVault = (): void => {
  revalidatePath('/', 'layout')
}

/** Wraps a mutation in validation, revalidation and error mapping. */
const action = async <Input, Output>(
  context: string,
  schema: z.ZodType<Input>,
  input: unknown,
  run: (parsed: Input) => Promise<Output>,
): Promise<ActionResult<Output>> => {
  const parsed = schema.safeParse(input)

  if (!parsed.success) {
    return { success: false, error: firstIssue(parsed.error) }
  }

  try {
    const data = await run(parsed.data)
    revalidateVault()
    return { success: true, data }
  } catch (error) {
    return { success: false, error: toUserMessage(error, context) }
  }
}

// --- Items -----------------------------------------------------------------

export const createItem = async (
  input: unknown,
): Promise<ActionResult<Item>> =>
  action('createItem', createItemSchema, input, async (parsed) => {
    const { data } = await createItemMutation(parsed)
    return data
  })

export const updateItem = async (
  input: unknown,
): Promise<ActionResult<Item>> =>
  action('updateItem', updateItemSchema, input, async ({ id, ...patch }) => {
    const { data } = await updateItemMutation(id, patch)
    return data
  })

export const deleteItem = async (
  input: unknown,
): Promise<ActionResult<{ id: string }>> =>
  action('deleteItem', idSchema, input, async ({ id }) => {
    const { data } = await deleteItemMutation(id)
    return data
  })

export const toggleFavorite = async (
  input: unknown,
): Promise<ActionResult<Item>> =>
  action('toggleFavorite', flagSchema, input, async ({ id, value }) => {
    const { data } = await setItemFlag(id, 'favorite', value)
    return data
  })

export const togglePinned = async (
  input: unknown,
): Promise<ActionResult<Item>> =>
  action('togglePinned', flagSchema, input, async ({ id, value }) => {
    const { data } = await setItemFlag(id, 'pinned', value)
    return data
  })

// --- Collections -----------------------------------------------------------

export const createCollection = async (
  input: unknown,
): Promise<ActionResult<Collection>> =>
  action('createCollection', createCollectionSchema, input, async (parsed) => {
    const { data } = await createCollectionMutation(parsed)
    return data
  })

export const updateCollection = async (
  input: unknown,
): Promise<ActionResult<Collection>> =>
  action(
    'updateCollection',
    updateCollectionSchema,
    input,
    async ({ id, ...patch }) => {
      const { data } = await updateCollectionMutation(id, patch)
      return data
    },
  )

export const deleteCollection = async (
  input: unknown,
): Promise<ActionResult<{ id: string; itemsUpdated: number }>> =>
  action('deleteCollection', idSchema, input, async ({ id }) => {
    const { data } = await deleteCollectionMutation(id)
    return data
  })

// --- Git -------------------------------------------------------------------

/**
 * Commits every uncommitted vault-managed change (§7.2).
 *
 * `message` is optional and unused by the sidebar button, which lets
 * `commit-message.ts` build one — the drawer screenshot offers a single
 * **Commit changes** control with no message field, and that is the model.
 * The parameter exists because the CLI (todo phase 4) will want to pass one.
 */
export const commitChanges = async (
  input: unknown = {},
): Promise<ActionResult<{ hash: string; files: number }>> =>
  action('commitChanges', commitSchema, input, ({ message }) =>
    commitAll(message),
  )

/**
 * Fetches, works out what state the repository is in, and pulls or pushes
 * accordingly (§5.6). Never a blind `git pull`.
 *
 * Revalidation is unconditional rather than gated on "did the working tree
 * change", which `action` gives for free. A pull and a rebase both rewrite item
 * files, and `up-to-date` re-rendering costs one vault read on a page that is
 * `force-dynamic` anyway — whereas an outcome that changed the disk and did
 * *not* revalidate would leave the app showing items that no longer exist.
 *
 * Queueing happens a layer down: `sync` goes through the same write queue as
 * every mutation (§5.9), which is what stops a sync and a commit colliding on
 * `.git/index.lock`.
 *
 * There is deliberately no `checkRepository` guard here. It reads well, but a
 * vault that is not a repository already fails at `sync`'s first Git call and
 * `toGitError` classifies it to the same §7.6 sentence — verified by removing
 * the guard and watching the test still pass. Keeping it would have meant three
 * extra subprocesses on every sync to produce an outcome that was identical.
 */
export const syncVault = async (
  input: unknown = {},
): Promise<ActionResult<SyncOutcome>> =>
  action('syncVault', syncSchema, input, async () =>
    createGitService(await resolveVaultPath()).sync(),
  )

// --- Conflicts -------------------------------------------------------------

/**
 * Resolves one conflicted file to one side and stages it (§5.7).
 *
 * `side` is `'mine' | 'theirs'` — the user's words, not Git's. Which of
 * `--ours`/`--theirs` that becomes depends on what the repository is doing, and
 * only `lib/git/conflict-sides.ts` decides; nothing above the service layer is
 * allowed an opinion, because being wrong here destroys the user's work
 * silently.
 *
 * Returns how many files are still conflicted, so the dialog can enable its
 * footer without a second round trip.
 */
export const resolveConflict = async (
  input: unknown,
): Promise<ActionResult<{ remaining: number }>> =>
  action('resolveConflict', resolveConflictSchema, input, async ({ path, side }) => {
    const git = createGitService(await resolveVaultPath())

    await git.resolve(path, side)

    return { remaining: (await git.status()).conflicted.length }
  })

/**
 * Finishes what the vault is suspended in, once nothing is conflicted.
 *
 * The service refuses while any file remains in conflict, so this cannot half
 * complete a rebase — and `nothing-to-continue` is a success, not a failure: a
 * failed autostash restore leaves no operation to continue, only staged files
 * for the ordinary Commit button to pick up.
 */
export const completeMerge = async (
  input: unknown = {},
): Promise<ActionResult<ContinueOutcome>> =>
  action('completeMerge', syncSchema, input, async () =>
    createGitService(await resolveVaultPath()).continueOperation(),
  )

/**
 * Throws the whole operation away and returns the vault to where it started,
 * local commits intact.
 *
 * `null` back means there was nothing in progress to abort. The UI does not
 * offer the control in that state, so reaching this is a race — someone
 * finished the rebase in a terminal — and reporting it honestly is better than
 * inventing an abort that would discard the user's uncommitted edits instead.
 */
export const abortMerge = async (
  input: unknown = {},
): Promise<ActionResult<{ operation: GitOperation | null }>> =>
  action('abortMerge', syncSchema, input, async () => ({
    operation: await createGitService(await resolveVaultPath()).abortOperation(),
  }))

/**
 * Hands a vault file to the OS default application (the spec's third conflict
 * action).
 *
 * A browser cannot follow a `file://` link from an `http://` page, so this is
 * the only way to offer it. The client sends a vault-relative path and gets
 * nothing back — the absolute path never leaves the server.
 */
export const openInEditor = async (
  input: unknown,
): Promise<ActionResult<{ path: string }>> =>
  action('openInEditor', pathSchema, input, async ({ path }) => {
    await openInDefaultApp(await resolveVaultPath(), path)
    return { path }
  })
