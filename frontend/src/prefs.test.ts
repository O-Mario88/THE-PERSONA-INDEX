import { beforeEach, describe, expect, it } from 'vitest'
import { appearanceOf, darkNow, loadPrefs, pulseOn, regionHere, savePrefs, withAppearance } from './prefs'

beforeEach(() => localStorage.clear())

// Edwin, 2026-10-28: "everything should be on by default and turned off from
// the You page".
describe('choices are on until you switch them off in You', () => {
  it('starts with the Human Pulse and local questions on', () => {
    const p = loadPrefs()
    expect(pulseOn(p)).toBe(true)
    expect(regionHere({ ...p, country: 'UG' })).not.toBeNull()
  })

  it('keeps each one off once you switch it off', () => {
    expect(pulseOn({ ...loadPrefs(), pulse: false })).toBe(false)
    expect(regionHere({ ...loadPrefs(), country: 'UG', regional: false })).toBeNull()
  })
})

// Edwin, 2026-10-28: dark mode only reached Today; one choice in Settings now
// sets light or dark for every page.
describe('light or dark, chosen once in Settings for every page', () => {
  it('is automatic until chosen: dark in the evening and at night, or when the phone is dark', () => {
    const p = loadPrefs()
    expect(appearanceOf(p)).toBe('auto')
    expect(darkNow(p, false, false)).toBe(false)
    expect(darkNow(p, true, false)).toBe(true)
    expect(darkNow(p, false, true)).toBe(true)
  })

  it('stays light or dark everywhere once chosen, whatever the hour or the phone says', () => {
    expect(darkNow(withAppearance(loadPrefs(), 'light'), true, true)).toBe(false)
    expect(darkNow(withAppearance(loadPrefs(), 'dark'), false, false)).toBe(true)
  })

  it('keeps an earlier "dark mode off" as light, and going back to automatic clears it', () => {
    const old = { ...loadPrefs(), black: false as const }
    expect(appearanceOf(old)).toBe('light')
    const auto = withAppearance(old, 'auto')
    expect(appearanceOf(auto)).toBe('auto')
    expect('black' in auto).toBe(false)
  })

  it('remembers the choice', () => {
    savePrefs(withAppearance(loadPrefs(), 'dark'))
    expect(appearanceOf(loadPrefs())).toBe('dark')
  })
})
