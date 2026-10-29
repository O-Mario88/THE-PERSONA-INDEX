import { beforeEach, describe, expect, it } from 'vitest'
import { carryLine, ideaToTry, rememberLine } from './continuity'
import { saveCheckIn } from './growthJourney'
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

describe('something useful without answering', () => {
  it('offers a step from your own recent cards that you have not tried yet', () => {
    saveJSON('pi.insight.q1', { date: '2026-10-27', questionId: 'q1', prompt: 'P', label: 'Give a vague answer', reveal: 'R.', step: 'Share your real pay with one person.' })
    const h = { answers: [{ ...answer('2026-10-27', 'q1'), optionId: 'o1' }], skips: [] }
    expect(ideaToTry('2026-10-28', h, [])).toMatchObject({ questionId: 'q1', step: 'Share your real pay with one person.' })
    expect(ideaToTry('2026-10-28', h, [{ date: '2026-10-27', questionId: 'q1', optionId: 'o1', step: 'x', status: 'started' }])).toBeNull()
  })

  it('does not suggest again a step you said made things harder, even from another card', () => {
    saveJSON('pi.insight.q2', { date: '2026-10-27', questionId: 'q2', prompt: 'P', label: 'Say yes', reveal: 'R.', step: 'Say no to one request this week.' })
    const h = { answers: [{ ...answer('2026-10-27', 'q2'), optionId: 'o2' }], skips: [] }
    const before = [{ date: '2026-10-20', questionId: 'q0', optionId: 'o0', step: 'Say no to one request this week.', status: 'no_change' as const }]
    saveCheckIn({ questionId: 'q0', date: '2026-10-22', tried: 'yes', outcome: 'harder', feeling: 'unsettled' })
    expect(ideaToTry('2026-10-28', h, before)).toBeNull()
  })
})

describe('a question worth carrying', () => {
  it('picks what today’s answers reached for most, and stays quiet after a heavy one', () => {
    const h = { answers: [{ ...answer('2026-10-28', 'a'), need: 'calm' as const }, { ...answer('2026-10-28', 'b'), need: 'calm' as const }, { ...answer('2026-10-28', 'c'), need: 'respect' as const }], skips: [] }
    expect(carryLine('2026-10-28', h)).toBe('Notice one moment today when your shoulders drop.')
    expect(carryLine('2026-10-29', h)).toBeNull()
  })
})
