import { beforeEach, describe, expect, it } from 'vitest'
import { checkIntention, intentions, reflections } from './notebook'
import { keepSense, memoryFor, resultFor, senseQuestions, SENSE_ASK, STARTS, type SenseAnswers } from './makeSense'
import { voiceProblems } from './voice'

beforeEach(() => localStorage.clear())

// Edwin's brief, 2026-10-29: "What would you like help making sense of
// today?" Five starting points, two or three questions, then within two
// minutes a small, editable result: what they described, a possible
// interpretation clearly presented as tentative, one practical next step,
// and a sentence they can use if a conversation is involved.
describe('the first experience', () => {
  it('asks what to make sense of, with five concrete starting points', () => {
    expect(SENSE_ASK).toBe('What would you like help making sense of today?')
    expect(STARTS.map((s) => s.label)).toEqual([
      'I keep overthinking something.',
      'I need to have a difficult conversation.',
      'I keep saying yes when I want to say no.',
      'I want to understand how my week has affected me.',
      'I just want somewhere to reflect.',
    ])
  })

  it('asks two or three questions for each, at least one in their own words', () => {
    for (const s of STARTS) {
      const qs = senseQuestions(s.id)
      expect(qs.length, s.id).toBeGreaterThanOrEqual(2)
      expect(qs.length, s.id).toBeLessThanOrEqual(3)
      expect(
        qs.some((q) => q.kind === 'words'),
        s.id,
      ).toBe(true)
    }
  })

  it('turns an evening of saying yes when stretched into the result from the brief', () => {
    const r = resultFor('yes', { said: 'helping with the move on Saturday', why: 'letdown', state: 'stretched' })
    expect(r.described).toBe('You said yes to “helping with the move on Saturday”, when you were already stretched.')
    expect(r.possibility).toBe('One possibility is that protecting the relationship mattered more in that moment than protecting your time. Does that fit?')
    expect(r.say).toBe('I can help tomorrow, but I can’t take this on tonight.')
    expect(r.step.length).toBeGreaterThan(20)
  })

  it('offers a sentence to say for a difficult conversation, and none for a week that only needs rest', () => {
    expect(resultFor('conversation', { who: 'work', want: 'that I need more notice', worry: 'heard' }).say).toBeTruthy()
    expect(resultFor('week', { felt: 'heavy', most: 'the long shifts', need: 'rest' }).say).toBeUndefined()
  })

  // Every combination of choices, for every starting point.
  const everyResult = () =>
    STARTS.flatMap((s) => {
      const qs = senseQuestions(s.id)
      const choiceQs = qs.filter((q) => q.kind === 'choice')
      const combos = choiceQs.reduce<SenseAnswers[]>((acc, q) => acc.flatMap((a) => (q.options ?? []).map((o) => ({ ...a, [q.id]: o.id }))), [{}])
      return combos.map((c) => {
        const answers = { ...c, ...Object.fromEntries(qs.filter((q) => q.kind === 'words').map((q) => [q.id, 'what happened'])) }
        return { start: s.id, result: resultFor(s.id, answers) }
      })
    })

  it('always says what they described, a tentative possibility, and one step, for every choice', () => {
    for (const { start, result } of everyResult()) {
      expect(result.described, start).toContain('what happened')
      expect(result.possibility, start).toMatch(/^One possibility is /)
      expect(result.possibility, start).toMatch(/Does that fit\?$/)
      expect(result.step.length, start).toBeGreaterThan(20)
    }
  })

  it('speaks in the app’s own voice, every line', () => {
    for (const { start, result } of everyResult()) {
      for (const line of [result.described, result.possibility, result.step, result.say ?? '']) expect(voiceProblems(line), `${start}: ${line}`).toEqual([])
    }
    for (const s of STARTS) for (const q of senseQuestions(s.id)) expect(voiceProblems(`${q.ask} ${(q.options ?? []).map((o) => o.label).join(' ')}`), q.ask).toEqual([])
  })
})

describe('keeping the result', () => {
  it('keeps it in the Notebook with its parts, and the step as something to try, checked on in two days', () => {
    const r = resultFor('yes', { said: 'the extra shift', why: 'quicker', state: 'fine' })
    const id = keepSense('yes', { said: 'the extra shift', why: 'quicker', state: 'fine' }, r, '2026-10-29', 1000)
    const kept = reflections().find((x) => x.id === id)
    expect(kept).toMatchObject({ source: 'sense', start: 'yes', answer: 'the extra shift', question: 'I keep saying yes when I want to say no.', possibility: r.possibility, step: r.step })
    expect(intentions()).toEqual([expect.objectContaining({ text: r.step, from: id, checkOn: '2026-10-31' })])
  })

  it('keeps the person’s own edits, not the first wording', () => {
    const r = { ...resultFor('overthinking', { what: 'the interview', circle: 'said', help: 'calm' }), step: 'Write it down once, then close the notebook.' }
    const id = keepSense('overthinking', { what: 'the interview', circle: 'said', help: 'calm' }, r, '2026-10-29', 2000)
    expect(reflections().find((x) => x.id === id)?.step).toBe('Write it down once, then close the notebook.')
  })
})

// "That statement must have a real supporting record."
describe('remembering what helped', () => {
  it('says nothing without a step that helped in a similar moment', () => {
    keepSense('yes', { said: 'the move', why: 'letdown', state: 'stretched' }, resultFor('yes', { said: 'the move', why: 'letdown', state: 'stretched' }), '2026-10-01', 1)
    expect(memoryFor('yes', '2026-10-29')).toBeNull()
  })

  it('brings back the step they tried and said helped, with the day it happened', () => {
    const r = { ...resultFor('yes', { said: 'the move', why: 'letdown', state: 'stretched' }), step: 'Ask for time before answering.' }
    keepSense('yes', { said: 'the move', why: 'letdown', state: 'stretched' }, r, '2026-10-01', 1)
    checkIntention(intentions()[0].id, 'helped', '2026-10-03')
    expect(memoryFor('yes', '2026-10-29')).toEqual({
      step: 'Ask for time before answering.',
      on: '2026-10-01',
      line: 'You described something similar on 1 October. You tried “Ask for time before answering”, and you said it helped. Would that be useful here?',
    })
    expect(memoryFor('conversation', '2026-10-29')).toBeNull()
  })

  it('leaves out a step that didn’t help', () => {
    keepSense('yes', { said: 'x', why: 'think', state: 'unsure' }, resultFor('yes', { said: 'x', why: 'think', state: 'unsure' }), '2026-10-01', 1)
    checkIntention(intentions()[0].id, 'not_yet', '2026-10-03')
    expect(memoryFor('yes', '2026-10-29')).toBeNull()
  })
})
