import { adviceFor, TRAIT_ADVICE } from './advice'
import { TRAITS } from './mirrorText'
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
    // The honest part: what the leaning can cost, said kindly.
    expect(a.points[0].honest).toBe(TRAITS.conscientiousness.high.cost)
    expect(a.points[1].honest).toBe(TRAITS.rumination.high.cost)
    expect(a.headline).toContain('getting things done and replaying')
    expect(a.headline).toContain('a hint, not a verdict')
  })

  it('uses the lower side when the weights point down', () => {
    const [p] = adviceFor([{ traits: { extraversion: -2 } }]).points
    expect(p.strength).toBe(TRAIT_ADVICE.extraversion.lower.strength)
    expect(p.honest).toBe(TRAITS.extraversion.low.cost)
  })

  it('says the day was balanced rather than inventing a pattern', () => {
    const a = adviceFor([{ traits: { openness: 1 } }, { traits: { openness: -1 } }, {}])
    expect(a.points).toEqual([])
    expect(a.headline).toContain('balanced')
  })

  it('has advice, and an honest part, for every trait the app reads', () => {
    for (const t of Object.keys(TRAIT_WORDS)) {
      expect(TRAIT_ADVICE[t], t).toBeDefined()
      expect(TRAITS[t], t).toBeDefined()
    }
  })
})
