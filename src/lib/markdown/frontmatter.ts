import { Document, parse, visit } from 'yaml'

/**
 * Markdown-with-YAML-frontmatter, parsed and serialized.
 *
 * The library is `yaml` (maintained, current) rather than `gray-matter`, which
 * has not been published since 2021 and bundles a js-yaml v3 five years stale.
 * `gray-matter` is a thin convenience over exactly the code below.
 *
 * **Serialization is stable and that is the point of this module.** A vault is
 * only worth keeping in Git if its diffs are readable, and an unchanged item
 * that re-serializes with different key order, different quoting or a folded
 * line produces a diff on every save. `serializeFrontmatter(parseFrontmatter(f))`
 * must return `f` byte for byte; there is a test that asserts exactly that over
 * every seeded file.
 */

export type ParsedFile = {
  /** Unvalidated — hand it to a Zod schema before trusting a single field. */
  data: unknown
  body: string
}

/**
 * The optional group lets an empty block (`---\n---`) parse. `^` is
 * string-start here (no `m` flag), so a `---` rule further down the body is
 * never mistaken for an opening delimiter.
 */
const FRONTMATTER = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A file with no `---` block is all body. That is not an error. */
export const parseFrontmatter = (raw: string): ParsedFile => {
  const match = FRONTMATTER.exec(raw)
  if (!match) return { data: {}, body: raw }

  const yamlText = match[1] ?? ''
  const parsed = yamlText.trim() === '' ? {} : parse(yamlText)

  return {
    data: isRecord(parsed) ? parsed : {},
    // Strips the single blank line the serializer puts after the block, and any
    // trailing whitespace, so the body is exactly what the serializer re-emits.
    body: raw.slice(match[0].length).replace(/^\n/, '').replace(/\s+$/, ''),
  }
}

/** Drops keys whose value is `undefined` so they do not serialize as `null`. */
const withoutUndefined = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  )

/**
 * Key order is the caller's — `toItemFrontmatter` in `vault/schema.ts` owns the
 * canonical order, because which keys an item has is a schema question, not a
 * Markdown one.
 */
export const serializeFrontmatter = (
  data: Record<string, unknown>,
  body: string,
): string => {
  const doc = new Document(withoutUndefined(data))

  // Short lists read better inline (`tags: [react, hooks]`) and diff as one
  // line rather than one line per entry.
  visit(doc, {
    Seq(_key, node) {
      node.flow = true
    },
  })

  // `lineWidth: 0` disables folding: a long description stays on one line, so
  // editing it produces a one-line diff instead of a reflowed paragraph.
  const yamlText = doc.toString({ lineWidth: 0, flowCollectionPadding: false })
  const trimmedBody = body.replace(/\s+$/, '')

  return trimmedBody
    ? `---\n${yamlText}---\n\n${trimmedBody}\n`
    : `---\n${yamlText}---\n`
}
