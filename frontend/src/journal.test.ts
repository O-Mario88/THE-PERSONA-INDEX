import { beforeEach, describe, expect, it } from 'vitest'
import { dismissMemory, draftOf, journeyFor, memoryFor, reflectSettings, saveDraft, setReflectSettings, threadOf, threadsOf } from './journal'
import { keepReflection, type Reflection } from './notebook'

// The quiet machinery of Reflect, all on this phone.

beforeEach(() => localStorage.clear())

const r = (id: string, date: string, answer: string, extra: Partial<Reflection> = {}) =>
  keepReflection({ id, date, period: 'day', area: 'family', group: 'learnt', source: 'answers', about: '', question: 'Where did you feel most like yourself today?', answer, ...extra })

describe('Reflect’s quiet machinery', () => {
  it('keeps a half-written reflection per space, until it is cleared', () => {
    saveDraft('day', 'Half a thought')
    expect(draftOf('day')).toBe('Half a thought')
    expect(draftOf('week')).toBe('')
    saveDraft('day', '')
    expect(draftOf('day')).toBe('')
  })

  it('brings back last week’s words, once, and not after they are put away', () => {
    r('old', '2026-10-17', 'I want to listen more carefully when family members speak.')
    r('today', '2026-10-25', 'Today was fine.')
    const m = memoryFor('2026-10-25')!
    expect(m.reflection.id).toBe('old')
    expect(m.when).toBe('Last week')
    dismissMemory('old')
    expect(memoryFor('2026-10-25')).toBeNull()
  })

  it('does not bring back words already followed up', () => {
    r('old', '2026-10-17', 'I want to listen more.')
    r('follow', '2026-10-20', 'I tried it.', { followsUp: 'old' })
    expect(memoryFor('2026-10-25')?.reflection.id).not.toBe('old')
  })

  it('puts reflections in threads, in order, oldest first', () => {
    r('a', '2026-09-01', 'I want to be more present with my family.')
    r('b', '2026-09-20', 'Phones away at dinner helped.', { thread: 'a' })
    r('c', '2026-10-10', 'Still working on it.', { thread: 'a' })
    expect(threadOf('a').map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(threadsOf().map((t) => t.root.id)).toEqual(['a'])
  })

  it('finds words from a while ago for From your journey, preferring a thread', () => {
    r('a', '2026-07-20', 'I want to be more present with my family.')
    r('b', '2026-09-20', 'Phones away at dinner helped.', { thread: 'a' })
    const j = journeyFor('2026-10-25')!
    expect(j.reflection.id).toBe('a')
    expect(j.when).toBe('Three months ago')
    expect(j.since).toBe(1)
  })

  it('keeps the Reflect choices off by default', () => {
    expect(reflectSettings()).toEqual({ threadsInMirror: false, reflectionsInNoticed: false, reflectionsInGrowth: false })
    setReflectSettings({ threadsInMirror: true })
    expect(reflectSettings().threadsInMirror).toBe(true)
  })
})
