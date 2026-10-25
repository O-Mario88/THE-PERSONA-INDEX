import { beforeEach, describe, expect, it } from 'vitest'
import type { Mirror, Option, Question } from './api'
import { areaOf, reflectionItems, reflectionPrompts, dayMonth } from './reflect'
import { keepReflection, reflections } from './notebook'
import { TRAITS } from './traits'

const q = (id: string, theme: string): Question => ({ id, theme, prompt: `${id}?`, options: [] })
const o = (reveal: string, otherSide?: string): Option => ({ id: 'a', label: 'A', insight: { reveal, otherSide, step: 'Try it.' } })

const answered = [
  { question: q('q1', 'colleagues'), option: o('You show up for people at work. You stay when it counts.', 'Staying every time can leave little for you.') },
  { question: q('q2', 'family'), option: o('Feeding people is how you care. You start early.') },
]

const week = (score: number): Pick<Mirror, 'traits'> => ({
  traits: [{ trait: 'conscientiousness', answers: 14, days: 5, weeks: 2, level: 'steady', score, history: [], evidence: [] }],
})

describe('reflection', () => {
  beforeEach(() => localStorage.clear())

  it('finds what the person learnt and where to grow in their own answers, by area', () => {
    const items = reflectionItems('day', answered, null, null)
    expect(items.filter((i) => i.group === 'learnt').map((i) => [i.area, i.text])).toEqual([
      ['work', 'You show up for people at work.'],
      ['family', 'Feeding people is how you care.'],
    ])
    expect(items.filter((i) => i.group === 'grow').map((i) => i.text)).toEqual(['Staying every time can leave little for you.'])
    expect(items.some((i) => i.group === 'strength')).toBe(false)
  })

  it('takes strengths only from an earned read of the week, kindly worded', () => {
    const items = reflectionItems('week', [], week(80), null)
    expect(items.find((i) => i.group === 'strength')?.text).toBe(TRAITS.conscientiousness.high.strength)
    expect(items.find((i) => i.group === 'grow' && i.source === 'week')?.text).toBe(TRAITS.conscientiousness.high.grow)
    expect(reflectionItems('day', [], week(80), null)).toEqual([])
  })

  it('adds what the circle sees, blended, only once the Outside Mirror is open', () => {
    const closed = reflectionItems('week', [], null, { open: false, friends: 2, need: 3, weeks: 4, traits: [] })
    expect(closed).toEqual([])
    const open = reflectionItems('week', [], null, { open: true, friends: 4, need: 3, weeks: 4, traits: [{ trait: 'conscientiousness', position: 25 }] })
    expect(open.map((i) => [i.group, i.source, i.text])).toEqual([['strength', 'circle', TRAITS.conscientiousness.low.strength]])
  })

  it('asks a question for each, and follows up an earlier answer about growing', () => {
    const items = reflectionItems('week', answered, null, null)
    keepReflection({ id: 'r1', date: '2026-10-18', period: 'week', area: 'work', group: 'grow', source: 'answers', about: 'x', question: 'q', answer: 'Leave on time on Fridays.' })
    const prompts = reflectionPrompts(items, 'week', reflections(), '2026-10-25')
    expect(prompts[0].question).toBe('On 18 October you wrote: “Leave on time on Fridays.” How has it gone since?')
    expect(prompts[1].question).toBe('Where did you see this in yourself this week?')
    expect(prompts.some((p) => p.question === 'What is one small thing you could do differently next week?')).toBe(true)
  })

  it('keeps every reflection on the phone, newest first', () => {
    keepReflection({ id: 'a', date: '2026-10-20', period: 'day', area: 'self', group: 'learnt', source: 'answers', about: 'x', question: 'q', answer: 'first' })
    keepReflection({ id: 'b', date: '2026-10-24', period: 'week', area: 'work', group: 'grow', source: 'week', about: 'y', question: 'q', answer: 'second' })
    expect(reflections().map((r) => r.answer)).toEqual(['second', 'first'])
    expect(localStorage.getItem('pi.nb.reflection.b')).toContain('second')
  })

  it('places themes in the eight areas and writes dates day first', () => {
    expect(areaOf('work-career')).toBe('work')
    expect(areaOf('faith')).toBe('culture')
    expect(areaOf(undefined)).toBe('self')
    expect(dayMonth('2026-10-24')).toBe('24 October')
  })
})
