import { beforeEach, describe, expect, it } from 'vitest'
import {
  appearanceOf,
  countAnswersOn,
  countUseOn,
  darkNow,
  loadPrefs,
  pulseOn,
  regionHere,
  savePrefs,
  sharingAsked,
  TEXT_SIZES,
  textScaleOf,
  textSizeOf,
  whatHelpedOn,
  withAppearance,
  withTextSize,
  withSharing,
} from './prefs'

beforeEach(() => localStorage.clear())

// Edwin, 2026-10-28: "everything should be on by default and turned off from
// the You page".
describe('choices are on until you switch them off in You', () => {
  it('starts with the Human Pulse and local questions on', () => {
    const p = loadPrefs()
    expect(pulseOn(p)).toBe(true)
    expect(regionHere({ ...p, country: 'UG' })).not.toBeNull()
  })

  it('remembers the language you choose, German, Russian, Japanese and Korean included, and nothing unknown', () => {
    for (const lang of ['es', 'pt', 'fr', 'de', 'ru', 'ja', 'ko'] as const) {
      savePrefs({ ...loadPrefs(), lang })
      expect(loadPrefs().lang).toBe(lang)
    }
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ lang: 'xx' }))
    expect(loadPrefs().lang).toBeUndefined()
  })

  // Edwin, 2026-10-29: private reflection is ready at once; adding to shared
  // totals is a clear choice, asked once, and nothing is added until then.
  it('adds nothing to any shared total until the person chooses, then remembers each choice', () => {
    const p = loadPrefs()
    expect([countAnswersOn(p), whatHelpedOn(p), countUseOn(p), sharingAsked(p)]).toEqual([false, false, false, false])
    savePrefs(withSharing(loadPrefs(), { answers: true, helped: false, use: true }))
    const q = loadPrefs()
    expect([countAnswersOn(q), whatHelpedOn(q), countUseOn(q), sharingAsked(q)]).toEqual([true, false, true, true])
  })

  it('reads an older phone that never chose as not yet asked, even where What helped used to start on', () => {
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ mild: false }))
    expect(sharingAsked(loadPrefs())).toBe(false)
    expect(whatHelpedOn(loadPrefs())).toBe(false)
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ whatHelped: 'yes', countAnswers: 1 }))
    expect([whatHelpedOn(loadPrefs()), countAnswersOn(loadPrefs())]).toEqual([false, false])
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

// Edwin, 2026-10-29: "can you add the function to adjust the font size from
// the settings". One choice scales every word in the app, on top of the
// phone's own text size.
describe('text size, chosen once in Settings for the whole app', () => {
  it('is standard until chosen', () => {
    expect(textSizeOf(loadPrefs())).toBe('standard')
    expect(textScaleOf(loadPrefs())).toBe(1)
  })

  it('grows step by step from smaller to largest', () => {
    const scales = TEXT_SIZES.map((s) => textScaleOf(withTextSize(loadPrefs(), s)))
    expect(scales).toEqual([...scales].sort((a, b) => a - b))
    expect(new Set(scales).size).toBe(TEXT_SIZES.length)
    expect(textScaleOf(withTextSize(loadPrefs(), 'smaller'))).toBeLessThan(1)
    expect(textScaleOf(withTextSize(loadPrefs(), 'largest'))).toBeGreaterThan(1.2)
  })

  it('remembers the choice, forgets anything unknown, and going back to standard clears it', () => {
    savePrefs(withTextSize(loadPrefs(), 'larger'))
    expect(textSizeOf(loadPrefs())).toBe('larger')
    expect('textSize' in withTextSize(loadPrefs(), 'standard')).toBe(false)
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ textSize: 'huge' }))
    expect(textSizeOf(loadPrefs())).toBe('standard')
  })
})
