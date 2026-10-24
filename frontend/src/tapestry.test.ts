import { dayNeeds, season, SEASON_DAYS, weave } from './tapestry'

beforeEach(() => localStorage.clear())

describe('the season tapestry', () => {
  it('starts a ninety-day season on the first day anything was answered', () => {
    const s = season('2026-10-12')
    expect(s.day).toBe(1)
    expect(s.tiles).toHaveLength(SEASON_DAYS)
    expect(s.tiles[0]).toMatchObject({ date: '2026-10-12', state: 'linen', today: true })
    expect(s.tiles[1].state).toBe('ahead')
  })

  it('weaves a tile tinted by what the day reached for most, and leaves a missed day linen', () => {
    weave('2026-10-12', 'belonging')
    weave('2026-10-12', 'calm')
    weave('2026-10-12', 'belonging')
    weave('2026-10-14', 'competence')
    weave('2026-10-15') // an answer with no need still weaves a tile
    const s = season('2026-10-15')
    expect(s.day).toBe(4)
    expect(s.woven).toBe(3)
    expect(s.tiles.slice(0, 5).map((t) => [t.state, t.need])).toEqual([
      ['woven', 'belonging'],
      ['linen', undefined],
      ['woven', 'competence'],
      ['woven', undefined],
      ['ahead', undefined],
    ])
    expect(dayNeeds('2026-10-12')).toEqual(['belonging', 'calm'])
  })

  it('begins a new season after ninety days and lets the old one go', () => {
    weave('2026-10-12', 'calm')
    weave('2027-01-10', 'respect') // day 91
    const s = season('2027-01-10')
    expect(s.start).toBe('2027-01-10')
    expect(s.day).toBe(1)
    expect(s.tiles[0]).toMatchObject({ state: 'woven', need: 'respect' })
    expect(JSON.parse(localStorage.getItem('pi.tapestry.v1')!).days).not.toHaveProperty('2026-10-12')
  })
})
