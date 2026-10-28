import { beforeEach, describe, expect, it } from 'vitest'
import { heroFor } from './homeHero'

beforeEach(() => localStorage.clear())

const base = { date: '2026-10-28', review: false, pulse: true, evening: 'none' as const }

describe('the main card on Today', () => {
  it('opens the morning three with a clear button', () => {
    const h = heroFor({ ...base, window: 'morning', morning: 'none' })
    expect(h).toMatchObject({ opens: 'morning', title: 'Your morning three are ready', action: 'Begin today’s questions' })
    expect(h.eyebrow).toMatch(/^Today’s questions · closes /)
  })

  it('says carry on once you have started', () => {
    expect(heroFor({ ...base, window: 'morning', morning: 'started' })).toMatchObject({ title: 'Your morning three are waiting', action: 'Carry on' })
  })

  it('keeps offering the morning three through the afternoon while they are open', () => {
    const h = heroFor({ ...base, window: 'midday', morning: 'none' })
    expect(h.opens).toBe('morning')
    expect(h.eyebrow).toMatch(/^Still open · until /)
    expect(heroFor({ ...base, window: 'afternoon', morning: 'done' }).opens).toBe('afternoon')
  })

  it('keeps offering the evening three at night until midnight', () => {
    const h = heroFor({ ...base, window: 'night', morning: 'done', evening: 'started' })
    expect(h).toMatchObject({ opens: 'evening', eyebrow: 'Still open · until midnight', action: 'Carry on' })
    expect(heroFor({ ...base, window: 'night', morning: 'done', evening: 'done' }).opens).toBe('night')
  })

  it('previews the first question waiting, as today’s reflection', () => {
    const h = heroFor({ ...base, window: 'morning', morning: 'none', preview: 'What makes it difficult to put your own needs first?' })
    expect(h).toMatchObject({ title: 'What makes it difficult to put your own needs first?', sub: 'Three thoughtful questions. A few minutes, just for you.', action: 'Begin today’s questions' })
    expect(h.eyebrow).toMatch(/^Today’s reflection · closes /)
    expect(heroFor({ ...base, window: 'morning', morning: 'started', preview: 'Next one?' })).toMatchObject({ title: 'Next one?', action: 'Carry on' })
  })

  it('opens the Mirror on Sunday', () => {
    expect(heroFor({ ...base, window: 'morning', morning: 'none', review: true }).opens).toBe('mirror')
  })
})
