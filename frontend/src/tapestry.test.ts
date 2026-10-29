import { dayNeeds, season, SEASON_DAYS, weave, week } from './tapestry'

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

// Edwin, 2026-10-28: ninety days makes people give up; the close shows this
// week only, Monday to Sunday, ending at the Sunday Mirror.
describe('this week, not ninety days', () => {
  it('shows Monday to Sunday, woven where you answered, today marked, the rest still to come', () => {
    weave('2026-10-26', 'calm')
    weave('2026-10-28', 'belonging')
    const w = week('2026-10-28')
    expect(w.map((t) => t.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(w.map((t) => t.state)).toEqual(['woven', 'linen', 'woven', 'ahead', 'ahead', 'ahead', 'ahead'])
    expect(w[0].need).toBe('calm')
    expect(w[2]).toMatchObject({ need: 'belonging', today: true })
  })

  it('treats Sunday as the end of its week', () => {
    expect(week('2026-11-01')[6]).toMatchObject({ date: '2026-11-01', today: true })
  })
})
