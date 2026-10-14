// Content preferences, kept on the phone. adult is null until the one-tap
// 18+ question is answered; intimacy questions need adult === true and mild off.
export type Prefs = { adult: boolean | null; mild: boolean }

const key = 'pi.prefs.v1'

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (p && typeof p === 'object') return { adult: typeof p.adult === 'boolean' ? p.adult : null, mild: !!p.mild }
  } catch {
    // fall through
  }
  return { adult: null, mild: false }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(key, JSON.stringify(p))
  } catch {
    // this visit only
  }
}

export const intimacyOn = (p: Prefs) => p.adult === true && !p.mild
