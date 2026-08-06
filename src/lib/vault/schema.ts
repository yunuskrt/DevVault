import { z } from 'zod'

import type { Collection, Item } from '@/types/vault'

/**
 * Runtime validation for everything read off disk.
 *
 * **This file and `src/types/vault.ts` are two views of one shape.** That file
 * is the compile-time union; this one is the runtime validator a hand-edited
 * Markdown file has to satisfy. `itemFrontmatterSchema` is a
 * `z.discriminatedUnion('type', …)` with the same five members as the `Item`
 * union, discriminated on the same field. Edit one and you must edit the other
 * — `toItem` below is where the drift would show up as a type error.
 *
 * Two things the frontmatter does *not* carry, and why:
 * - `content` is the Markdown body, not a frontmatter key, so that a snippet
 *   reads as a code block on GitHub instead of as a quoted YAML string.
 * - A collection's `updatedAt` is derived from its members (§3.4), so storing
 *   it would mean every item save also rewrote its collections' files.
 */

/** The frontmatter key is `collections`; the TypeScript field is `collectionIds`. */
const itemBase = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  collections: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  favorite: z.boolean().default(false),
  pinned: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const itemFrontmatterSchema = z.discriminatedUnion('type', [
  itemBase.extend({
    type: z.enum(['snippet', 'command']),
    language: z.string().min(1),
  }),
  itemBase.extend({ type: z.enum(['prompt', 'note']) }),
  itemBase.extend({ type: z.literal('url'), url: z.url() }),
  itemBase.extend({ type: z.literal('image'), fileName: z.string().min(1) }),
  itemBase.extend({
    type: z.literal('file'),
    fileName: z.string().min(1),
    language: z.string().min(1).optional(),
  }),
])

export type ItemFrontmatter = z.infer<typeof itemFrontmatterSchema>

export const collectionFrontmatterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

export type CollectionFrontmatter = z.infer<typeof collectionFrontmatterSchema>

export const vaultConfigSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  autoCommit: z.boolean(),
  defaultBranch: z.string().min(1),
})

/**
 * Frontmatter plus body into the domain type. The `collections` → `collectionIds`
 * rename lives here rather than in the reader so that callers never see the
 * on-disk key at all.
 */
export const toItem = (frontmatter: ItemFrontmatter, body: string): Item => {
  const { collections, ...rest } = frontmatter
  const base = { ...rest, collectionIds: collections }

  switch (base.type) {
    case 'snippet':
    case 'command':
    case 'prompt':
    case 'note':
      return { ...base, content: body }
    case 'url':
    case 'image':
      return base
    case 'file':
      // A binary file has no text body; only text-based ones carry content.
      return body ? { ...base, content: body } : base
  }
}

export const toCollection = (
  frontmatter: CollectionFrontmatter,
  body: string,
  updatedAt: string,
): Collection => ({
  id: frontmatter.id,
  name: frontmatter.name,
  ...(body ? { description: body } : {}),
  updatedAt,
})

/**
 * The canonical frontmatter key order (§3.3). Stable order is what keeps a save
 * that changed one field from rewriting the whole block, so this is the single
 * place it is decided — the serializer preserves whatever order it is handed.
 *
 * Falsy flags, empty lists and absent optionals are omitted rather than written
 * as `favorite: false` / `tags: []`. The schema defaults them back on read, and
 * the file stays legible to a human reading it on GitHub.
 */
export const toItemFrontmatter = (item: Item): Record<string, unknown> => {
  const payload: Record<string, unknown> = {}

  if (item.type === 'url') payload.url = item.url
  if (item.type === 'image' || item.type === 'file') {
    payload.fileName = item.fileName
  }
  if ('language' in item && item.language) payload.language = item.language

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    collections: item.collectionIds.length ? item.collectionIds : undefined,
    tags: item.tags.length ? item.tags : undefined,
    ...payload,
    favorite: item.favorite || undefined,
    pinned: item.pinned || undefined,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export const toCollectionFrontmatter = (
  collection: Collection,
): Record<string, unknown> => ({
  id: collection.id,
  name: collection.name,
})

/** The body an item serializes to — `undefined` content writes an empty body. */
export const itemBody = (item: Item): string =>
  'content' in item && item.content ? item.content : ''

/**
 * Turns a Zod failure into something a user can act on. A raw
 * `error.issues` dump names internal union branches and reads as a stack trace;
 * "`type` is missing" tells someone what to type into the file.
 */
export const describeValidationError = (error: z.ZodError): string => {
  const seen = new Set<string>()

  for (const issue of error.issues) {
    const field = issue.path.join('.')
    const label = field ? `\`${field}\`` : 'frontmatter'

    if (issue.code === 'invalid_type' && issue.input === undefined) {
      seen.add(`${label} is missing`)
    } else if (issue.code === 'invalid_union' && !field) {
      // A discriminated union rejects the whole object when `type` is absent
      // or names something that is not an item type.
      seen.add('`type` is missing or is not a known item type')
    } else {
      seen.add(`${label} ${issue.message.toLowerCase()}`)
    }
  }

  return [...seen].join('; ')
}
