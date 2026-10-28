import { beforeEach, describe, expect, it } from 'vitest'
import { blackOn, loadPrefs, pulseOn, regionHere } from './prefs'

beforeEach(() => localStorage.clear())

// Edwin, 2026-10-28: "everything should be on by default and turned off from
// the You page".
describe('choices are on until you switch them off in You', () => {
  it('starts with the Human Pulse, dark evenings and local questions on', () => {
    const p = loadPrefs()
    expect(pulseOn(p)).toBe(true)
    expect(blackOn(p)).toBe(true)
    expect(regionHere({ ...p, country: 'UG' })).not.toBeNull()
  })

  it('keeps each one off once you switch it off', () => {
    expect(pulseOn({ ...loadPrefs(), pulse: false })).toBe(false)
    expect(blackOn({ ...loadPrefs(), black: false })).toBe(false)
    expect(regionHere({ ...loadPrefs(), country: 'UG', regional: false })).toBeNull()
  })
})
