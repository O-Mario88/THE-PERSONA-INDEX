import { beforeEach, describe, expect, it } from 'vitest'
import { dayWithYou, glimpseHere, inWeekOne, lastLeaning, markStarted, needsAccount } from './firstWeek'
import type { History } from './profile'

const a = (date: string, more: object = {}) => ({ date, questionId: `${date}-q`, theme: 'habits', depth: 2, traits: { conscientiousness: 1 }, ...more })

beforeEach(() => localStorage.clear())

describe('the first week', () => {
  it('belongs only to someone who began with it, and lasts seven days', () => {
    expect(inWeekOne('2026-10-12')).toBe(false)
    markStarted('2026-10-12')
    expect(inWeekOne('2026-10-12')).toBe(true)
    expect(dayWithYou('2026-10-18')).toBe(7)
    expect(inWeekOne('2026-10-18')).toBe(true)
    expect(inWeekOne('2026-10-19')).toBe(false)
    localStorage.setItem('pi.showall', '1')
    expect(inWeekOne('2026-10-13')).toBe(false)
  })

  it('shows the first glimpse on the first sitting only, and keeps it there', () => {
    markStarted('2026-10-12')
    const first: History = { answers: [a('2026-10-12')], skips: [] }
    expect(glimpseHere('2026-10-12', 'morning', first)).toBe(true)
    expect(glimpseHere('2026-10-12', 'morning', first)).toBe(true)
    const later: History = { answers: [a('2026-10-12'), a('2026-10-12', { evening: true })], skips: [] }
    expect(glimpseHere('2026-10-12', 'evening', later)).toBe(false)
  })

  it('shows the first glimpse when the first sitting is the evening', () => {
    markStarted('2026-10-12')
    localStorage.setItem('pi.pick.2026-10-12.pm', JSON.stringify(['pm-1', 'pm-2']))
    const evening: History = { answers: [a('2026-10-12', { questionId: 'pm-1' }), a('2026-10-12', { questionId: 'pm-2' })], skips: [] }
    expect(glimpseHere('2026-10-12', 'morning', evening)).toBe(false)
    expect(glimpseHere('2026-10-12', 'evening', evening)).toBe(true)
  })

  it('never shows a glimpse to someone with earlier answers', () => {
    markStarted('2026-10-12')
    expect(glimpseHere('2026-10-12', 'morning', { answers: [a('2026-10-10'), a('2026-10-12')], skips: [] })).toBe(false)
  })

  it('asks for an account from the day after the glimpse, never of someone signed in or here before', () => {
    expect(needsAccount(false, '2026-10-13')).toBe(false)
    markStarted('2026-10-12')
    localStorage.setItem('pi.glimpse', '2026-10-12|morning')
    expect(needsAccount(false, '2026-10-12')).toBe(false)
    expect(needsAccount(false, '2026-10-13')).toBe(true)
    expect(needsAccount(true, '2026-10-13')).toBe(false)
  })

  it('says what the last answers leaned towards, but not after a heavy answer', () => {
    expect(lastLeaning('2026-10-13', { answers: [a('2026-10-12')], skips: [] })).toBe('getting things done')
    expect(lastLeaning('2026-10-13', { answers: [a('2026-10-12'), a('2026-10-13', { heavy: true })], skips: [] })).toBeNull()
    expect(lastLeaning('2026-10-13', { answers: [], skips: [] })).toBeNull()
  })
})
