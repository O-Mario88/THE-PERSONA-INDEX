import { describe, expect, it } from 'vitest'
import { FIRST_RELEASE, plansOffered, shows } from './release'

// Edwin, 2026-10-29: the first release puts six things first and defers
// social feeds, elaborate Circle features and extra plans (docs/first-release.md).
describe('the first release', () => {
  it('holds back walking alongside and the fuller circle, without deleting them', () => {
    expect(FIRST_RELEASE).toBe(true)
    expect(shows('walkAlongside')).toBe(false)
    expect(shows('circleExtras')).toBe(false)
  })

  it('offers one paid tier, and prepaid passes only on the website', () => {
    expect(plansOffered(false)).toEqual(['monthly', 'yearly'])
    expect(plansOffered(true)).toEqual(['monthly', 'yearly', 'pass_90', 'pass_365'])
  })
})
