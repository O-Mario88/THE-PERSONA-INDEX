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
  })

  it('keeps offering the evening three at night until midnight', () => {
    const h = heroFor({ ...base, window: 'night', morning: 'done', evening: 'started' })
    expect(h).toMatchObject({ opens: 'evening', eyebrow: 'Still open · until midnight', action: 'Carry on' })
  })

  // A calmer day (Edwin's brief, 2026-10-29: a weekly benefit, not a daily
  // obligation): once the morning three are done, nothing more is announced
  // until the evening. The midday, afternoon and night pages stay, unasked.
  it('asks nothing more after the morning until the evening three open', () => {
    for (const window of ['morning', 'midday', 'afternoon'] as const) {
      const h = heroFor({ ...base, window, morning: 'done' })
      expect(h, window).toMatchObject({ eyebrow: 'Morning done', title: 'Your three are answered', action: 'See your morning', opens: 'morning' })
      expect(h.sub, window).toContain('Your evening three open at')
      expect(`${h.title} ${h.sub}`, window).not.toMatch(/midday|pulse|check/i)
    }
  })

  it('still offers today’s friend at midday, the one thing from your circle', () => {
    expect(heroFor({ ...base, window: 'midday', morning: 'done', friend: 'Amara' })).toMatchObject({ title: 'Today’s friend is Amara', opens: 'midday' })
  })

  it('leaves three good things there at night, if you like, without asking', () => {
    const night = heroFor({ ...base, window: 'night', morning: 'done', evening: 'done' })
    expect(night).toMatchObject({ title: 'That’s today’s questions', sub: 'Nothing else is asked of you today.', action: 'Three good things, if you like', opens: 'night' })
    expect(heroFor({ ...base, window: 'evening', morning: 'done', evening: 'done' })).toMatchObject({ eyebrow: 'Evening done', sub: 'Nothing else is asked of you today.', opens: 'evening' })
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

  it('keeps Sunday quiet when the Mirror comes on another day', () => {
    const h = heroFor({ ...base, window: 'morning', morning: 'none', review: true, mirrorOn: 3 })
    expect(h).toMatchObject({ title: 'A quiet day', action: 'See your week so far', opens: 'mirror' })
    expect(h.sub).toContain('Your Wednesday Mirror comes on Wednesday.')
    expect(h.title).not.toContain('ready')
  })
})
