import { helplineFor, isCountry } from './country'
import { regionOf, type Region } from './regions'
import { loadJSON, saveJSON } from './storage'

// Settings, kept on the phone. adult is null until the one-tap 18+ question
// is answered; intimacy questions need adult === true and mild off.
// wordsDays is how long words typed in one's own words are kept here.
// country is where the person said they live (country.ts), or 'none' for
// "Prefer not to say"; absent until asked. It never leaves the phone except
// sealed in the backup.
// regional: false turns off the questions about everyday life where the
// person lives (regional.ts); they are on whenever a country is given.
export type Prefs = { adult: boolean | null; mild: boolean; wordsDays: WordsDays; country?: string; regional?: false }
export const NO_COUNTRY = 'none'

export const WORDS_DAYS = [7, 35, 90] as const
export type WordsDays = (typeof WORDS_DAYS)[number]
// Five weeks by default, like answers on the server, so the words last for
// the weekly mirror and no longer.
export const DEFAULT_WORDS_DAYS: WordsDays = 35

const key = 'pi.prefs.v1'

export function loadPrefs(): Prefs {
  const p = loadJSON(key) as Partial<Prefs> | null
  const wordsDays = WORDS_DAYS.find((d) => d === p?.wordsDays) ?? DEFAULT_WORDS_DAYS
  if (p && typeof p === 'object') {
    const country = p.country === NO_COUNTRY || isCountry(p.country) ? { country: p.country } : {}
    const regional = p.regional === false ? { regional: false as const } : {}
    return { adult: typeof p.adult === 'boolean' ? p.adult : null, mild: !!p.mild, wordsDays, ...country, ...regional }
  }
  return { adult: null, mild: false, wordsDays }
}

export function savePrefs(p: Prefs) {
  saveJSON(key, p)
}

export const intimacyOn = (p: Prefs) => p.adult === true && !p.mild

// The country to tailor to, or null when none was given.
export const countryOf = (p: Prefs): string | null => (p.country && p.country !== NO_COUNTRY ? p.country : null)

// The region whose everyday questions this phone offers (regional.ts), or
// null: no country given, a country no region covers, or switched off.
export const regionHere = (p: Prefs): Region | null => (p.regional === false ? null : regionOf(countryOf(p)))

// The helpline for where the person said they live (country.ts), read on the
// phone; the directory's front page when they gave none. Public pages, which
// know nothing about the reader, use HELPLINE_URL (Helpline.tsx).
export const helplineHere = () => helplineFor(countryOf(loadPrefs()))
