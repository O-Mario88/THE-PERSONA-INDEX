import { beforeEach, describe, expect, it } from 'vitest'
import { keepIntention } from './notebook'
import { helpedLines, rememberReport, reportedOutcome, stepsToAsk, type WhatHelpedStep } from './stepReports'

// What Helped (Insights Release 2): the steps someone saved, asked about from
// the next day; what this phone already said; and the totals in plain words,
// counts only, "a few" where the server folded a small group.

const today = '2026-10-26'

function answered(questionId: string, optionId: string, date = '2026-10-24') {
  const h = JSON.parse(localStorage.getItem('pi.history.v1') ?? '{"answers":[],"skips":[]}')
  h.answers.push({ date, questionId, theme: 'habits', depth: 2, traits: {}, optionId })
  localStorage.setItem('pi.history.v1', JSON.stringify(h))
}

const step = (outcomes: WhatHelpedStep['outcomes']): WhatHelpedStep => ({
  questionId: 'q1',
  optionId: 'a',
  total: outcomes.reduce((n, o) => n + o.count, 0),
  outcomes,
})

beforeEach(() => localStorage.clear())

describe('stepsToAsk', () => {
  it('offers a step saved from Insights from the next day, with the answer it came from', () => {
    answered('q1', 'a')
    keepIntention({ id: 'insight-q1', date: '2026-10-25', text: 'Leave one cup until morning.', from: 'q1' })
    expect(stepsToAsk(today)).toEqual([{ questionId: 'q1', optionId: 'a', text: 'Leave one cup until morning.', saved: '2026-10-25' }])
  })

  it('waits a day after saving, so there was a chance to try it', () => {
    answered('q1', 'a')
    keepIntention({ id: 'insight-q1', date: today, text: 'Leave one cup until morning.', from: 'q1' })
    expect(stepsToAsk(today)).toEqual([])
  })

  it('stops asking after 30 days, while the server still has the answer it came from', () => {
    answered('q1', 'a', '2026-09-20')
    keepIntention({ id: 'insight-q1', date: '2026-09-26', text: 'Leave one cup until morning.', from: 'q1' })
    expect(stepsToAsk(today)).toEqual([{ questionId: 'q1', optionId: 'a', text: 'Leave one cup until morning.', saved: '2026-09-26' }])
    keepIntention({ id: 'insight-q1', date: '2026-09-25', text: 'Leave one cup until morning.', from: 'q1' })
    expect(stepsToAsk(today)).toEqual([])
  })

  it('leaves out intentions written in Reflect, and a step whose answer is no longer on the phone', () => {
    keepIntention({ id: 'r-1', date: '2026-10-20', text: 'Call my sister on Sundays.', from: 'r-1' })
    keepIntention({ id: 'insight-gone', date: '2026-10-20', text: 'An old step.', from: 'gone' })
    expect(stepsToAsk(today)).toEqual([])
  })
})

describe('what this phone reported', () => {
  it('is remembered per step, and nothing before it was sent', () => {
    expect(reportedOutcome('q1', 'a')).toBeNull()
    rememberReport('q1', 'a', 'helped_little')
    expect(reportedOutcome('q1', 'a')).toBe('helped_little')
    expect(reportedOutcome('q1', 'b')).toBeNull()
    rememberReport('q1', 'a', 'not_tried')
    expect(reportedOutcome('q1', 'a')).toBe('not_tried')
  })

  it('ignores anything that is not an outcome', () => {
    localStorage.setItem('pi.helped.q1.a', 'helped')
    expect(reportedOutcome('q1', 'a')).toBeNull()
  })
})

describe('helpedLines', () => {
  it('says how those who tried it found it, in counts, and who did not try apart', () => {
    const lines = helpedLines(
      step([
        { outcome: 'helped_lot', count: 41 },
        { outcome: 'helped_little', count: 12 },
        { outcome: 'no_change', count: 10 },
        { outcome: 'not_tried', count: 15 },
      ]),
    )
    expect(lines.tried).toBe(
      'Of those who tried this and reported back, 41 said it helped a lot, 12 said it helped a little and 10 saw no change.',
    )
    expect(lines.notTried).toBe('15 more said they didn’t get to try it.')
  })

  it('says “a few” with no number where the server folded a small group, and leaves real zeros out', () => {
    const lines = helpedLines(
      step([
        { outcome: 'helped_lot', count: 50 },
        { outcome: 'helped_little', count: 0 },
        { outcome: 'no_change', count: 0, few: true },
        { outcome: 'not_tried', count: 0, few: true },
      ]),
    )
    expect(lines.tried).toBe('Of those who tried this and reported back, 50 said it helped a lot and a few saw no change.')
    expect(lines.notTried).toBe('A few more said they didn’t get to try it.')
  })

  it('never shows a percentage', () => {
    const { tried, notTried } = helpedLines(step([{ outcome: 'helped_lot', count: 60 }, { outcome: 'not_tried', count: 20 }]))
    expect(`${tried} ${notTried}`).not.toMatch(/%|percent/)
  })

  it('has nothing to say about trying when everyone who reported back didn’t try', () => {
    const lines = helpedLines(step([{ outcome: 'not_tried', count: 55 }]))
    expect(lines.tried).toBeNull()
    expect(lines.notTried).toBe('55 who reported back said they didn’t get to try it.')
  })
})
