import { beforeEach, describe, expect, it } from 'vitest'
import { connectionBetween, connectionLine, noteConnection, CONNECTION_KEY } from './connection'

// "Your week in connection" (Connect 3.0): the person's own moves towards
// friends, counted on this phone only, never with a name, never sent.

beforeEach(() => localStorage.clear())

describe('the connection log', () => {
  it('keeps only the day and the kind, never who', () => {
    noteConnection('nod', '2026-10-20')
    noteConnection('share', '2026-10-21')
    const raw = localStorage.getItem(CONNECTION_KEY)!
    expect(JSON.parse(raw)).toEqual([
      { d: '2026-10-20', k: 'nod' },
      { d: '2026-10-21', k: 'share' },
    ])
  })

  it('counts a span, and drops what is more than a year old', () => {
    noteConnection('nod', '2025-09-01')
    noteConnection('nod', '2026-10-20')
    noteConnection('nod', '2026-10-21')
    noteConnection('support', '2026-10-22')
    noteConnection('celebrate', '2026-10-23')
    noteConnection('share', '2026-09-30')
    expect(connectionBetween('2026-10-19', '2026-10-25')).toEqual({ nod: 2, share: 0, support: 1, celebrate: 1, days: 4 })
    expect(JSON.parse(localStorage.getItem(CONNECTION_KEY)!).some((e: { d: string }) => e.d === '2025-09-01')).toBe(false)
  })

  it('says it plainly, and says nothing about a quiet week but that it was quiet', () => {
    expect(connectionLine({ nod: 2, share: 1, support: 0, celebrate: 1, days: 3 }, 'week')).toBe(
      'This week you sent two quiet nods, shared one thing that helped and celebrated a win with someone.',
    )
    expect(connectionLine({ nod: 0, share: 0, support: 1, celebrate: 0, days: 1 }, 'month')).toBe('This month you asked someone for support.')
    expect(connectionLine({ nod: 0, share: 0, support: 0, celebrate: 0, days: 0 }, 'week')).toBe('A quiet week for connection. That is all it was.')
  })
})
