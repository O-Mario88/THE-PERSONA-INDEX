import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPulse, pulseWords, sharedMoments } from './humanPulse'
import type { NotAloneQuestion } from './insights'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

const counts: NotAloneQuestion[] = [
  { questionId: 'q1', total: 140, options: [{ optionId: 'a', count: 37 }, { optionId: 'b', count: 103 }] },
  { questionId: 'q2', total: 60, options: [{ optionId: 'a', count: 58 }, { optionId: 'b', count: 0, few: true }] },
]
const answer = (date: string, questionId: string, extra: Record<string, unknown> = {}) => ({ date, questionId, theme: 'rest', depth: 2, traits: {}, optionId: 'a', ...extra })

describe('one Human Pulse, worded the same on every page', () => {
  it('says exactly how many chose the same answer, never more than that', () => {
    expect(pulseWords({ kind: 'count', same: 37, total: 140 })).toBe('37 of 140 people chose the same answer as you.')
    expect(pulseWords({ kind: 'few' })).toBe('A few others chose this answer too.')
    expect(pulseWords({ kind: 'forming' })).toBeNull()
  })
})

describe('the moments you share with others', () => {
  it('takes your own answers that have counts, newest first', () => {
    const h = { answers: [answer('2026-10-26', 'q1'), answer('2026-10-27', 'q2', { optionId: 'b' })], skips: [] }
    expect(sharedMoments(counts, h)).toEqual([
      { questionId: 'q2', optionId: 'b', date: '2026-10-27', theme: 'rest', line: { kind: 'few' } },
      { questionId: 'q1', optionId: 'a', date: '2026-10-26', theme: 'rest', line: { kind: 'count', same: 37, total: 140 } },
    ])
  })

  it('never uses a heavy, regional or unrecorded answer, or one without counts yet', () => {
    const h = {
      answers: [answer('2026-10-27', 'q1', { heavy: true }), answer('2026-10-27', 'q2', { regional: true }), answer('2026-10-27', 'q1', { optionId: undefined }), answer('2026-10-27', 'q9')],
      skips: [],
    }
    expect(sharedMoments(counts, h)).toEqual([])
  })
})

describe('loading the counts', () => {
  it('keeps the last counts it got, and says so when it has to use them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ questions: counts }), { status: 200 })))
    expect(await loadPulse('2026-10-28')).toEqual({ questions: counts, stale: false })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await loadPulse('2026-10-28')).toEqual({ questions: counts, stale: true })
  })

  it('has nothing to show before it has ever loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await loadPulse('2026-10-28')).toBeNull()
  })
})
