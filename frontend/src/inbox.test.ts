import { beforeEach, describe, expect, it } from 'vitest'
import { CAUGHT_UP, inboxOf, markSeen, type InboxEntry } from './inbox'
import type { NoteView, SentShareView, ShareView, SharesView } from './social'

// Edwin, 2026-10-29: "Shared with you" is a small inbox, replies grouped under
// the item they answer, and when everything has been seen it simply says so.

const note = (id: string, mine: boolean, from = mine ? 'Me' : 'Kofi'): NoteView => ({ id, from, mine, kind: 'words', text: 'x', date: '2026-10-29' })
const received = (id: string, notes: NoteView[] = []): ShareView => ({
  id,
  from: { id: 'ama', name: 'Ama', tag: 'friends', since: '2026-10-01', active: false, connect: true },
  kind: 'helped',
  theme: '',
  text: 'Taking ten minutes before replying helped me respond more calmly.',
  date: '2026-10-29',
  mode: 'encourage',
  replies: true,
  notes,
})
const sent = (id: string, notes: NoteView[]): SentShareView => ({
  id,
  kind: 'reflection',
  theme: '',
  text: 'I said no to an extra shift, but I still feel guilty.',
  date: '2026-10-29',
  to: ['Kofi'],
  mode: 'encourage',
  replies: true,
  audience: 'people',
  people: [{ id: 'kofi', name: 'Kofi', notes }],
})
const shares = (r: ShareView[], s: SentShareView[] = []): SharesView => ({ themes: [], received: r, sent: s })

describe('Shared with you', () => {
  beforeEach(() => localStorage.clear())

  it('lists what was shared with you, and replies to what you shared grouped under each item', () => {
    const box = inboxOf(shares([received('r1')], [sent('s1', [note('n1', false)]), sent('s2', [])]))
    expect(box.map((e: InboxEntry) => [e.kind, e.id, e.isNew])).toEqual([
      ['received', 'r1', true],
      ['replies', 's1', true],
    ])
  })

  it('says you are caught up once everything has been seen, and marks only new replies as new', () => {
    const first = shares([received('r1')], [sent('s1', [note('n1', false)])])
    markSeen(inboxOf(first))
    expect(inboxOf(first).every((e) => !e.isNew)).toBe(true)
    expect(CAUGHT_UP).toBe('You’re caught up. Come back whenever you need.')
    const later = shares([received('r1', [note('n2', true), note('n3', false)])], [sent('s1', [note('n1', false), note('n4', true)])])
    expect(inboxOf(later).map((e) => [e.id, e.isNew])).toEqual([
      ['r1', true],
      ['s1', false],
    ])
  })
})
