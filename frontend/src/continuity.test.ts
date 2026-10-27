import { beforeEach, describe, expect, it } from 'vitest'
import { carryLine, ideaToTry, rememberLine, stepToFollow } from './continuity'
import type { Move } from './moves'
import { saveJSON } from './storage'

beforeEach(() => localStorage.clear())

const answer = (date: string, questionId: string, heavy = false) => ({ date, questionId, theme: 'habits', depth: 2, traits: {}, ...(heavy ? { heavy: true as const } : {}) })

describe('showing the app remembers', () => {
  it('opens a sitting with yesterday’s answer and what it noticed', () => {
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'Give a vague answer', reveal: 'You guard your privacy. More words.' })
    const h = { answers: [answer('2026-10-27', 'q1')], skips: [] }
    expect(rememberLine('2026-10-28', h)).toBe('Yesterday you chose “Give a vague answer”, and I noticed: You guard your privacy. Let\'s see what today adds.')
    expect(rememberLine('2026-10-30', h)).toMatch(/^On Tuesday you chose/)
  })

  it('stays quiet on the first day, after a heavy answer, and after a week away', () => {
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'L', reveal: 'R.' })
    expect(rememberLine('2026-10-27', { answers: [answer('2026-10-27', 'q1')], skips: [] })).toBeNull()
    expect(rememberLine('2026-10-28', { answers: [answer('2026-10-27', 'q1', true)], skips: [] })).toBeNull()
    expect(rememberLine('2026-11-10', { answers: [answer('2026-10-27', 'q1')], skips: [] })).toBeNull()
  })
})

describe('following up on a step', () => {
  const move = (date: string, status: Move['status']): Move => ({ date, questionId: `q-${date}`, optionId: 'o', step: `Step from ${date}`, status })

  it('brings back the oldest step from the past week still waiting for an answer', () => {
    const moves = [move('2026-10-26', 'started'), move('2026-10-25', 'helped'), move('2026-10-27', 'started'), move('2026-10-28', 'started')]
    expect(stepToFollow('2026-10-28', moves)?.step).toBe('Step from 2026-10-26')
    expect(stepToFollow('2026-11-10', moves)).toBeNull()
    expect(stepToFollow('2026-10-28', [move('2026-10-28', 'started')])).toBeNull()
  })
})

describe('something useful without answering', () => {
  it('offers a step from your own recent cards that you have not tried yet', () => {
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'Give a vague answer', reveal: 'R.', step: 'Share your real pay with one person.' })
    const h = { answers: [{ ...answer('2026-10-27', 'q1'), optionId: 'o1' }], skips: [] }
    expect(ideaToTry('2026-10-28', h, [])).toMatchObject({ questionId: 'q1', step: 'Share your real pay with one person.' })
    expect(ideaToTry('2026-10-28', h, [{ date: '2026-10-27', questionId: 'q1', optionId: 'o1', step: 'x', status: 'started' }])).toBeNull()
  })
})

describe('a question worth carrying', () => {
  it('picks what today’s answers reached for most, and stays quiet after a heavy one', () => {
    const h = { answers: [{ ...answer('2026-10-28', 'a'), need: 'calm' as const }, { ...answer('2026-10-28', 'b'), need: 'calm' as const }, { ...answer('2026-10-28', 'c'), need: 'respect' as const }], skips: [] }
    expect(carryLine('2026-10-28', h)).toBe('Notice one moment today when your shoulders drop.')
    expect(carryLine('2026-10-29', h)).toBeNull()
  })
})
