import { describe, expect, it, beforeEach } from 'vitest'
import type { Question } from './api'
import {
  interestScores,
  lowMoodRepeated,
  pickThree,
  readTraits,
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

describe('picking the afternoon three', () => {
  const day = pool.concat([q('l1', 'learning'), q('d1', 'dating', 'personal'), q('o1', 'honesty', 'personal')])
  const afternoonDefaults = [day[4], day[6], day[7]]

  it('gives a phone with no history the shared afternoon three', () => {
    expect(pickThree(day, afternoonDefaults, { answers: [], skips: [] }, '2026-10-12', false, defaults)).toEqual(
      afternoonDefaults,
    )
  })

  it("never repeats the morning's questions or themes", () => {
    const h: History = {
      answers: [answer('2026-10-10', 'money', 4), answer('2026-10-11', 'friendship', 3), answer('2026-10-11', 'learning', 4)],
      skips: [],
    }
    const morning = pickThree(day, defaults, h, '2026-10-12', false)
    const afternoon = pickThree(day, afternoonDefaults, h, '2026-10-12', false, morning)
    expect(afternoon).toHaveLength(3)
    const morningThemes = new Set(morning.map((m) => m.theme))
    expect(afternoon.some((a) => morning.includes(a) || morningThemes.has(a.theme))).toBe(false)
  })

  it('tops the defaults up from the pool when the morning took one of them', () => {
    const took = [afternoonDefaults[0]]
    const afternoon = pickThree(day, afternoonDefaults, { answers: [], skips: [] }, '2026-10-12', false, took)
    expect(afternoon).toHaveLength(3)
    expect(afternoon).not.toContain(afternoonDefaults[0])
    expect(afternoon.some((a) => a.care === 'intimate')).toBe(false)
  })
})

describe('the trait read', () => {
  it('says how many answers it rests on, and stays early below three weeks of daily play', () => {
    const answers = Array.from({ length: 4 }, (_, i) => answer('2026-10-11', `t${i}`, 3, { conscientiousness: 1 }))
    const read = readTraits({ answers, skips: [] }, '2026-10-12')
    expect(read.label).toBe('Early read, 4 answers')
    expect(read.traits[0]).toMatchObject({ trait: 'conscientiousness', direction: 'higher' })
  })

  it('only uses the last seven days', () => {
    const read = readTraits({ answers: [answer('2026-10-01', 'money', 4, { present_bias: 2 })], skips: [] }, '2026-10-12')
    expect(read.traits).toEqual([])
    expect(read.label).toBe('No answers this week yet')
  })

  it('leaves out traits with too little to go on', () => {
    const read = readTraits({ answers: [answer('2026-10-11', 'money', 4, { present_bias: 2 })], skips: [] }, '2026-10-12')
    expect(read.traits).toEqual([])
  })
})

describe('low mood care', () => {
  it('notices repeated low-mood answers in a week, and not a single one', () => {
    const one = { answers: [answer('2026-10-11', 'sadness-stress', 4)], skips: [] }
    expect(lowMoodRepeated(one, '2026-10-12')).toBe(false)
    const three = {
      answers: ['2026-10-09', '2026-10-10', '2026-10-11'].map((d) => answer(d, 'sadness-stress', 4)),
      skips: [],
    }
    expect(lowMoodRepeated(three, '2026-10-12')).toBe(true)
  })
})

describe('evening answers', () => {
  const evening = (date: string, traits: Record<string, number>) => ({
    ...answer(date, 'money', 0, traits),
    questionId: `${date}#evening`,
    evening: true as const,
  })

  it('count towards the trait read, but not the size of the read, interest or low-mood care', () => {
    const h: History = {
      answers: [
        answer('2026-10-11', 'money', 4, { present_bias: 1 }),
        evening('2026-10-11', { present_bias: 1 }),
        { ...evening('2026-10-10', {}), theme: 'sadness-stress' },
        { ...evening('2026-10-09', {}), theme: 'sadness-stress' },
        { ...evening('2026-10-08', {}), theme: 'sadness-stress' },
      ],
      skips: [],
    }
    const read = readTraits(h, '2026-10-12')
    expect(read.traits).toEqual([{ trait: 'present_bias', direction: 'higher', answers: 2 }])
    expect(read.label).toBe('Early read, 1 answer')
    expect(interestScores(h, '2026-10-12')).toEqual(interestScores({ answers: [h.answers[0]], skips: [] }, '2026-10-12'))
    expect(lowMoodRepeated(h, '2026-10-12')).toBe(false)
  })
})
