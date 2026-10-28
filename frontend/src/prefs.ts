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
// The choices, all in one place on the You page and all on by default
// (Edwin, 2026-10-28: "everything should be on by default and turned off from
// the You page"): pulse: false hides every Human Pulse number; black: false keeps the evening and night windows off
// pure black; still: true shows cards at once instead of unfolding them;
// connect: false turns quiet nods and Answer Together off both ways.
export type Prefs = {
  adult: boolean | null
  mild: boolean
  wordsDays: WordsDays
  country?: string
  regional?: false
  pulse?: boolean
  black?: false
  still?: true
  connect?: false
  lang?: 'en' | 'es' | 'pt' | 'fr' // the app's language; absent follows the phone (i18n/index.ts)
}
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
    const pulse = typeof p.pulse === 'boolean' ? { pulse: p.pulse } : {}
    const black = p.black === false ? { black: false as const } : {}
    const still = p.still === true ? { still: true as const } : {}
    const connect = p.connect === false ? { connect: false as const } : {}
    const lang = p.lang === 'en' || p.lang === 'es' || p.lang === 'pt' || p.lang === 'fr' ? { lang: p.lang } : {}
    return {
      adult: typeof p.adult === 'boolean' ? p.adult : null,
      mild: !!p.mild,
      wordsDays,
      ...country,
      ...regional,
      ...pulse,
      ...black,
      ...still,
      ...connect,
      ...lang,
    }
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

// A crisis line someone in that country already knows, to call or text in one
// tap: 988 in the US and Canada, Samaritans in the UK and Ireland. Elsewhere
// the helpline directory above is the way.
const CRISIS_NUMBERS: Record<string, { label: string; tel: string; sms?: string }> = {
  US: { label: 'Call or text 988', tel: '988', sms: '988' },
  CA: { label: 'Call or text 988', tel: '988', sms: '988' },
  GB: { label: 'Call Samaritans, 116 123', tel: '116123' },
  IE: { label: 'Call Samaritans, 116 123', tel: '116123' },
}
export const crisisNumber = (country: string | null) => (country ? (CRISIS_NUMBERS[country] ?? null) : null)
export const crisisHere = () => crisisNumber(countryOf(loadPrefs()))

// The Human Pulse shows unless switched off in You.
export const pulseOn = (p: Prefs) => p.pulse !== false
// Evening and night on pure black, unless switched off.
export const blackOn = (p: Prefs) => p.black !== false
// Cards unfold in three beats unless the person or the phone asks for less motion.
export const stillOn = (p: Prefs) =>
  p.still === true || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
// Quiet nods and Answer Together, on unless switched off.
export const connectOn = (p: Prefs) => p.connect !== false
