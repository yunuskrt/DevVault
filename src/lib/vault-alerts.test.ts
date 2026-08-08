import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { seedVault } from '../../scripts/seed-vault'
import { resetGitCaches } from '@/lib/git/simple-git-service'
import { loadVaultAlerts } from '@/lib/vault-alerts'

/*
 * The loader that turns Git state plus vault errors into what the sidebar
 * renders.
 *
 * Against a real seeded vault in a real repository, because the interesting
 * questions are "does a conflicted file still yield its item's title" and "does
 * an unparseable one degrade instead of throwing" — both of which depend on
 * what Git and the frontmatter parser actually do with a mangled file.
 */

const temporaryDirs: string[] = []
const originalPath = process.env.DEVVAULT_PATH

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

/** A seeded vault, committed, pointed at by the environment. */
const makeVault = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-alerts-'))
  temporaryDirs.push(root)

  await seedVault(root)
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Vault Tester')
  git(root, 'config', 'user.email', 'tester@example.com')
  git(root, 'add', '-A')
  git(root, 'commit', '-m', 'seed')

  process.env.DEVVAULT_PATH = root
  return root
}

/**
 * Conflicts `file` for real, by editing it on two branches and merging.
 *
 * `edit` decides what each side's version looks like, which is how the
 * "markers land in the frontmatter" and "markers land in the body" cases are
 * told apart — they behave very differently, because only the first one stops
 * the file parsing.
 */
const conflict = async (
  root: string,
  file: string,
  edit: (original: string, side: 'theirs' | 'mine') => string,
): Promise<void> => {
  const target = path.join(root, file)
  const original = await fs.readFile(target, 'utf8')

  git(root, 'checkout', '-b', 'incoming')
  await fs.writeFile(target, edit(original, 'theirs'), 'utf8')
  git(root, 'commit', '-am', 'other computer')

  git(root, 'checkout', 'main')
  await fs.writeFile(target, edit(original, 'mine'), 'utf8')
  git(root, 'commit', '-am', 'this computer')

  try {
    git(root, 'merge', 'incoming')
  } catch {
    // Expected — the merge stops on the conflict.
  }
}

/** Appends to the body, leaving the frontmatter intact and parseable. */
const inBody = (original: string, side: 'theirs' | 'mine'): string =>
  `${original}\n\nA line from the ${side === 'mine' ? 'local' : 'remote'} side.\n`

/** Rewrites the title, so the conflict markers land inside the YAML. */
const inFrontmatter = (original: string, side: 'theirs' | 'mine'): string =>
  original.replace(/^title: .*$/m, `title: Title from ${side}`)

beforeEach(() => {
  resetGitCaches()
})

afterEach(async () => {
  process.env.DEVVAULT_PATH = originalPath
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('loadVaultAlerts — conflicts', () => {
  it('reports nothing at all for a healthy vault', async () => {
    await makeVault()

    expect(await loadVaultAlerts()).toEqual({
      conflicts: [],
      operation: null,
      issues: [],
    })
  })

  it('names the item by title when the file still parses (verification 1)', async () => {
    // Markers in the body: the frontmatter survives, so the vault loads the
    // item normally and the title comes straight from it.
    const root = await makeVault()
    await conflict(root, 'notes/docker-networking-notes.md', inBody)

    const { conflicts, operation } = await loadVaultAlerts()

    expect(operation).toBe('merge')
    expect(conflicts).toEqual([
      {
        path: 'notes/docker-networking-notes.md',
        title: 'Docker networking notes',
        type: 'note',
      },
    ])
  })

  it('recovers the title from the index when the file no longer parses', async () => {
    /*
     * Markers in the *frontmatter* — the usual case, and the one that makes
     * naming items hard: the working-tree file is not valid YAML, so the vault
     * cannot load it. The title is read back out of this computer's staged
     * side, which is always a clean file.
     */
    const root = await makeVault()
    await conflict(root, 'notes/docker-networking-notes.md', inFrontmatter)

    const { conflicts } = await loadVaultAlerts()

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].path).toBe('notes/docker-networking-notes.md')
    expect(conflicts[0].title).toBe('Title from mine')
    expect(conflicts[0].type).toBe('note')
  })

  it('falls back to the path rather than crashing on an unreadable file', async () => {
    // The spec is explicit that a conflicted file may not parse and must not
    // take the view down. Here neither side is a valid item at all.
    const root = await makeVault()
    const file = 'notes/junk.md'

    await fs.writeFile(path.join(root, file), 'not an item\n', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'junk')
    await conflict(root, file, inBody)

    const { conflicts } = await loadVaultAlerts()

    expect(conflicts).toEqual([{ path: file, title: null, type: 'note' }])
  })

  it('still resolves the type from the directory when the title is lost', async () => {
    // The type comes from the path (§3.1), which conflict markers cannot
    // corrupt — so the row keeps its icon even when nothing else survives.
    const root = await makeVault()
    const file = 'snippets/junk.md'

    await fs.writeFile(path.join(root, file), 'garbage\n', 'utf8')
    git(root, 'add', '-A')
    git(root, 'commit', '-m', 'junk')
    await conflict(root, file, inBody)

    const { conflicts } = await loadVaultAlerts()

    expect(conflicts[0].type).toBe('snippet')
  })

  it('still reports the operation once the last file is resolved', async () => {
    /*
     * Resolving the last conflict does not end a rebase — the rebase is still
     * suspended and still has to be finished or aborted. The dialog draws its
     * Abort button from `operation`, so reporting `null` here made Abort
     * disappear at precisely the moment it was needed, leaving a paused rebase
     * escapable only from a terminal. Found in the browser during verification.
     */
    const root = await makeVault()
    await conflict(root, 'notes/docker-networking-notes.md', inBody)

    git(root, 'checkout', '--ours', '--', 'notes/docker-networking-notes.md')
    git(root, 'add', 'notes/docker-networking-notes.md')

    const alerts = await loadVaultAlerts()

    expect(alerts.conflicts).toEqual([])
    expect(alerts.operation).toBe('merge')
  })

  it('lists every conflicted file (verification 4)', async () => {
    const root = await makeVault()
    const target = (file: string) => path.join(root, file)
    const one = 'notes/docker-networking-notes.md'
    const two = 'prompts/code-review-assistant.md'

    const [oneOriginal, twoOriginal] = await Promise.all([
      fs.readFile(target(one), 'utf8'),
      fs.readFile(target(two), 'utf8'),
    ])

    git(root, 'checkout', '-b', 'incoming')
    await fs.writeFile(target(one), `${oneOriginal}\nremote one\n`, 'utf8')
    await fs.writeFile(target(two), `${twoOriginal}\nremote two\n`, 'utf8')
    git(root, 'commit', '-am', 'other computer')

    git(root, 'checkout', 'main')
    await fs.writeFile(target(one), `${oneOriginal}\nlocal one\n`, 'utf8')
    await fs.writeFile(target(two), `${twoOriginal}\nlocal two\n`, 'utf8')
    git(root, 'commit', '-am', 'this computer')

    try {
      git(root, 'merge', 'incoming')
    } catch {
      // Expected.
    }

    const { conflicts } = await loadVaultAlerts()

    expect(conflicts.map((entry) => entry.path).sort()).toEqual([one, two].sort())
  })

  it('reports no conflicts when the vault is not a repository', async () => {
    /*
     * `loadGitStatus` returns `ok: false` here, and the early return for that
     * has to keep the issues. A vault with no Git is a supported state (spec 3
     * shipped with one), and a broken file in it is still broken — dropping the
     * list would make the sidebar affordance silently disappear for exactly the
     * users least likely to have another way of noticing.
     */
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-alerts-'))
    temporaryDirs.push(root)
    await seedVault(root)
    process.env.DEVVAULT_PATH = root

    await fs.writeFile(
      path.join(root, 'notes/mongodb-index-strategy.md'),
      '---\nid: [unclosed\n---\n\nbody\n',
      'utf8',
    )

    const alerts = await loadVaultAlerts()

    expect(alerts.conflicts).toEqual([])
    expect(alerts.operation).toBeNull()
    expect(alerts.issues).toHaveLength(1)
    expect(alerts.issues[0].path).toBe('notes/mongodb-index-strategy.md')
  })
})

describe('loadVaultAlerts — vault issues (verification 7 and 8)', () => {
  it('surfaces files that could not be read, with actionable messages', async () => {
    const root = await makeVault()

    // Two different failures: one structural, one a YAML syntax error.
    await fs.writeFile(
      path.join(root, 'notes/docker-networking-notes.md'),
      '---\nid: broken-one\ntitle: Still here\n---\n\nbody\n',
      'utf8',
    )
    await fs.writeFile(
      path.join(root, 'notes/mongodb-index-strategy.md'),
      '---\nid: [unclosed\n---\n\nbody\n',
      'utf8',
    )

    const { issues } = await loadVaultAlerts()

    expect(issues).toHaveLength(2)
    expect(issues.map((issue) => issue.path).sort()).toEqual([
      'notes/docker-networking-notes.md',
      'notes/mongodb-index-strategy.md',
    ])

    // The reader's wording, not a Zod dump — the spec calls this out by name.
    const structural = issues.find((issue) => issue.path.includes('docker'))
    expect(structural?.message).toMatch(/type/)
    expect(structural?.message).not.toMatch(/ZodError|invalid_type/)
  })

  it('never leaks an absolute path in a message', async () => {
    const root = await makeVault()
    await fs.writeFile(
      path.join(root, 'notes/mongodb-index-strategy.md'),
      '---\nid: [unclosed\n---\n\nbody\n',
      'utf8',
    )

    const { issues } = await loadVaultAlerts()

    for (const issue of issues) {
      expect(issue.message).not.toContain(root)
      expect(issue.path).not.toContain(root)
    }
  })

  it('drops the count as files are fixed, with no restart (verification 8)', async () => {
    const root = await makeVault()
    const broken = path.join(root, 'notes/mongodb-index-strategy.md')
    const original = await fs.readFile(broken, 'utf8')

    await fs.writeFile(broken, '---\nid: [unclosed\n---\n\nbody\n', 'utf8')
    expect((await loadVaultAlerts()).issues).toHaveLength(1)

    await fs.writeFile(broken, original, 'utf8')
    expect((await loadVaultAlerts()).issues).toHaveLength(0)
  })

  it('keeps loading every other item (verification 7)', async () => {
    // The whole point of partitioning errors rather than throwing: one bad
    // file must not take the vault down.
    const root = await makeVault()
    await fs.writeFile(
      path.join(root, 'notes/mongodb-index-strategy.md'),
      '---\nid: [unclosed\n---\n\nbody\n',
      'utf8',
    )

    const { loadVault } = await import('@/lib/vault')
    const { items, errors } = await loadVault()

    expect(errors).toHaveLength(1)
    expect(items).toHaveLength(11)
  })
})
