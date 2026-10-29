import { beforeEach, describe, expect, it } from 'vitest'
import { dayWithYou, glimpseHere, inWeekOne, markStarted, needsAccount } from './firstWeek'
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
})

describe('what brings someone back in their first week', () => {
  const ans = (date: string, traits: Record<string, number>) => ({ date, questionId: `q-${date}-${Object.keys(traits)[0]}`, theme: 'habits', depth: 2, traits })

  it('finds what keeps coming up only once there are two days of answers', async () => {
    const { acrossDays } = await import('./firstWeek')
    const one = { answers: [ans('2026-10-27', { extraversion: 1 })], skips: [] }
    expect(acrossDays('2026-10-27', one)).toEqual({ days: 1, lean: null })
    const two = { answers: [ans('2026-10-27', { extraversion: 1 }), ans('2026-10-28', { extraversion: 1 }), ans('2026-10-28', { conscientiousness: 1 })], skips: [] }
    expect(acrossDays('2026-10-28', two).days).toBe(2)
  })

  it('shows the answers behind what keeps coming up, newest first, only the ones that leaned that way', async () => {
    const { acrossDaysWhy } = await import('./firstWeek')
    const h = {
      answers: [ans('2026-10-26', { extraversion: 1 }), ans('2026-10-27', { extraversion: 1 }), ans('2026-10-28', { extraversion: -1 }), ans('2026-10-28', { neuroticism: 1 })],
      skips: [],
    }
    const text = (id: string) => ({ date: '2026-10-28', questionId: id, prompt: `Asked ${id}?`, label: `Chose ${id}` })
    const why = acrossDaysWhy('2026-10-28', h, text)
    expect(why.every((w) => !w.asked.includes('2026-10-28-extraversion'))).toBe(true)
    expect(why.map((w) => w.date)).toEqual([...why.map((w) => w.date)].sort().reverse())
    expect(why.find((w) => w.asked === 'Asked q-2026-10-27-extraversion?')).toEqual({ date: '2026-10-27', asked: 'Asked q-2026-10-27-extraversion?', said: 'Chose q-2026-10-27-extraversion' })
  })
})
