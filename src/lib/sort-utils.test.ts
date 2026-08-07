import { describe, expect, it } from 'vitest'

import { byTextAsc, byUpdatedAtDesc } from '@/lib/sort-utils'

const rec = (id: string, updatedAt: string) => ({ id, updatedAt })

describe('byUpdatedAtDesc', () => {
  it('orders newest first', () => {
    const sorted = [
      rec('a', '2026-01-01T00:00:00Z'),
      rec('b', '2026-03-01T00:00:00Z'),
      rec('c', '2026-02-01T00:00:00Z'),
    ].sort(byUpdatedAtDesc)

    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  /*
   * The reason the tie-break exists. A collection's `updatedAt` is derived from
   * its newest member, so two collections sharing an item share its date
   * whenever it is newest in both — live in the current vault, where
   * `context-files` and `devops-commands` both derive from
   * `docker-networking-notes`. Without a tie-break the winner is whichever the
   * vault read first, so renaming a file would reorder the sidebar.
   */
  it('breaks ties by id rather than leaving them to input order', () => {
    const tie = '2026-07-16T10:15:00Z'

    const forwards = [rec('devops-commands', tie), rec('context-files', tie)]
    const backwards = [rec('context-files', tie), rec('devops-commands', tie)]

    expect([...forwards].sort(byUpdatedAtDesc).map((r) => r.id)).toEqual([
      'context-files',
      'devops-commands',
    ])
    // The same answer from the opposite input order is the whole point.
    expect([...backwards].sort(byUpdatedAtDesc).map((r) => r.id)).toEqual(
      [...forwards].sort(byUpdatedAtDesc).map((r) => r.id),
    )
  })

  it('still puts a newer record first when ids would say otherwise', () => {
    // Guards against the tie-break being applied before the date.
    const sorted = [
      rec('aaa', '2026-01-01T00:00:00Z'),
      rec('zzz', '2026-05-01T00:00:00Z'),
    ].sort(byUpdatedAtDesc)

    expect(sorted.map((r) => r.id)).toEqual(['zzz', 'aaa'])
  })
})

describe('byTextAsc', () => {
  it('sorts case-insensitively so case does not split the alphabet', () => {
    expect(['Date', 'banana', 'Apple', 'cherry'].sort(byTextAsc)).toEqual([
      'Apple',
      'banana',
      'cherry',
      'Date',
    ])
  })
})
