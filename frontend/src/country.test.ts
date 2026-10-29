import { beforeEach, describe, expect, it } from 'vitest'
import { COUNTRY_CODES, countriesByName, countryName, guessCountry, helplineFor, isCountry } from './country'
import { countryOf, helplineHere, loadPrefs, savePrefs } from './prefs'
import { saveJSON } from './storage'

beforeEach(() => localStorage.clear())

describe('where someone lives', () => {
  it("guesses from the phone's own time zone, old names included", () => {
    expect(guessCountry('Africa/Lagos')).toBe('NG')
    expect(guessCountry('Africa/Nairobi')).toBe('KE')
    expect(guessCountry('Asia/Kolkata')).toBe('IN')
    expect(guessCountry('Asia/Calcutta')).toBe('IN')
    expect(guessCountry('America/Lima')).toBe('PE')
    expect(guessCountry('Europe/London')).toBe('GB')
    expect(guessCountry('UTC')).toBeNull()
    expect(guessCountry('Nowhere/Special')).toBeNull()
  })

  it('names countries where Intl.DisplayNames is missing, as on the phone app', () => {
    const real = Intl.DisplayNames
    // @ts-expect-error Hermes has no DisplayNames
    delete Intl.DisplayNames
    try {
      expect(countryName('UG')).toBe('Uganda')
    } finally {
      Object.defineProperty(Intl, 'DisplayNames', { value: real, configurable: true, writable: true })
    }
  })

  it('lists every country with a time zone, by its everyday name', () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(240)
    expect(countryName('KE')).toBe('Kenya')
    const names = countriesByName().map((c) => c.name)
    expect(names).toContain('Ghana')
    expect([...names].sort((a, b) => a.localeCompare(b, 'en-GB'))).toEqual(names)
    expect(isCountry('ZZ')).toBe(false)
    expect(COUNTRY_CODES.every((c) => countryName(c) !== c)).toBe(true)
  })

  it("points help to the person's own country, or to the directory's front page", () => {
    expect(helplineFor('KE')).toBe('https://findahelpline.com/countries/ke')
    expect(helplineFor(null)).toBe('https://findahelpline.com')
    expect(helplineFor('ZZ')).toBe('https://findahelpline.com')
  })

  it('is kept in the settings on this phone, "Prefer not to say" included', () => {
    expect(loadPrefs().country).toBeUndefined()
    savePrefs({ ...loadPrefs(), country: 'GH' })
    expect(countryOf(loadPrefs())).toBe('GH')
    expect(helplineHere()).toBe('https://findahelpline.com/countries/gh')
    savePrefs({ ...loadPrefs(), country: 'none' })
    expect(loadPrefs().country).toBe('none')
    expect(countryOf(loadPrefs())).toBeNull()
    expect(helplineHere()).toBe('https://findahelpline.com')
    saveJSON('pi.prefs.v1', { adult: null, mild: false, wordsDays: 35, country: 'Narnia' })
    expect(loadPrefs().country).toBeUndefined()
  })

  // Found in the 2026-10-29 audit as a US user: before the country question,
  // a heavy moment sent people to the directory's front page, one more step
  // from someone to talk to. The phone's time zone already names the country.
  it('before the country is asked, points help to the country the phone’s time zone names, unless they said Prefer not to say', () => {
    expect(helplineHere('America/New_York')).toBe('https://findahelpline.com/countries/us')
    expect(helplineHere('UTC')).toBe('https://findahelpline.com')
    savePrefs({ ...loadPrefs(), country: 'none' })
    expect(helplineHere('America/New_York')).toBe('https://findahelpline.com')
    savePrefs({ ...loadPrefs(), country: 'KE' })
    expect(helplineHere('America/New_York')).toBe('https://findahelpline.com/countries/ke')
  })
})
