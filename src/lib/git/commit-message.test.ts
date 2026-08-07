import { describe, expect, it } from 'vitest'

import {
  buildBatchCommitMessage,
  buildCommitMessage,
} from '@/lib/git/commit-message'

describe('buildCommitMessage', () => {
  it('produces the three examples coding-standards.md specifies', () => {
    // These exact strings are the contract. The CLI (todo phase 4) builds its
    // messages from the same module so a vault's history reads consistently
    // whichever tool wrote it.
    expect(buildCommitMessage('Add', 'note', 'Docker networking')).toBe(
      'Add note: Docker networking',
    )
    expect(buildCommitMessage('Update', 'snippet', 'pandas filter')).toBe(
      'Update snippet: pandas filter',
    )
    expect(buildCommitMessage('Delete', 'prompt', 'code review')).toBe(
      'Delete prompt: code review',
    )
  })

  it('names collections alongside item types', () => {
    expect(buildCommitMessage('Add', 'collection', 'React Patterns')).toBe(
      'Add collection: React Patterns',
    )
  })

  it('collapses whitespace so the subject stays one line', () => {
    // A newline here would turn everything after it into the commit *body*,
    // silently truncating what `git log --oneline` shows.
    expect(buildCommitMessage('Add', 'note', 'Docker\nnetworking  notes')).toBe(
      'Add note: Docker networking notes',
    )
    expect(buildCommitMessage('Add', 'note', '  padded  ')).toBe(
      'Add note: padded',
    )
  })

  it('truncates a long title rather than wrapping it', () => {
    const message = buildCommitMessage('Add', 'note', 'x'.repeat(200))

    expect(message.startsWith('Add note: ')).toBe(true)
    expect(message.endsWith('…')).toBe(true)
    expect(message).not.toContain('\n')
    // Subject stays inside Git's conventional bound plus the prefix.
    expect(message.length).toBeLessThanOrEqual('Add note: '.length + 60)
  })

  it('leaves a title that already fits completely alone', () => {
    const title = 'A title of exactly reasonable length'
    expect(buildCommitMessage('Update', 'command', title)).toBe(
      `Update command: ${title}`,
    )
  })
})

describe('buildBatchCommitMessage', () => {
  it('counts files, singular and plural', () => {
    // "files" rather than "items": the staged set can hold collection files and
    // `.devvault/config.json` too, so counting them as items would be wrong.
    expect(buildBatchCommitMessage(1)).toBe('Update vault: 1 file')
    expect(buildBatchCommitMessage(4)).toBe('Update vault: 4 files')
    expect(buildBatchCommitMessage(0)).toBe('Update vault: 0 files')
  })
})
