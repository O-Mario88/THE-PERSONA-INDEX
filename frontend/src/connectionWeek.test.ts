import { beforeEach, describe, expect, it } from 'vitest'
import { connectionWeek, saySupport, SUPPORT_ASK, supportFor } from './connectionWeek'
import type { NoteView, OutsideView, ReflectTogetherView, SentShareView, ShareView, SharesView } from './social'

// Edwin, 2026-10-29: the Mirror's "Connection this week" comes only from what
// actually happened between the person and people they trust, and it asks
// whether the support they received helped, remembering the answer.

const FROM = '2026-10-26'
const TO = '2026-11-01'
const friend = (name: string) => ({ id: name.toLowerCase(), name, tag: 'friends' as const, since: '2026-10-01', active: false, connect: true })
const note = (mine: boolean, date = '2026-10-28'): NoteView => ({ id: `${mine}${date}`, from: mine ? 'Me' : 'Ama', mine, kind: 'encourage', date })
const received = (date: string, notes: NoteView[] = []): ShareView => ({ id: `r${date}`, from: friend('Ama'), kind: 'helped', theme: '', text: 'x', date, mode: 'share', replies: true, notes })
const sent = (date: string, people: { name: string; notes: NoteView[] }[]): SentShareView => ({
  id: `s${date}`,
  kind: 'reflection',
  theme: '',
  text: 'y',
  date,
  to: people.map((p) => p.name),
  mode: 'encourage',
  replies: true,
  audience: 'people',
  people: people.map((p) => ({ id: p.name.toLowerCase(), name: p.name, notes: p.notes })),
})
const shares = (r: ShareView[], s: SentShareView[]): SharesView => ({ themes: [], received: r, sent: s })
const noOutside: OutsideView = { prompts: [], asked: [], invitations: [], notes: [] }
const noTogether: ReflectTogetherView = { questions: [], items: [] }

describe('Connection this week', () => {
  beforeEach(() => localStorage.clear())

  it('says what happened between you and your people that week, by name, and nothing from other weeks', () => {
    const week = connectionWeek(
      shares(
        [received('2026-10-27'), received('2026-10-10')],
        [
          sent('2026-10-28', [
            { name: 'Kofi', notes: [note(false), note(true)] },
            { name: 'Nia', notes: [] },
          ]),
        ],
      ),
      {
        questions: [],
        items: [{ id: 't', with: friend('Kofi'), questionId: 'q', asked: true, mine: 'a', iRevealed: true, iKept: false, theyAnswered: true, theyKept: false, theirs: 'b', date: '2026-10-29' }],
      },
      { ...noOutside, notes: [{ id: 'n', from: friend('Joel'), promptId: 'ease', text: 'z', kept: true, date: '2026-10-30' }] },
      FROM,
      TO,
    )
    expect(week.lines).toEqual(['You shared 1 thing with Kofi and Nia.', 'Ama shared 1 thing with you.', 'You received 1 reply.', 'You reflected together with Kofi.', 'Joel wrote you a note.'])
    expect(week.received).toBe(true)
  })

  it('says nothing, and asks nothing, in a week with no shared moments', () => {
    const week = connectionWeek(shares([], []), noTogether, noOutside, FROM, TO)
    expect(week.lines).toEqual([])
    expect(week.received).toBe(false)
  })

  it('asks once whether the support helped, and remembers the answer for that week', () => {
    expect(SUPPORT_ASK).toBe('Did the support you received this week help?')
    expect(supportFor(FROM)).toBeNull()
    saySupport(FROM, 'helped')
    expect(supportFor(FROM)).toBe('helped')
    expect(supportFor('2026-10-19')).toBeNull()
  })
})
