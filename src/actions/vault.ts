'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { VaultError } from '@/lib/errors'
import { GitError, describeForLog } from '@/lib/git/errors'
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
