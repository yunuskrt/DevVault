/**
 * Commit messages, in the format `coding-standards.md` specifies:
 *
 *     Add note: Docker networking
 *     Update snippet: pandas filter
 *     Delete prompt: code review
 *
 * A separate module — and one that imports nothing — because the CLI (todo
 * phase 4) commits too, and `devvault sync` writing its own wording would leave
 * a vault's history reading as though two different tools maintained it.
 *
 * No `server-only` guard: this is string formatting, and keeping it importable
 * from anywhere means the commit UI can show the message it is about to write.
 */

import { pluralize } from '@/lib/format'
import type { ItemTypeId } from '@/types/vault'

export type CommitVerb = 'Add' | 'Update' | 'Delete'

/** What the `{type}` slot holds. Item types, plus collections. */
export type CommitSubject = ItemTypeId | 'collection'

/**
 * Git's own convention is a subject line under ~50 characters. A long item
 * title is truncated rather than wrapped, so `git log --oneline` stays
 * readable; the item's own file carries the full title, so nothing is lost.
 */
const MAX_TITLE = 60

const truncate = (title: string): string =>
  title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`

/**
 * The single-record message. `title` is used verbatim apart from truncation —
 * collapsing whitespace matters because a newline in the subject would turn the
 * rest of the title into the commit body.
 */
export const buildCommitMessage = (
  verb: CommitVerb,
  subject: CommitSubject,
  title: string,
): string => `${verb} ${subject}: ${truncate(title.replace(/\s+/g, ' ').trim())}`

/**
 * The message for a commit covering several files at once — the sidebar's
 * Commit button, and an `autoCommit` burst that debounced into one commit.
 *
 * "files" rather than the spec's illustrative "items": the staged set can hold
 * collection files and `.devvault/config.json` alongside items, so counting
 * three items and a collection as "4 items" would be wrong. The count is of
 * paths, so the noun should be too.
 */
export const buildBatchCommitMessage = (fileCount: number): string =>
  `Update vault: ${pluralize(fileCount, 'file')}`
