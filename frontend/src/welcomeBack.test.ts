import { beforeEach, describe, expect, it } from 'vitest'
import type { Intention, Reflection } from './notebook'
import type { History } from './profile'
import { voiceProblems } from './voice'
import { BREAK_DAYS, dismissWelcomeBack, lastActive, welcomeBack, WELCOME_BACK, WELCOME_BACK_LINE } from './welcomeBack'

// Edwin's brief, 2026-10-29: after a break, "Welcome back. Start with today,
// or pick up what you were exploring." No backlog. No lost progress. No guilt.

const TODAY = '2026-10-29'
const answered = (date: string) => ({ date, questionId: `${date}-q`, theme: 'work', optionId: 'a' }) as History['answers'][number]
const history = (...dates: string[]): History => ({ answers: dates.map(answered), skips: [] })
const sense = (id: string, date: string, answer: string): Reflection => ({
  kind: 'reflection',
  at: 1,
  id,
  date,
  period: 'day',
  area: 'self',
  group: 'learnt',
  source: 'sense',
  start: 'overthinking',
  about: '',
  question: 'I keep overthinking something.',
  answer,
})
const step = (id: string, date: string, text: string, check?: Intention['check']): Intention => ({
  kind: 'intention',
  at: 1,
  id,
  date,
  text,
  from: 'x',
  checkOn: date,
  ...(check ? { check, checkedOn: date } : {}),
})

describe('welcome back', () => {
  beforeEach(() => localStorage.clear())

  it('says it plainly, with no backlog and no guilt', () => {
    expect(WELCOME_BACK).toBe('Welcome back.')
    expect(WELCOME_BACK_LINE).toBe('Start with today, or pick up what you were exploring.')
    for (const line of [WELCOME_BACK, WELCOME_BACK_LINE]) {
      expect(voiceProblems(line)).toEqual([])
      expect(line).not.toMatch(/missed|behind|catch up|streak/i)
    }
  })

  it('knows the last day the person did something: an answer, a kept moment or a step they checked', () => {
    expect(lastActive(history('2026-10-10', '2026-10-12'), [sense('s', '2026-10-15', 'x')], [step('i', '2026-10-01', 'y', 'helped')])).toBe('2026-10-15')
    expect(lastActive(history(), [], [])).toBeNull()
  })

  it('shows after a break of five days or more, never to someone new or someone here yesterday', () => {
    expect(BREAK_DAYS).toBe(5)
    expect(welcomeBack(TODAY, history('2026-10-24'), [], [])).not.toBeNull()
    expect(welcomeBack(TODAY, history('2026-10-25'), [], [])).toBeNull()
    expect(welcomeBack(TODAY, history(), [], [])).toBeNull()
  })

  it('offers to pick up what they were exploring most recently, in their own words', () => {
    const w = welcomeBack(TODAY, history('2026-10-10'), [sense('s-1', '2026-10-12', 'the interview on Friday')], [step('i-1', '2026-10-14', 'Write down what I know for sure.')])
    expect(w?.pickUp).toEqual({ label: 'A step you wanted to try', text: 'Write down what I know for sure.', prompt: 'Where are you now with “Write down what I know for sure”?' })
    const only = welcomeBack(TODAY, history('2026-10-10'), [sense('s-1', '2026-10-12', 'the interview on Friday')], [])
    expect(only?.pickUp).toEqual({ label: 'I keep overthinking something.', text: 'the interview on Friday', prompt: 'Where are you now with “the interview on Friday”?' })
    expect(welcomeBack(TODAY, history('2026-10-10'), [], [])?.pickUp).toBeNull()
  })

  it('leaves out a step already checked or let go', () => {
    expect(welcomeBack(TODAY, history('2026-10-10'), [], [step('i-1', '2026-10-14', 'Done already.', 'helped')])?.pickUp).toBeNull()
  })

  it('says it once for each break', () => {
    expect(welcomeBack(TODAY, history('2026-10-10'), [], [])).not.toBeNull()
    dismissWelcomeBack(TODAY)
    expect(welcomeBack(TODAY, history('2026-10-10'), [], [])).toBeNull()
    expect(welcomeBack('2026-10-30', history('2026-10-10'), [], [])).toBeNull()
    // Back for a while, then away again: a new break, said again.
    expect(welcomeBack('2026-11-20', history('2026-10-10', '2026-11-02'), [], [])).not.toBeNull()
  })
})
