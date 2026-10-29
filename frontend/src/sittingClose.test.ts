import { beforeEach, describe, expect, it } from 'vitest'
import type { Question } from './api'
import { saveCheckIn } from './growthJourney'
import type { Move } from './moves'
import { stepToTry } from './sittingClose'

beforeEach(() => localStorage.clear())

// The close of a sitting as one reflection (Edwin's brief, 2026-10-28): after
// three questions answered one at a time, one thing worth trying, chosen
// from the person's own answers, never a list.
const q = (id: string, need: 'belonging' | 'competence' | 'calm', step: string, more: Partial<Question> = {}): Question => ({
  id,
  theme: 'friendship',
  prompt: `Prompt ${id}?`,
  options: [{ id: 'a', label: 'A', need, insight: { reveal: 'R.', step } }],
  ...more,
})
const pick = (question: Question) => ({ question, optionId: 'a' })

describe('one thing worth trying after a sitting', () => {
  it('offers the step from what ran through the sitting', () => {
    const picks = [pick(q('q1', 'competence', 'Finish one task first.')), pick(q('q2', 'belonging', 'Call a friend.')), pick(q('q3', 'belonging', 'Ask about their day.'))]
    expect(stepToTry(picks, [])).toEqual({ kind: 'offer', questionId: 'q2', optionId: 'a', step: 'Call a friend.', local: false })
  })

  it('falls back to the first answer’s step when nothing ran through it', () => {
    const picks = [pick(q('q1', 'competence', 'Finish one task first.')), pick(q('q2', 'belonging', 'Call a friend.'))]
    expect(stepToTry(picks, [])).toMatchObject({ kind: 'offer', questionId: 'q1' })
  })

  it('says which step you are already trying from this sitting, instead of offering another', () => {
    const picks = [pick(q('q1', 'competence', 'Finish one task first.')), pick(q('q2', 'belonging', 'Call a friend.'))]
    const trying: Move = { date: '2026-10-28', questionId: 'q2', optionId: 'a', step: 'Call a friend.', status: 'started' }
    expect(stepToTry(picks, [trying])).toEqual({ kind: 'trying', move: trying })
  })

  it('never offers a step you said made things harder, or one from a heavy answer', () => {
    const before: Move = { date: '2026-10-20', questionId: 'q0', optionId: 'a', step: 'Call a friend.', status: 'no_change' }
    saveCheckIn({ questionId: 'q0', date: '2026-10-21', tried: 'yes', outcome: 'harder' })
    const heavy: Question = { id: 'q3', theme: 'family', prompt: 'P?', options: [{ id: 'a', label: 'A', heavy: true, insight: { reveal: 'R.', step: 'Rest.' } }] }
    expect(stepToTry([pick(q('q2', 'belonging', 'Call a friend.')), pick(heavy)], [before])).toBeNull()
  })

  it('keeps a step from a question asked on this phone only on this phone', () => {
    expect(stepToTry([pick(q('q1', 'calm', 'Take a slow breath.', { local: true }))], [])).toMatchObject({ kind: 'offer', local: true })
  })
})
