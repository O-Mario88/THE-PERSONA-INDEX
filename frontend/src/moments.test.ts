import { beforeEach, describe, expect, it } from 'vitest'
import { keepMoment, momentsBetween } from './moments'
import { reflections } from './notebook'

beforeEach(() => localStorage.clear())

// Keep a moment (Edwin's brief, 2026-10-28): something worth remembering
// between the sittings, in a sentence or two, without opening the journal.
// It is kept with your other private writing, so it can come back in your
// Mirror only if you let your reflections in.
describe('keeping a moment', () => {
  it('keeps your words, trimmed, as private writing of its own kind', () => {
    keepMoment('  Today, I managed to say no without feeling guilty afterwards.  ', '2026-10-28', 1)
    const [m] = reflections()
    expect(m).toMatchObject({ source: 'moment', date: '2026-10-28', answer: 'Today, I managed to say no without feeling guilty afterwards.', free: true })
  })

  it('keeps nothing when there is nothing to keep', () => {
    keepMoment('   ', '2026-10-28', 1)
    expect(reflections()).toHaveLength(0)
  })

  it('finds the moments of a span, newest first, and nothing else you wrote', () => {
    keepMoment('A good talk with my sister.', '2026-10-26', 1)
    keepMoment('Said no kindly.', '2026-10-28', 2)
    keepMoment('Last month.', '2026-09-20', 3)
    expect(momentsBetween('2026-10-26', '2026-11-01').map((m) => m.answer)).toEqual(['Said no kindly.', 'A good talk with my sister.'])
  })
})
