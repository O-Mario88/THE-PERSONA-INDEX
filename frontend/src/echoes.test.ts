import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from './api'
import { ECHO_FELT, echoes, echoFor, echoLines, echoesSeen, feltLine, feltReply, findEcho, keepEcho, noteEchoSeen, readEcho, seedEchoes, withEcho } from './echoes'
import { voiceProblems } from './voice'
import type { CheckIn } from './growthJourney'
import type { Move } from './moves'
import { savePatron } from './patron'
import type { History } from './profile'

beforeEach(() => localStorage.clear())

const TODAY = '2026-10-29'
const q = (date: string, bank: string, theme: string, extra: Partial<Question> = {}): Question => ({
  id: `${date}-${bank}`,
  theme,
  care: 'everyday',
  prompt: 'A colleague asks you to stay late again. You…',
  options: [
    { id: 'yes', label: 'Say yes and stay', need: 'belonging' },
    { id: 'no', label: 'Say no, kindly', need: 'respect' },
    { id: 'heavy', label: 'Feel like crying', heavy: true },
  ],
  ...extra,
})

// Edwin's brief, 2026-10-29: "Every 45, 90, 180, and 365 days, the engine
// intentionally slips 1 question into the Morning or Evening sitting that the
// user has answered before… At The Close… An Echo from 3 Months Ago."
describe('keeping answers for an echo', () => {
  it('keeps a small note of each answer: the question, the day, the choice and its need', () => {
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'yes', '2026-07-30')
    expect(echoes()).toEqual([{ bank: 'colleagues-late', date: '2026-07-30', optionId: 'yes', label: 'Say yes and stay', need: 'belonging' }])
  })

  it('never keeps an intimate, heavy or regional answer', () => {
    keepEcho(q('2026-07-30', 'intimacy-x', 'intimacy', { care: 'intimate' }), 'yes', '2026-07-30')
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'heavy', '2026-07-30')
    keepEcho(q('2026-07-30', 'home-chores', 'home', { local: true }), 'yes', '2026-07-30')
    expect(echoes()).toEqual([])
  })

  it('lets go of answers older than about a year', () => {
    keepEcho(q('2025-09-01', 'colleagues-late', 'colleagues'), 'yes', '2025-09-01')
    keepEcho(q(TODAY, 'home-chores', 'home'), 'no', TODAY)
    expect(echoes().map((e) => e.date)).toEqual([TODAY])
  })

  it('starts from the answers already on the phone', () => {
    const h = { answers: [{ date: '2026-09-29', questionId: '2026-09-29-colleagues-late', theme: 'colleagues', depth: 2, traits: {}, optionId: 'no', need: 'respect' }], skips: [] } as History
    seedEchoes(h, () => 'Say no, kindly')
    expect(echoes()).toEqual([{ bank: 'colleagues-late', date: '2026-09-29', optionId: 'no', label: 'Say no, kindly', need: 'respect' }])
  })
})

describe('slipping an echo into a sitting', () => {
  const pool = [q(TODAY, 'home-chores', 'home'), q(TODAY, 'colleagues-late', 'colleagues'), q(TODAY, 'food-dinner', 'food')]

  it('finds a question in today’s pool answered about three months ago, the longest echo first for a Patron', () => {
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'yes', '2026-07-30')
    keepEcho(q('2026-09-29', 'food-dinner', 'food'), 'yes', '2026-09-29')
    savePatron({ plan: 'yearly', until: '2027-10-29' })
    expect(findEcho(pool, TODAY)).toMatchObject({ question: { id: `${TODAY}-colleagues-late` }, milestone: 90 })
  })

  it('offers someone without Patron the free month-old echo first', () => {
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'yes', '2026-07-30')
    keepEcho(q('2026-09-29', 'food-dinner', 'food'), 'yes', '2026-09-29')
    expect(findEcho(pool, TODAY)).toMatchObject({ question: { id: `${TODAY}-food-dinner` }, milestone: 30 })
  })

  it('takes the third place in a sitting, once a week at most, and never twice from one part of life', () => {
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'yes', '2026-07-30')
    const picked = [q(TODAY, 'sleep-a', 'sleep-health'), q(TODAY, 'money-b', 'money'), q(TODAY, 'home-chores', 'home')]
    const out = withEcho(picked, pool, TODAY, 'morning')
    expect(out.map((x) => x.id)).toEqual([`${TODAY}-sleep-a`, `${TODAY}-money-b`, `${TODAY}-colleagues-late`])
    expect(echoFor(`${TODAY}-colleagues-late`, TODAY)).toMatchObject({ milestone: 90, from: { date: '2026-07-30', optionId: 'yes' } })
    // The same week, no second echo.
    expect(withEcho(picked, pool, '2026-10-31', 'morning')).toEqual(picked)
    // Not when the sitting already has that part of life.
    localStorage.clear()
    keepEcho(q('2026-07-30', 'colleagues-late', 'colleagues'), 'yes', '2026-07-30')
    const clash = [q(TODAY, 'colleagues-x', 'colleagues'), q(TODAY, 'money-b', 'money'), q(TODAY, 'home-chores', 'home')]
    expect(withEcho(clash, pool, TODAY, 'morning')).toEqual(clash)
  })
})

describe('the echo at the close', () => {
  const today = q(TODAY, 'colleagues-late', 'colleagues')
  const from = { bank: 'colleagues-late', date: '2026-07-30', optionId: 'yes', label: 'Say yes and stay', need: 'belonging' as const }

  // Edwin's brief, 2026-10-29: Echoes are honest, mixed results and no change
  // included; growth is never assumed.
  it('names both answers when they differ, and asks whether something changed without assuming it did', () => {
    const r = readEcho(today, 'no', from, 90, [], [])
    expect(r).toMatchObject({ kind: 'shift', before: 'Say yes and stay', after: 'Say no, kindly' })
    expect(echoLines(r)).toEqual({
      title: 'An echo from 3 months ago',
      lines: [
        'On 30 July, you were asked this same question.',
        'Back then, you chose “Say yes and stay”, reaching for being close to people.',
        'Today, you chose “Say no, kindly”, reaching for being respected.',
        'Has something changed, or was today just different?',
      ],
    })
  })

  it('calls the same answer the same, and brings back the step that helped last time', () => {
    const moves: Move[] = [{ date: '2026-07-30', questionId: '2026-07-30-colleagues-late', optionId: 'yes', step: 'Leave on time once this week.', status: 'helped' }]
    const checks: CheckIn[] = [{ questionId: '2026-07-30-colleagues-late', date: '2026-08-02', tried: 'yes', outcome: 'helped', feeling: 'lighter' }]
    const r = readEcho(today, 'yes', from, 90, moves, checks)
    expect(echoLines(r)).toEqual({
      title: 'The same answer · 3 months',
      lines: ['Both on 30 July and today, you chose “Say yes and stay”.', 'Last time this came up, the step that helped was “Leave on time once this week”.'],
    })
  })

  it('says plainly when nothing has moved and no step helped', () => {
    expect(echoLines(readEcho(today, 'yes', from, 90, [], []))).toEqual({
      title: 'The same answer · 3 months',
      lines: ['Both on 30 July and today, you chose “Say yes and stay”.', 'No change here, and that is worth knowing too.'],
    })
  })

  it('offers three honest answers to a change: changed, some of each, or just a different day', () => {
    expect(ECHO_FELT.map((f) => f.label)).toEqual(['Something has changed', 'Some of each', 'Not really, just a different day'])
    expect(ECHO_FELT.map((f) => feltReply(f.id))).toEqual([
      'Kept in My journey, as a change you noticed.',
      'Kept in My journey, as partly changed.',
      'Kept in My journey. Some days are simply different days.',
    ])
    expect(ECHO_FELT.map((f) => feltLine(f.id))).toEqual(['You said something has changed.', 'You said it’s some of each.', 'You said that was just a different day.'])
    for (const f of ECHO_FELT) for (const line of [f.label, feltReply(f.id), feltLine(f.id)]) expect(voiceProblems(line), line).toEqual([])
  })

  it('keeps what the person said about it, for My Journey', () => {
    noteEchoSeen({ date: TODAY, questionId: today.id, from: '2026-07-30', milestone: 90, before: 'Say yes and stay', after: 'Say no, kindly', felt: 'mixed' })
    expect(echoesSeen()).toEqual([{ date: TODAY, questionId: today.id, from: '2026-07-30', milestone: 90, before: 'Say yes and stay', after: 'Say no, kindly', felt: 'mixed' }])
  })

  it('reads an older “feels true to how I’ve grown” as something changed', () => {
    localStorage.setItem('pi.echoseen.v1', JSON.stringify([{ date: TODAY, questionId: today.id, from: '2026-07-30', milestone: 90, before: 'a', after: 'b', felt: 'grown' }]))
    expect(echoesSeen()[0].felt).toBe('changed')
  })
})
