import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The server/client boundary, enforced mechanically.
 *
 * `coding-standards.md` forbids filesystem and Git access reaching the
 * browser. The vault is now a filesystem read, so a client component that
 * reaches it is a build failure rather than merely wasteful — these roots all
 * begin with `import 'server-only'`, which is what turns the import into an
 * error. This suite names the offending chain instead of leaving someone to
 * read a bundler stack trace.
 *
 * Next.js already rejects a non-serializable *prop* at build time. What it
 * cannot see is an import chain, which is what these tests walk.
 */

const SRC = path.resolve(import.meta.dirname, '..')

/**
 * Modules that touch the filesystem or spawn Git, directly or otherwise. No
 * client file may reach these.
 */
const SERVER_ONLY_ROOTS = [
  'src/lib/vault/index.ts',
  'src/lib/vault/reader.ts',
  'src/lib/vault/config.ts',
  'src/lib/filesystem/read-write.ts',
  'src/lib/filesystem/walk.ts',
  'src/lib/git/index.ts',
  'src/lib/git/simple-git-service.ts',
  // Spec 7. `vault-alerts` reads both the vault and Git status; `open-external`
  // spawns a process against an absolute path. Neither may be reachable from a
  // client component, and the conflict UI added several new ones.
  'src/lib/vault-alerts.ts',
  'src/lib/vault/open-external.ts',
]

const sourceFiles = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(rel(full))
      }
    }
  }
  walk(SRC)
  return out.sort()
}

const rel = (abs: string) => path.relative(path.dirname(SRC), abs).split(path.sep).join('/')

const resolveSpecifier = (spec: string, from: string): string | undefined => {
  let base: string
  if (spec.startsWith('@/')) {
    base = path.join(SRC, spec.slice(2))
  } else if (spec.startsWith('.')) {
    base = path.resolve(path.dirname(path.join(path.dirname(SRC), from)), spec)
  } else {
    return undefined // bare package specifier
  }

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  const hit = candidates.find((c) => fs.existsSync(c))
  return hit ? rel(hit) : undefined
}

/**
 * Import specifiers that survive to runtime. `import type` and specifier lists
 * where every binding is `type`-prefixed are erased by the compiler, so they
 * cannot drag a module into the bundle and are deliberately ignored.
 */
const valueImports = (source: string, from: string): string[] => {
  const targets: string[] = []
  const pattern =
    /(?:^|\n)\s*(?:import|export)(\s+type)?\s+([\s\S]*?)from\s+['"]([^'"]+)['"]/g

  for (const match of source.matchAll(pattern)) {
    const [, typeKeyword, clause, specifier] = match
    if (typeKeyword) continue

    const braced = clause.match(/\{([\s\S]*)\}/)
    const hasValueBinding = braced
      ? // a default/namespace binding before the brace is always a value
        clause.slice(0, clause.indexOf('{')).trim().replace(/,$/, '') !== '' ||
        braced[1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .some((s) => !s.startsWith('type '))
      : true

    if (!hasValueBinding) continue

    const resolved = resolveSpecifier(specifier, from)
    if (resolved) targets.push(resolved)
  }

  return targets
}

type Graph = {
  edges: Map<string, string[]>
  clients: string[]
  serverActions: Set<string>
}

const buildGraph = (): Graph => {
  const edges = new Map<string, string[]>()
  const clients: string[] = []
  const serverActions = new Set<string>()

  for (const file of sourceFiles()) {
    const source = fs.readFileSync(path.join(path.dirname(SRC), file), 'utf8')
    if (/^\s*['"]use client['"]/.test(source)) clients.push(file)
    if (/^\s*['"]use server['"]/.test(source)) serverActions.add(file)
    edges.set(file, valueImports(source, file))
  }

  return { edges, clients, serverActions }
}

/**
 * The first chain from `start` to `target`, or undefined. Used for the failure
 * message.
 *
 * **Traversal stops at a `'use server'` file.** That directive is a real
 * boundary, not a convention: the client never receives the module, only a
 * `createServerReference("<id>")` stub that calls it over the network, so
 * whatever the action imports stays on the server. Verified in the built
 * bundle — `.next/static/` contains that stub and no occurrence of
 * `DEVVAULT_PATH`, `simpleGit` or `index.lock`.
 *
 * Without this, a client component calling any Server Action would look like a
 * boundary violation, which would leave the only way to satisfy this suite
 * being not to have Server Actions at all.
 */
const findChain = (
  graph: Graph,
  start: string,
  target: string,
): string[] | undefined => {
  const queue: string[][] = [[start]]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const chain = queue.shift() as string[]
    const node = chain[chain.length - 1]
    if (node === target) return chain
    if (seen.has(node)) continue
    seen.add(node)

    // The chain may *reach* an action file — that import is legitimate — but
    // nothing beyond it is bundled, so it is a leaf.
    if (node !== start && graph.serverActions.has(node)) continue

    for (const next of graph.edges.get(node) ?? []) {
      queue.push([...chain, next])
    }
  }

  return undefined
}

describe('client/server boundary', () => {
  const graph = buildGraph()

  it('finds the client components it is meant to police', () => {
    // A broken parser would vacuously pass every test below.
    expect(graph.clients.length).toBeGreaterThan(10)
    expect(graph.clients).toContain('src/components/dashboard/SidebarContent.tsx')
    expect(graph.clients).toContain('src/components/dashboard/CollectionBrowser.tsx')
  })

  it('resolves import chains at all', () => {
    // Proves the walker can see through a multi-hop chain, so a "no path
    // found" result below means something.
    expect(
      findChain(graph, 'src/app/layout.tsx', 'src/lib/vault/reader.ts'),
    ).toEqual([
      'src/app/layout.tsx',
      'src/lib/dashboard-nav.ts',
      'src/lib/vault/index.ts',
      'src/lib/vault/reader.ts',
    ])
  })

  it.each(SERVER_ONLY_ROOTS)('no client component reaches %s', (target) => {
    const offenders = graph.clients
      .map((client) => findChain(graph, client, target))
      .filter((chain): chain is string[] => chain !== undefined)
      .map((chain) => chain.join('\n    -> '))

    expect(offenders).toEqual([])
  })

  /*
   * The tests above stop traversing at a `'use server'` file, so the whole
   * suite would go quietly vacuous if that directive were ever dropped from
   * the actions module — every chain through it would become unreachable for
   * the opposite reason. These two make the directive itself the thing under
   * test.
   */
  it('the actions module declares the boundary the walker relies on', () => {
    expect(graph.serverActions).toContain('src/actions/vault.ts')
  })

  it('a client component reaches the vault only through a Server Action', () => {
    // `CommitButton` calls `commitChanges`, which reaches `simple-git-service`.
    // The chain is legitimate exactly because it passes through the boundary,
    // and this pins the shape rather than trusting the absence of a failure.
    expect(
      findChain(
        graph,
        'src/components/dashboard/CommitButton.tsx',
        'src/actions/vault.ts',
      ),
    ).toEqual([
      'src/components/dashboard/CommitButton.tsx',
      'src/actions/vault.ts',
    ])

    const withoutBoundary = { ...graph, serverActions: new Set<string>() }
    expect(
      findChain(
        withoutBoundary,
        'src/components/dashboard/CommitButton.tsx',
        'src/lib/git/simple-git-service.ts',
      ),
    ).toBeDefined()
  })

  it('the sidebar takes its nav as a prop rather than importing it', () => {
    const source = fs.readFileSync(
      path.join(SRC, 'components/dashboard/SidebarContent.tsx'),
      'utf8',
    )
    expect(source).not.toContain('dashboard-nav')
  })
})
