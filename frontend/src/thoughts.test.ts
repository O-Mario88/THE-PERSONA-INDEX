import { describe, expect, it } from 'vitest'
import type { Option, Question } from './api'
import type { Intention, KeptCard, Reflection } from './notebook'
import { CIRCLE_MIN, thoughtsFor, type ThoughtInput } from './thoughts'

// "A thought for you" (Reflect): one question at a time, built on this
// phone from templates and the person's own answers, cards, Mirrors and past
// reflections. Each says why it appeared, and never claims more than that.

const option = (id: string, label: string, extra: Partial<Option> = {}): Option => ({ id, label, insight: { reveal: 'You like a clear sink before you relax. More here.', step: 'x' }, ...extra }) as Option
const question = (id: string, prompt: string, extra: Partial<Question> = {}): Question => ({ id, prompt, theme: 'habits', options: [], ...extra }) as Question

const base: ThoughtInput = { period: 'day', today: '2026-10-25', answered: [], kept: [], traits: null, outside: null, past: [], due: [] }

describe('a thought for you', () => {
  it('always has a question for an ordinary day, and says it is for any day', () => {
    const [first] = thoughtsFor(base)
    expect(first.question).toBe('Where did you feel most like yourself today?')
    expect(first.why).toBe('A question for any day')
  })

  it('builds on an answer, and says which day it came from', () => {
    const q = question('q-dishes', 'When do you wash the dishes?')
    const t = thoughtsFor({ ...base, answered: [{ question: q, option: option('right-away', 'Right after eating'), date: '2026-10-20' }] })
    const built = t.find((x) => x.source === 'answers')!
    expect(built.question).toContain('“Right after eating”')
    expect(built.why).toBe('From your answers on Tuesday')
  })

  it('never builds on an intimate question or a heavy answer', () => {
    const t = thoughtsFor({
      ...base,
      answered: [
        { question: question('q-i', 'Private', { care: 'intimate' }), option: option('a', 'A'), date: '2026-10-25' },
        { question: question('q-h', 'Hard'), option: option('b', 'B', { heavy: true }), date: '2026-10-25' },
      ],
    })
    expect(t.some((x) => x.source === 'answers')).toBe(false)
  })

  it('gives the week and the month their own purposes', () => {
    const week = thoughtsFor({ ...base, period: 'week' }).map((x) => x.question)
    expect(week).toEqual(expect.arrayContaining(['What kept coming up for you this week?', 'What helped you most this week?', 'What changed for you this week, even a little?']))
    const month = thoughtsFor({ ...base, period: 'month' }).map((x) => x.question)
    expect(month).toEqual(expect.arrayContaining(['What did this month teach you about yourself?', 'Which intentions matter to you going into next month?']))
    expect(month).not.toContain('Where did you feel most like yourself today?')
  })

  it('brings back earlier words in the month, quoting them and their day', () => {
    const past = [{ id: 'r1', date: '2026-10-06', answer: 'I want to listen more carefully when family members speak.', question: 'q' } as Reflection]
    const t = thoughtsFor({ ...base, period: 'month', past }).find((x) => x.source === 'reflections')!
    expect(t.question).toContain('“I want to listen more carefully when family members speak.”')
    expect(t.why).toBe('From your reflection on 6 October')
  })

  it('checks in gently on something the person wanted to try', () => {
    const due = [{ id: 'i1', date: '2026-10-18', text: 'Ask for help earlier', from: 'r1', checkOn: '2026-10-25' } as Intention]
    const [first] = thoughtsFor({ ...base, due })
    expect(first.question).toBe('Did asking for help earlier make any difference?')
    expect(first.intention).toBe('i1')
  })

  it('uses the circle only once enough friends have answered that no one can be picked out', () => {
    const outside = { open: true, friends: CIRCLE_MIN - 1, need: 3, weeks: 3, traits: [{ trait: 'conscientiousness', position: 80 }] }
    expect(thoughtsFor({ ...base, period: 'week', outside }).some((x) => x.source === 'circle')).toBe(false)
    const enough = thoughtsFor({ ...base, period: 'week', outside: { ...outside, friends: CIRCLE_MIN } }).find((x) => x.source === 'circle')!
    expect(enough.why).toBe(`From your Circle, blended from ${CIRCLE_MIN} or more friends`)
    expect(CIRCLE_MIN).toBe(5)
  })

  it('builds on a kept card', () => {
    const kept = [{ questionId: 'q', date: '2026-10-24', headline: 'You finish what you start.' } as KeptCard]
    const t = thoughtsFor({ ...base, kept }).find((x) => x.source === 'kept')!
    expect(t.question).toContain('“You finish what you start.”')
    expect(t.why).toBe('From a card you kept on Saturday')
  })
})
