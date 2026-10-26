import { beforeEach, describe, expect, it } from 'vitest'
import { evidenceFor } from './insights'
import { checkPattern, patternCheckOf, patternsFor } from './patterns'
import type { AnswerRecord, History } from './profile'

// Patterns in the longer Mirrors (Insights Release 3): the evidence levels of
// Insights, asked about in the month, quarter and year Mirrors with "Does
// this still feel true?". Yes and Partly keep a pattern; No retires it, and
// only answers given after that can build it again. On this phone only.

const today = '2026-10-26'

const answer = (date: string, need: AnswerRecord['need'], more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId: `q-${date}-${need}`,
  theme: 'colleagues',
  depth: 2,
  traits: {},
  optionId: 'a',
  need,
  ...more,
})

const history = (...answers: AnswerRecord[]): History => ({ answers, skips: [] })

// Three answers reaching for calm, on days a week or more apart: a pattern.
const calmPattern = () => history(answer('2026-10-10', 'calm'), answer('2026-10-17', 'calm'), answer('2026-10-24', 'calm'))

beforeEach(() => localStorage.clear())

describe('patternsFor', () => {
  it('lists the needs Insights calls a pattern or something noticed, with the real counts behind them', () => {
    const h = history(
      ...calmPattern().answers,
      answer('2026-10-22', 'respect'),
      answer('2026-10-23', 'respect'),
      answer('2026-10-24', 'respect'),
      answer('2026-10-24', 'belonging'),
    )
    expect(patternsFor(h, today)).toEqual([
      { need: 'calm', evidence: 'pattern', answers: 3, days: 3, since: '2026-10-10' },
      { need: 'respect', evidence: 'noticing', answers: 3, days: 3, since: '2026-10-22' },
    ])
  })

  it('leaves out heavy and private answers, as Insights does', () => {
    const h = history(answer('2026-10-10', 'calm', { heavy: true }), answer('2026-10-17', 'calm', { theme: 'intimacy' }), answer('2026-10-24', 'calm'))
    expect(patternsFor(h, today)).toEqual([])
  })
})

describe('Does this still feel true?', () => {
  it('keeps the answer, and Yes or Partly keep the pattern', () => {
    checkPattern('calm', 'partly', today)
    expect(patternCheckOf('calm')).toEqual({ check: 'partly', date: today })
    expect(patternsFor(calmPattern(), today)[0].need).toBe('calm')
    expect(evidenceFor(calmPattern(), 'calm', today)).toBe('pattern')
  })

  it('No retires it in the Mirror and in Insights, until new answers build it again', () => {
    checkPattern('calm', 'no', today)
    expect(patternsFor(calmPattern(), today)).toEqual([])
    expect(evidenceFor(calmPattern(), 'calm', today)).toBe('thought')

    const later = history(...calmPattern().answers, answer('2026-10-27', 'calm'), answer('2026-11-03', 'calm'), answer('2026-11-10', 'calm'))
    expect(evidenceFor(later, 'calm', '2026-11-10')).toBe('pattern')
    expect(patternsFor(later, '2026-11-10')).toEqual([{ need: 'calm', evidence: 'pattern', answers: 3, days: 3, since: '2026-10-27' }])
  })

  it('ignores anything stored that is not an answer', () => {
    localStorage.setItem('pi.pattern.calm', '{"check":"maybe","date":"2026-10-26"}')
    expect(patternCheckOf('calm')).toBeNull()
  })
})
