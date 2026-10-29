import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerPulse, loadPulse, pulseShort, pulseWords, sharedMoments, stepPulse } from './humanPulse'
import type { NotAloneQuestion } from './insights'
import type { OthersStep } from './mirrorStory'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const counts: NotAloneQuestion[] = [
  {
    questionId: 'q1',
    total: 140,
    options: [
      { optionId: 'a', count: 37 },
      { optionId: 'b', count: 103 },
    ],
  },
  {
    questionId: 'q2',
    total: 60,
    options: [
      { optionId: 'a', count: 58 },
      { optionId: 'b', count: 0, few: true },
    ],
  },
]
const answer = (date: string, questionId: string, extra: Record<string, unknown> = {}) => ({ date, questionId, theme: 'rest', depth: 2, traits: {}, optionId: 'a', ...extra })

describe('one Human Pulse, worded the same on every page', () => {
  // Edwin, 2026-10-29: factual words, "Others chose this too: 37 of 140
  // respondents.", never implying a common answer is healthier.
  it('says exactly how many chose the same answer, never more than that', () => {
    expect(pulseWords({ kind: 'count', same: 37, total: 140 })).toBe('Others chose this too: 37 of 140 respondents.')
    expect(pulseWords({ kind: 'few' })).toBe('A few others chose this answer too.')
    expect(pulseWords({ kind: 'forming' })).toBeNull()
  })
})

// Edwin, 2026-10-29: "Every page and all items that the user can relate to
// other users in the app need to have human pulse." The short form sits
// beside an item; the words stay as precise as the long one.
describe('the Human Pulse beside an item', () => {
  it('says it briefly, in the same terms: the same answer, never the same feeling', () => {
    expect(pulseShort({ kind: 'count', same: 37, total: 140 })).toBe('Others chose this too: 37 of 140 respondents')
    expect(pulseShort({ kind: 'few' })).toBe('A few others chose this too')
    expect(pulseShort({ kind: 'forming' })).toBeNull()
    expect(pulseShort(null)).toBeNull()
  })

  it('finds the line for one of your answers, and says nothing before the counts are honest', () => {
    expect(answerPulse(counts, 'q1', 'a')).toBe('Others chose this too: 37 of 140 respondents')
    expect(answerPulse(counts, 'q2', 'b')).toBe('A few others chose this too')
    expect(answerPulse(counts, 'q9', 'a')).toBeNull()
    expect(answerPulse(null, 'q1', 'a')).toBeNull()
    expect(answerPulse(counts, 'q1', undefined)).toBeNull()
  })

  it('says what the people who tried a step found, only for the step that answer offered', () => {
    const steps: OthersStep[] = [
      {
        questionId: 'q1',
        optionId: 'a',
        total: 2480,
        outcomes: [
          { outcome: 'helped_lot', count: 1500 },
          { outcome: 'helped_little', count: 280 },
          { outcome: 'no_change', count: 700 },
          { outcome: 'not_tried', count: 0, few: true },
        ],
      },
      { questionId: 'q2', optionId: 'a', total: 90, outcomes: [{ outcome: 'no_change', count: 90 }] },
    ]
    expect(stepPulse(steps, 'q1', 'a')).toBe('Of the 2,480 who tried this and reported back, 1,780 said it helped')
    expect(stepPulse(steps, 'q2', 'a')).toBe('90 reported back on this step')
    expect(stepPulse(steps, 'q1', 'b')).toBeNull()
    expect(stepPulse(null, 'q1', 'a')).toBeNull()
  })

  it('can be put into another language whole, numbers and all', () => {
    const t = (template: string, vars: Record<string, string | number> = {}) => `«${template}»${JSON.stringify(vars)}`
    expect(pulseShort({ kind: 'count', same: 37, total: 140 }, t)).toBe('«Others chose this too: {same} of {total} respondents»{"same":"37","total":"140"}')
  })
})

describe('the moments you share with others', () => {
  it('takes your own answers that have counts, newest first', () => {
    const h = { answers: [answer('2026-10-26', 'q1'), answer('2026-10-27', 'q2', { optionId: 'b' })], skips: [] }
    expect(sharedMoments(counts, h)).toEqual([
      { questionId: 'q2', optionId: 'b', date: '2026-10-27', theme: 'rest', line: { kind: 'few' } },
      { questionId: 'q1', optionId: 'a', date: '2026-10-26', theme: 'rest', line: { kind: 'count', same: 37, total: 140 } },
    ])
  })

  it('never uses a heavy, regional or unrecorded answer, or one without counts yet', () => {
    const h = {
      answers: [answer('2026-10-27', 'q1', { heavy: true }), answer('2026-10-27', 'q2', { regional: true }), answer('2026-10-27', 'q1', { optionId: undefined }), answer('2026-10-27', 'q9')],
      skips: [],
    }
    expect(sharedMoments(counts, h)).toEqual([])
  })
})

describe('loading the counts', () => {
  it('keeps the last counts it got, and says so when it has to use them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ questions: counts }), { status: 200 })),
    )
    expect(await loadPulse('2026-10-28')).toEqual({ questions: counts, stale: false })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await loadPulse('2026-10-28')).toEqual({ questions: counts, stale: true })
  })

  it('has nothing to show before it has ever loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await loadPulse('2026-10-28')).toBeNull()
  })
})
