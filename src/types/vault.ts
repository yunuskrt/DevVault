/**
 * The vault's domain types. Kept apart from `mock-data.ts` so that replacing
 * mock arrays with filesystem reads changes one module rather than every
 * module that names an `Item` or a `Collection`.
 */

export type ItemTypeId =
  | 'snippet'
  | 'prompt'
  | 'note'
  | 'command'
  | 'file'
  | 'image'
  | 'url'

export type ItemType = {
  id: ItemTypeId
  label: string
}

/** Pinning and favouriting are item-only concepts; collections carry neither. */
export type Collection = {
  id: string
  name: string
  description?: string
  updatedAt: string
}

/** Everything every item carries, regardless of type. */
type ItemBase = {
  id: string
  title: string
  description?: string
  /** An item can belong to any number of collections, including none. */
  collectionIds: string[]
  tags: string[]
  favorite: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/** Code carries its source and the language it is highlighted as. */
type CodeItem = ItemBase & {
  type: 'snippet' | 'command'
  content: string
  language: string
}

/** Prose carries content with no language to highlight. */
type TextItem = ItemBase & {
  type: 'prompt' | 'note'
  content: string
}

type UrlItem = ItemBase & {
  type: 'url'
  url: string
}

type ImageItem = ItemBase & {
  type: 'image'
  fileName: string
}

/** A stored file; text-based ones also carry their content for copy/preview. */
type FileItem = ItemBase & {
  type: 'file'
  fileName: string
  content?: string
  language?: string
}

/**
 * Discriminated on `type` so a type's payload is compiler-enforced: a url item
 * cannot be written without a `url`, nor a snippet without `content`. This is
 * the shape the YAML frontmatter parser will have to validate against once
 * items are read from the vault.
 */
export type Item = CodeItem | TextItem | UrlItem | ImageItem | FileItem
