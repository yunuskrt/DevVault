import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The **Open in editor** action's server half.
 *
 * `spawn` is mocked, and that is not a shortcut: the real one launches a GUI
 * application on whoever is running the suite. It did exactly that during
 * verification. Mocking it is also what makes the interesting property
 * observable at all — the argument vector handed to the OS is the injection
 * defence, and a passing "the file opened" test would say nothing about it.
 *
 * The failure paths that never reach `spawn` (traversal, missing file, a path
 * read as a flag) are covered through the action in `actions/vault.test.ts`;
 * this file covers what happens once the boundary has been cleared.
 */

type FakeChild = EventEmitter & { unrefCalls: number; unref: () => void }

const spawned = vi.hoisted(
  () =>
    [] as {
      command: string
      args: string[]
      options: unknown
      child: FakeChild
    }[],
)

/** Whether the next spawn should report a failure instead of starting. */
const nextChild = vi.hoisted(() => ({ fail: false }))

vi.mock('node:child_process', async (importOriginal) => {
  const { EventEmitter: Emitter } = await import('node:events')
  const actual = await importOriginal<typeof import('node:child_process')>()

  return {
    ...actual,
    spawn: (command: string, args: string[], options: unknown) => {
      const child = Object.assign(new Emitter(), {
        unrefCalls: 0,
        unref() {
          child.unrefCalls += 1
        },
      }) as FakeChild

      spawned.push({ command, args, options, child })

      // Both events are asynchronous in the real thing, and the code under test
      // attaches its listeners after this call has returned.
      queueMicrotask(() => {
        if (nextChild.fail) child.emit('error', new Error('ENOENT'))
        else child.emit('spawn')
      })

      return child
    },
  }
})

const { openInDefaultApp } = await import('@/lib/vault/open-external')

const temporaryDirs: string[] = []
const realPlatform = process.platform

/** Overrides `process.platform`, which `spawnOpener` reads on every call. */
const pretendPlatform = (platform: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

/** A vault holding one real file, since the opener checks it exists first. */
const makeVault = async (file = 'notes/docker.md'): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'devvault-open-'))
  temporaryDirs.push(root)

  const target = path.join(root, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, 'body\n', 'utf8')

  return root
}

beforeEach(() => {
  spawned.length = 0
  nextChild.fail = false
})

afterEach(async () => {
  pretendPlatform(realPlatform)
  await Promise.all(
    temporaryDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})

describe('openInDefaultApp', () => {
  it('opens the resolved file and lets the child outlive the request', async () => {
    pretendPlatform('darwin')
    const root = await makeVault()

    await expect(
      openInDefaultApp(root, 'notes/docker.md'),
    ).resolves.toBeUndefined()

    expect(spawned).toHaveLength(1)
    expect(spawned[0].command).toBe('open')
    expect(spawned[0].args).toEqual([path.join(root, 'notes/docker.md')])
    expect(spawned[0].options).toEqual({ detached: true, stdio: 'ignore' })

    // Without `unref` the editor keeps Node's event loop referenced long after
    // the request has returned.
    expect(spawned[0].child.unrefCalls).toBe(1)
  })

  it('never hands the filename to a shell', async () => {
    /*
     * The property the module's own safety note rests on. A filename holding
     * shell metacharacters has to arrive as one argument in an array, with no
     * `shell: true` anywhere near it — otherwise a crafted name in a synced
     * vault becomes a command on the machine that opens it. `echo` rather than
     * anything destructive, so a regression that *does* reach a shell fails
     * this test instead of doing damage.
     */
    pretendPlatform('darwin')
    const file = 'notes/a; echo pwned.md'
    const root = await makeVault(file)

    await openInDefaultApp(root, file)

    expect(spawned[0].args).toEqual([path.join(root, file)])
    expect(spawned[0].options).not.toHaveProperty('shell')
  })

  it('passes the empty title argument on Windows', async () => {
    // `start` reads a lone quoted path as the window title and opens nothing,
    // so the empty string ahead of it is load-bearing rather than decorative.
    pretendPlatform('win32')
    const root = await makeVault()

    await openInDefaultApp(root, 'notes/docker.md')

    expect(spawned[0].command).toBe('cmd')
    expect(spawned[0].args).toEqual([
      '/c',
      'start',
      '',
      path.join(root, 'notes/docker.md'),
    ])
  })

  it('uses xdg-open on Linux', async () => {
    pretendPlatform('linux')
    const root = await makeVault()

    await openInDefaultApp(root, 'notes/docker.md')

    expect(spawned[0].command).toBe('xdg-open')
  })

  it('says so plainly on a platform it cannot open files on', async () => {
    pretendPlatform('aix')
    const root = await makeVault()

    await expect(
      openInDefaultApp(root, 'notes/docker.md'),
    ).rejects.toThrow(/cannot open files on this platform/)

    expect(spawned).toHaveLength(0)
  })

  it('reports a failed spawn instead of hanging', async () => {
    // No `error` handler and the promise would never settle, leaving the
    // dialog's button spinning forever.
    pretendPlatform('darwin')
    nextChild.fail = true
    const root = await makeVault()

    await expect(openInDefaultApp(root, 'notes/docker.md')).rejects.toThrow(
      /could not open that file/,
    )
  })

  it('keeps the absolute path out of every message it throws', async () => {
    pretendPlatform('darwin')
    nextChild.fail = true
    const root = await makeVault()

    const error = await openInDefaultApp(root, 'notes/docker.md').then(
      () => null,
      (thrown: unknown) => thrown as Error,
    )

    expect(error).not.toBeNull()
    expect(error?.message).not.toContain(root)
  })

  it('refuses a traversal before anything is spawned', async () => {
    /*
     * `actions/vault.test.ts` asserts the refusal; what matters here is that it
     * happens *first*. The absolute path is built before the existence check,
     * so a boundary that ran later would already have handed an outside file to
     * the OS by the time it complained.
     */
    pretendPlatform('darwin')
    const root = await makeVault()
    const outside = path.join(path.dirname(root), 'devvault-open-outside.txt')
    await fs.writeFile(outside, 'secret\n', 'utf8')

    try {
      await expect(
        openInDefaultApp(root, `../${path.basename(outside)}`),
      ).rejects.toThrow(/outside the vault/)

      expect(spawned).toHaveLength(0)
    } finally {
      await fs.rm(outside, { force: true })
    }
  })

  it('does not spawn for a file that is no longer there', async () => {
    pretendPlatform('darwin')
    const root = await makeVault()

    await expect(openInDefaultApp(root, 'notes/gone.md')).rejects.toThrow(
      /no longer in your vault/,
    )

    expect(spawned).toHaveLength(0)
  })
})
