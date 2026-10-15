import { adviceFor, TRAIT_ADVICE } from './advice'
import { awardEdition, awardInsight, awardStep, levelFor, loadGame } from './game'
import { TRAIT_WORDS } from './profile'

describe('advice', () => {
  it('speaks to the two clearest leanings of the day', () => {
    const a = adviceFor([
      { traits: { conscientiousness: 1, rumination: 2 } },
      { traits: { conscientiousness: 1 } },
      { traits: { openness: -1 } },
    ])
    expect(a.points.map((p) => p.trait)).toEqual(['conscientiousness', 'rumination'])
    expect(a.points[0].grow).toBe(TRAIT_ADVICE.conscientiousness.higher.grow)
    expect(a.headline).toContain('getting things done and replaying')
    expect(a.headline).toContain('a hint, not a verdict')
  })

  it('uses the lower side when the weights point down', () => {
    expect(adviceFor([{ traits: { extraversion: -2 } }]).points[0].strength).toBe(TRAIT_ADVICE.extraversion.lower.strength)
  })

  it('says the day was balanced rather than inventing a pattern', () => {
    const a = adviceFor([{ traits: { openness: 1 } }, { traits: { openness: -1 } }, {}])
    expect(a.points).toEqual([])
    expect(a.headline).toContain('balanced')
  })

  it('has advice for every trait the app reads', () => {
    for (const t of Object.keys(TRAIT_WORDS)) {
      expect(TRAIT_ADVICE[t], t).toBeDefined()
    }
  })
})

describe('points and levels', () => {
  beforeEach(() => localStorage.clear())

  it('counts each insight, edition and move once', () => {
    expect(awardInsight('q1', 'money')).toBe(10)
    expect(awardInsight('q1', 'money')).toBe(0)
    expect(awardEdition('2026-10-12')).toBe(20)
    expect(awardEdition('2026-10-12')).toBe(0)
    expect(awardStep('q1')).toBe(5)
    expect(awardStep('q1')).toBe(0)
    expect(loadGame()).toMatchObject({ points: 35, insights: 1, themes: ['money'], editions: ['2026-10-12'] })
  })

  it('climbs levels by insights collected', () => {
    expect(levelFor(0)).toMatchObject({ name: 'Curious', toNext: 9 })
    expect(levelFor(9).name).toBe('Explorer')
    expect(levelFor(20).progress).toBeCloseTo(11 / 21)
    expect(levelFor(1000)).toMatchObject({ name: 'Luminary', next: undefined, progress: 1 })
  })
})
