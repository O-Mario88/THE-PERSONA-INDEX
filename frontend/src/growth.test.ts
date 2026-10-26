import { beforeEach, describe, expect, it } from 'vitest'
import { growthPairs, GROWTH_GAP_DAYS } from './growth'
import type { CardText } from './insights'
import type { Reflection } from './notebook'
import type { AnswerRecord, History } from './profile'

// Your Growth (Insights Release 3): "Earlier / More recent" pairs, built only
// from the person's own answers (and reflections, if they chose to include
// them) in the same part of life, at least two weeks apart. Never invented:
// no pair without two real entries far enough apart.

const today = '2026-10-26'

const answer = (date: string, questionId: string, theme: string, more: Partial<AnswerRecord> = {}): AnswerRecord => ({
  date,
  questionId,
  theme,
  depth: 2,
  traits: {},
  optionId: 'a',
  ...more,
})

const card = (questionId: string, date: string, prompt: string, label: string, theme = 'colleagues'): CardText =>
  ({ date, questionId, theme, prompt, label }) as CardText

function texts(...cards: CardText[]) {
  const by = new Map(cards.map((c) => [c.questionId, c]))
  return (id: string) => by.get(id) ?? null
}

const reflection = (id: string, date: string, area: Reflection['area'], answer: string): Reflection => ({
  kind: 'reflection',
  at: 0,
  id,
  date,
  period: 'day',
  area,
  group: 'learnt',
  source: 'answers',
  about: '',
  question: 'What did today teach you?',
  answer,
})

const history = (...answers: AnswerRecord[]): History => ({ answers, skips: [] })

beforeEach(() => localStorage.clear())

describe('growthPairs', () => {
  it('pairs the earliest and latest answers in one part of life, at least two weeks apart', () => {
    const h = history(
      answer('2026-10-02', 'q-old', 'colleagues'),
      answer('2026-10-10', 'q-mid', 'colleagues'),
      answer('2026-10-24', 'q-new', 'work-career'),
    )
    const cards = texts(
      card('q-old', '2026-10-02', 'Stuck on a task for an hour?', 'Stay late alone'),
      card('q-mid', '2026-10-10', 'A meeting runs over?', 'Say nothing'),
      card('q-new', '2026-10-24', 'Your idea is ignored?', 'Raise it again', 'work-career'),
    )
    expect(growthPairs(h, [], today, cards)).toEqual([
      {
        area: 'work',
        kind: 'answers',
        earlier: { date: '2026-10-02', asked: 'Stuck on a task for an hour?', words: 'Stay late alone' },
        recent: { date: '2026-10-24', asked: 'Your idea is ignored?', words: 'Raise it again' },
      },
    ])
  })

  it('needs two weeks between them, and two real entries', () => {
    expect(GROWTH_GAP_DAYS).toBe(14)
    const close = history(answer('2026-10-12', 'q1', 'colleagues'), answer('2026-10-25', 'q2', 'colleagues'))
    const cards = texts(card('q1', '2026-10-12', 'A?', 'x'), card('q2', '2026-10-25', 'B?', 'y'))
    expect(growthPairs(close, [], today, cards)).toEqual([])
    const one = history(answer('2026-10-01', 'q1', 'colleagues'))
    expect(growthPairs(one, [], today, texts(card('q1', '2026-10-01', 'A?', 'x')))).toEqual([])
  })

  it('leaves out private, heavy and wordless answers, never filling a gap', () => {
    const h = history(
      answer('2026-10-01', 'q-private', 'intimacy'),
      answer('2026-10-02', 'q-heavy', 'family', { heavy: true }),
      answer('2026-10-03', 'q-nocard', 'family'),
      answer('2026-10-25', 'q-new', 'family'),
    )
    const cards = texts(
      card('q-private', '2026-10-01', 'Private?', 'p', 'intimacy'),
      card('q-heavy', '2026-10-02', 'Heavy?', 'h', 'family'),
      card('q-new', '2026-10-25', 'New?', 'n', 'family'),
    )
    expect(growthPairs(h, [], today, cards)).toEqual([])
  })

  it('uses reflections only when the person chose to include them, by area, in their own words', () => {
    const rs = [reflection('r2', '2026-10-23', 'health', 'I slept better after the walk.'), reflection('r1', '2026-10-01', 'health', 'I keep staying up.')]
    expect(growthPairs(history(), rs, today, texts())).toEqual([])
    expect(growthPairs(history(), rs, today, texts(), { reflections: true })).toEqual([
      {
        area: 'health',
        kind: 'reflections',
        earlier: { date: '2026-10-01', asked: 'What did today teach you?', words: 'I keep staying up.' },
        recent: { date: '2026-10-23', asked: 'What did today teach you?', words: 'I slept better after the walk.' },
      },
    ])
  })

  it('shows at most three, the most recently active part of life first', () => {
    const areas = ['colleagues', 'family', 'friendship', 'money'] as const
    const answers = areas.flatMap((theme, i) => [answer('2026-10-01', `old-${theme}`, theme), answer(`2026-10-2${i}`, `new-${theme}`, theme)])
    const cards = texts(...areas.flatMap((theme, i) => [card(`old-${theme}`, '2026-10-01', 'Then?', 'a', theme), card(`new-${theme}`, `2026-10-2${i}`, 'Now?', 'b', theme)]))
    expect(growthPairs(history(...answers), [], today, cards).map((p) => p.area)).toEqual(['money', 'social', 'family'])
  })
})
