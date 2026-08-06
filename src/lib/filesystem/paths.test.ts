import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { VaultError } from '@/lib/errors'
import { resolveInVault, toVaultRelative } from '@/lib/filesystem/paths'

const ROOT = path.resolve('/tmp/devvault-test-root')

describe('resolveInVault', () => {
  it('resolves a vault-relative path inside the root', () => {
    expect(resolveInVault(ROOT, 'snippets/use-debounce-hook.md')).toBe(
      path.join(ROOT, 'snippets', 'use-debounce-hook.md'),
    )
  })

  it('allows the root itself', () => {
    expect(resolveInVault(ROOT, '')).toBe(ROOT)
  })

  it('refuses traversal above the root', () => {
    expect(() => resolveInVault(ROOT, '../../etc/passwd')).toThrow(VaultError)
  })

  it('refuses traversal hidden mid-path', () => {
    expect(() => resolveInVault(ROOT, 'snippets/../../secrets.md')).toThrow(
      VaultError,
    )
  })

  it('refuses an absolute path outside the root', () => {
    expect(() => resolveInVault(ROOT, '/etc/passwd')).toThrow(VaultError)
  })

  it('refuses a sibling directory sharing the root prefix', () => {
    // `/tmp/devvault-test-root-other` starts with the root string but is not
    // inside it — the check is on the path separator, not on the prefix.
    expect(() => resolveInVault(ROOT, '../devvault-test-root-other/x.md')).toThrow(
      VaultError,
    )
  })

  it('reports the offending path without leaking the root', () => {
    try {
      resolveInVault(ROOT, '../../etc/passwd')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(VaultError)
      expect((error as VaultError).code).toBe('PATH_ESCAPE')
      expect((error as VaultError).message).not.toContain(ROOT)
    }
  })
})

describe('toVaultRelative', () => {
  it('returns POSIX-separated vault-relative paths', () => {
    expect(toVaultRelative(ROOT, path.join(ROOT, 'notes', 'a.md'))).toBe(
      'notes/a.md',
    )
  })
})
