import { describe, expect, it, beforeEach } from 'vitest'
import type { Question } from './api'
import {
  changeLine,
  changesBetween,
  earned,
  heavyPause,
  interestScores,
  isLowMood,
  leaningVerdict,
  notMeSides,
  pickThree,
  recordAnswer,
  recordVerdict,
  rememberLeaning,
  threadLine,
  traitsOf,
  loadHistory,
  writeFirstOf,
  type AnswerRecord,
  type History,
} from './profile'

const q = (id: string, theme: string, care: Question['care'] = 'everyday'): Question => ({
  id,
  theme,
  care,
  prompt: id,
  options: [
    { id: 'a', label: 'A', depth: 1 },
    { id: 'b', label: 'B', depth: 4, traits: { conscientiousness: 1 } },
  ],
})

const pool = [
  q('m1', 'money'),
  q('m2', 'money'),
  q('f1', 'friendship', 'personal'),
  q('s1', 'sleep-health'),
  q('a1', 'anger', 'personal'),
  q('i1', 'intimacy', 'intimate'),
  q('h1', 'habits'),
]
const defaults = [pool[0], pool[2], pool[3]]

const answer = (date: string, theme: string, depth: number, traits: Record<string, number> = {}) => ({
  date,
  questionId: `${date}-${theme}`,
  theme,
  depth,
  traits,
})

beforeEach(() => localStorage.clear())

describe('interest scores', () => {
  it('rise with deep answers and fall with light answers and skips', () => {
    const h: History = {
      answers: [answer('2026-10-12', 'money', 4), answer('2026-10-12', 'anger', 1)],
      skips: [{ date: '2026-10-12', theme: 'sleep-health' }],
    }
    const s = interestScores(h, '2026-10-12')
    expect(s.money).toBeGreaterThan(0)
    expect(s.anger).toBeLessThan(0)
    expect(s['sleep-health']).toBeLessThan(0)
  })

  it('fade over about two weeks', () => {
    const h: History = { answers: [answer('2026-10-01', 'money', 4)], skips: [] }
    const fresh = interestScores(h, '2026-10-01').money
    const later = interestScores(h, '2026-10-15').money
    expect(later).toBeLessThan(fresh / 3)
  })
})

describe('picking three from the pool', () => {
  it('gives a phone with no history the shared default three', () => {
    expect(pickThree(pool, defaults, { answers: [], skips: [] }, '2026-10-12', false)).toEqual(defaults)
  })

  it('leans to high-interest themes, adds one rarely seen theme, and never repeats a theme', () => {
    const h: History = {
      answers: [
        answer('2026-10-10', 'money', 4),
        answer('2026-10-11', 'money', 4),
        answer('2026-10-11', 'friendship', 3),
        answer('2026-10-11', 'sleep-health', 1),
        answer('2026-10-10', 'sleep-health', 1),
      ],
      skips: [],
    }
    const picked = pickThree(pool, defaults, h, '2026-10-12', false)
    const themes = picked.map((p) => p.theme)
    expect(picked).toHaveLength(3)
    expect(new Set(themes).size).toBe(3)
    expect(themes.slice(0, 2)).toEqual(['money', 'friendship'])
    // The third is a theme this phone has never answered.
    expect(['anger', 'habits']).toContain(themes[2])
  })

  it('never offers intimacy questions without the 18+ tap', () => {
    const h: History = { answers: [answer('2026-10-11', 'intimacy', 4), answer('2026-10-11', 'intimacy', 4)], skips: [] }
    expect(pickThree(pool, defaults, h, '2026-10-12', false).some((p) => p.care === 'intimate')).toBe(false)
    expect(pickThree(pool, defaults, h, '2026-10-12', true).some((p) => p.care === 'intimate')).toBe(true)
  })
})

describe('picking the evening three', () => {
  const day = pool.concat([q('l1', 'learning'), q('d1', 'dating', 'personal'), q('o1', 'honesty', 'personal')])
  const eveningDefaults = [day[4], day[6], day[7]]

  it('gives a phone with no history the shared evening three', () => {
    expect(pickThree(day, eveningDefaults, { answers: [], skips: [] }, '2026-10-12', false, defaults)).toEqual(
      eveningDefaults,
    )
  })

  it("never repeats the morning's questions or themes", () => {
    const h: History = {
      answers: [answer('2026-10-10', 'money', 4), answer('2026-10-11', 'friendship', 3), answer('2026-10-11', 'learning', 4)],
      skips: [],
    }
    const morning = pickThree(day, defaults, h, '2026-10-12', false)
    const evening = pickThree(day, eveningDefaults, h, '2026-10-12', false, morning)
    expect(evening).toHaveLength(3)
    const morningThemes = new Set(morning.map((m) => m.theme))
    expect(evening.some((a) => morning.includes(a) || morningThemes.has(a.theme))).toBe(false)
  })

  it('tops the defaults up from the pool when the morning took one of them', () => {
    const took = [eveningDefaults[0]]
    const evening = pickThree(day, eveningDefaults, { answers: [], skips: [] }, '2026-10-12', false, took)
    expect(evening).toHaveLength(3)
    expect(evening).not.toContain(eveningDefaults[0])
    expect(evening.some((a) => a.care === 'intimate')).toBe(false)
  })
})

describe('how far a leaning is earned', () => {
  const on = (date: string, w: number) => answer(date, 'habits', 2, { conscientiousness: w })

  it('is a hint from one or two answers, or from one day', () => {
    expect(earned({ answers: [on('2026-10-12', 1)], skips: [] }, '2026-10-12', 'conscientiousness', true)).toEqual({
      level: 'hint',
      answers: 1,
      days: 1,
      weeks: 1,
    })
    const oneDay = { answers: [1, 2, 3].map((i) => ({ ...on('2026-10-12', 1), questionId: `q${i}` })), skips: [] }
    expect(earned(oneDay, '2026-10-12', 'conscientiousness', true).level).toBe('hint')
  })

  it('is a pattern from three answers on two days, and steady from seven across three weeks', () => {
    const three = { answers: ['2026-10-12', '2026-10-13', '2026-10-13'].map((d) => on(d, 1)), skips: [] }
    expect(earned(three, '2026-10-13', 'conscientiousness', true)).toMatchObject({ level: 'pattern', answers: 3, days: 2 })
    const seven = {
      answers: ['2026-09-28', '2026-09-29', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-12', '2026-10-13'].map((d) => on(d, 2)),
      skips: [],
    }
    expect(earned(seven, '2026-10-13', 'conscientiousness', true)).toMatchObject({ level: 'steady', answers: 7, weeks: 3 })
    expect(earned(seven, '2026-10-13', 'conscientiousness', false).answers).toBe(0)
  })
})

describe('the tap under a card', () => {
  const question: Question = {
    id: '2026-10-12-dishes',
    theme: 'habits',
    prompt: 'Dishes?',
    options: [
      { id: 'now', label: 'Right away', depth: 1, traits: { conscientiousness: 1 } },
      { id: 'pile', label: 'When the pile is high', depth: 3, traits: { conscientiousness: -1 } },
    ],
  }
  beforeEach(() => localStorage.clear())

  it('is kept with the answer, and "Not me" takes it out of every read', () => {
    recordAnswer(question, 'now', '2026-10-12')
    recordVerdict(question.id, 'partly')
    let [a] = loadHistory().answers
    expect(a).toMatchObject({ optionId: 'now', verdict: 'partly' })
    expect(traitsOf(a)).toEqual({ conscientiousness: 1 })

    recordVerdict(question.id, 'not_me')
    ;[a] = loadHistory().answers
    expect(traitsOf(a)).toEqual({})

    recordVerdict(question.id, 'not_me', { optionId: 'pile', traits: { conscientiousness: -1 } })
    ;[a] = loadHistory().answers
    expect(traitsOf(a)).toEqual({ conscientiousness: -1 })
  })

  it('on a leaning, stays on the phone for five weeks', () => {
    rememberLeaning('rumination', true, 'not_me', '2026-10-12')
    expect(leaningVerdict('rumination', true, '2026-10-20')).toBe('not_me')
    expect(leaningVerdict('rumination', false, '2026-10-20')).toBeNull()
    expect(notMeSides('2026-10-20')).toEqual(['rumination.high'])
    expect(leaningVerdict('rumination', true, '2026-11-17')).toBeNull()
    expect(notMeSides('2026-11-17')).toEqual([])
  })
})

describe('the thread line', () => {
  const ask = (date: string): Question => ({
    id: `${date}-dishes`,
    theme: 'habits',
    prompt: 'Dishes?',
    options: [
      { id: 'now', label: 'Right away', depth: 1, traits: { conscientiousness: 1 } },
      { id: 'pile', label: 'When the pile is high', depth: 3, traits: { conscientiousness: -1 } },
    ],
  })
  const rec = (date: string, questionId: string, traits: Record<string, number>, optionId?: string) => ({
    ...answer(date, 'habits', 2, traits),
    questionId,
    optionId,
  })

  it('says nothing when there is nothing true to say', () => {
    const h: History = { answers: [rec('2026-10-14', '2026-10-14-dishes', { conscientiousness: 1 }, 'now')], skips: [] }
    expect(threadLine(h, ask('2026-10-14'), 'now', '2026-10-14')).toBeNull()
  })

  it('counts this week\'s answers that leaned the same way, this one included', () => {
    const h: History = {
      answers: [
        rec('2026-10-11', 'x0', { conscientiousness: 1 }), // last week
        rec('2026-10-12', 'x1', { conscientiousness: 2 }),
        rec('2026-10-13', 'x2', { conscientiousness: -1 }), // the other way
        rec('2026-10-13', 'x3', { conscientiousness: 1 }, 'a'),
        rec('2026-10-14', '2026-10-14-dishes', { conscientiousness: 1 }, 'now'),
      ],
      skips: [],
    }
    expect(threadLine(h, ask('2026-10-14'), 'now', '2026-10-14')).toBe(
      'Third time this week your answer leaned towards getting things done.',
    )
    h.answers[3].verdict = 'not_me'
    expect(threadLine(h, ask('2026-10-14'), 'now', '2026-10-14')).toBe(
      'Second time this week your answer leaned towards getting things done.',
    )
  })

  it('remembers the last time the same question came up', () => {
    const before: History = {
      answers: [
        rec('2026-09-14', '2026-09-14-dishes', { conscientiousness: -1 }, 'pile'),
        rec('2026-10-14', '2026-10-14-dishes', { conscientiousness: 1 }, 'now'),
      ],
      skips: [],
    }
    expect(threadLine(before, ask('2026-10-14'), 'now', '2026-10-14')).toBe(
      'When this came up on 14 September, you chose “When the pile is high”.',
    )
    before.answers[0].optionId = 'now'
    expect(threadLine(before, ask('2026-10-14'), 'now', '2026-10-14')).toBe('Same answer as when this came up on 14 September.')
    // Never for an intimacy question.
    expect(threadLine(before, { ...ask('2026-10-14'), care: 'intimate' }, 'now', '2026-10-14')).toBeNull()
  })
})

describe('the write-first card', () => {
  const sitting = [q('m1', 'money'), q('h1', 'habits'), q('i1', 'intimacy', 'intimate')]

  it('is the question in the theme answered most deeply lately', () => {
    const h: History = { answers: [answer('2026-10-10', 'habits', 4), answer('2026-10-11', 'money', 3)], skips: [] }
    expect(writeFirstOf(sitting, h, '2026-10-12')).toBe('h1')
  })

  it('waits for a deep answer, judges only answers before today, and never picks intimacy', () => {
    expect(writeFirstOf(sitting, { answers: [answer('2026-10-10', 'habits', 2)], skips: [] }, '2026-10-12')).toBeNull()
    expect(writeFirstOf(sitting, { answers: [answer('2026-10-12', 'habits', 4)], skips: [] }, '2026-10-12')).toBeNull()
    expect(writeFirstOf(sitting, { answers: [answer('2026-10-10', 'intimacy', 4)], skips: [] }, '2026-10-12')).toBeNull()
  })
})

describe('low and heavy answers', () => {
  it('reads deep answers about sadness and stress as low mood', () => {
    expect(isLowMood('sadness-stress', 3)).toBe(true)
    expect(isLowMood('sadness-stress', 2)).toBe(false)
    expect(isLowMood('anger', 4)).toBe(false)
  })

  it('records a heavy answer as heavy, and only that one', () => {
    const alone: Question = {
      id: '2026-10-12-sadness-stress-007',
      theme: 'sadness-stress',
      care: 'personal',
      prompt: 'Your phone has been quiet all week. What goes through your head?',
      options: [
        { id: 'busy', label: 'Everyone is busy', depth: 1 },
        { id: 'forgotten', label: 'I wonder if people have forgotten me', depth: 4, heavy: true },
      ],
    }
    recordAnswer(alone, 'forgotten', '2026-10-12')
    recordAnswer({ ...alone, id: '2026-10-13-sadness-stress-007' }, 'busy', '2026-10-13')
    expect(loadHistory().answers.map((a) => a.heavy)).toEqual([true, undefined])
  })

  it('pauses the honest part on the day of a heavy answer, or after two in a week', () => {
    const heavy = (date: string) => ({ ...answer(date, 'sadness-stress', 4), questionId: `${date}-h`, heavy: true as const })
    expect(heavyPause({ answers: [heavy('2026-10-14')], skips: [] }, '2026-10-14')).toBe(true)
    expect(heavyPause({ answers: [heavy('2026-10-13')], skips: [] }, '2026-10-14')).toBe(false)
    expect(heavyPause({ answers: [heavy('2026-10-09'), heavy('2026-10-13')], skips: [] }, '2026-10-14')).toBe(true)
    expect(heavyPause({ answers: [heavy('2026-10-06'), heavy('2026-10-13')], skips: [] }, '2026-10-14')).toBe(false)
    expect(heavyPause({ answers: [answer('2026-10-14', 'sadness-stress', 4)], skips: [] }, '2026-10-14')).toBe(false)
  })
})

describe('change against your own past', () => {
  const rec = (date: string, n: number, traits: Record<string, number>, extra: Partial<AnswerRecord> = {}): AnswerRecord => ({
    ...answer(date, 'friendship', 2, traits),
    questionId: `${date}-q${n}`,
    optionId: 'a',
    ...extra,
  })
  const quiet = { agreeableness: 1 } // keeping the peace
  const straight = { agreeableness: -1 } // saying what you think
  const past = [rec('2026-09-20', 1, straight), rec('2026-09-23', 1, quiet), rec('2026-09-30', 1, quiet), rec('2026-10-07', 1, quiet)]

  it('notices the first answer in weeks that leans the other way', () => {
    const h: History = { answers: [...past, rec('2026-10-14', 1, straight)], skips: [] }
    expect(changeLine(h, '2026-10-14-q1')).toBe('First time in three weeks your answer leaned towards saying what you think.')
    expect(changesBetween(h, '2026-10-12', '2026-10-18')).toEqual([
      { date: '2026-10-14', questionId: '2026-10-14-q1', trait: 'agreeableness', high: false, weeks: 3 },
    ])
    // The thread line on the card leads with it.
    const card: Question = { id: '2026-10-14-q1', theme: 'friendship', prompt: '', options: [] }
    expect(threadLine(h, card, 'a', '2026-10-14')).toBe(
      'First time in three weeks your answer leaned towards saying what you think.',
    )
  })

  it('counts from the first of the other answers when this side never came up', () => {
    const h: History = { answers: [...past.slice(1), rec('2026-10-14', 1, straight)], skips: [] }
    expect(changeLine(h, '2026-10-14-q1')).toBe('First time in three weeks your answer leaned towards saying what you think.')
  })

  it('stays quiet without three answers the other way, or within two weeks', () => {
    expect(changeLine({ answers: [...past.slice(0, 3), rec('2026-10-14', 1, straight)], skips: [] }, '2026-10-14-q1')).toBeNull()
    const recent = [rec('2026-10-02', 1, straight), rec('2026-10-05', 1, quiet), rec('2026-10-08', 1, quiet), rec('2026-10-10', 1, quiet)]
    expect(changeLine({ answers: [...recent, rec('2026-10-14', 1, straight)], skips: [] }, '2026-10-14-q1')).toBeNull()
    // The same side again is no change.
    expect(changeLine({ answers: [...past, rec('2026-10-14', 1, quiet)], skips: [] }, '2026-10-14-q1')).toBeNull()
  })

  it('leaves out evening answers, intimacy answers and answers that were "Not me"', () => {
    const fresh = rec('2026-10-14', 1, straight)
    const evening = { answers: [...past.slice(0, 3), rec('2026-10-08', 2, quiet, { evening: true }), fresh], skips: [] }
    expect(changeLine(evening, '2026-10-14-q1')).toBeNull()
    const intimate = { answers: [...past.slice(0, 3), rec('2026-10-08', 2, quiet, { theme: 'intimacy' }), fresh], skips: [] }
    expect(changeLine(intimate, '2026-10-14-q1')).toBeNull()
    const notMe = { answers: [...past.slice(0, 3), rec('2026-10-08', 2, quiet, { verdict: 'not_me' }), fresh], skips: [] }
    expect(changeLine(notMe, '2026-10-14-q1')).toBeNull()
    expect(changeLine({ answers: [...past, { ...fresh, theme: 'intimacy' }], skips: [] }, '2026-10-14-q1')).toBeNull()
  })
})

describe('evening answers', () => {
  const evening = (date: string, traits: Record<string, number>) => ({
    ...answer(date, 'money', 0, traits),
    questionId: `${date}#evening`,
    evening: true as const,
  })

  it('never move interest', () => {
    const h: History = {
      answers: [answer('2026-10-11', 'money', 4, { present_bias: 1 }), evening('2026-10-11', { present_bias: 1 })],
      skips: [],
    }
    expect(interestScores(h, '2026-10-12')).toEqual(interestScores({ answers: [h.answers[0]], skips: [] }, '2026-10-12'))
  })
})
