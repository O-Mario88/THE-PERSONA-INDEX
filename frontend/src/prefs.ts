import { loadJSON, saveJSON } from './storage'

// Settings, kept on the phone. adult is null until the one-tap 18+ question
// is answered; intimacy questions need adult === true and mild off.
// wordsDays is how long words typed in one's own words are kept here.
export type Prefs = { adult: boolean | null; mild: boolean; wordsDays: WordsDays }

export const WORDS_DAYS = [7, 35, 90] as const
export type WordsDays = (typeof WORDS_DAYS)[number]
// Five weeks by default, like answers on the server, so the words last for
// the weekly mirror and no longer.
export const DEFAULT_WORDS_DAYS: WordsDays = 35

const key = 'pi.prefs.v1'

export function loadPrefs(): Prefs {
  const p = loadJSON(key) as Partial<Prefs> | null
  const wordsDays = WORDS_DAYS.find((d) => d === p?.wordsDays) ?? DEFAULT_WORDS_DAYS
  if (p && typeof p === 'object') return { adult: typeof p.adult === 'boolean' ? p.adult : null, mild: !!p.mild, wordsDays }
  return { adult: null, mild: false, wordsDays }
}

export function savePrefs(p: Prefs) {
  saveJSON(key, p)
}

export const intimacyOn = (p: Prefs) => p.adult === true && !p.mild
