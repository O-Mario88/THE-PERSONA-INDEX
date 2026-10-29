// Two reading depths across the app (Edwin's brief, 2026-10-28): Essential, a
// moment of clarity and an optional small action, for busy days; or Explore
// deeper, the supporting answers, other sides and related insights, for when
// there's more time. The last choice made on any page holds everywhere.
// Before anyone chooses, it follows how much time they said they usually
// have (My Reflection Style, prefs.ts); with no answer, Insights and My
// Journey show everything (Edwin, 2026-10-28: "nothing hidden") and the
// Mirror opens on its story. Kept under the Mirror's own key, so a Mirror
// set to deep before this stays deep.

import { loadPrefs, type Prefs } from './prefs'
import { load, remove, save } from './storage'

export type DepthSurface = 'insights' | 'journey' | 'mirror'

const KEY = 'pi.mirror.depth' // 'deep' or 'essential'; absent until someone chooses

export function readsDeeper(surface: DepthSurface, p: Prefs = loadPrefs()): boolean {
  const chosen = load(KEY)
  if (chosen === 'deep') return true
  if (chosen === 'essential') return false
  if (p.time === 'deep') return true
  if (p.time === 'minute') return false
  return surface !== 'mirror'
}

export function chooseDepth(deeper: boolean): void {
  save(KEY, deeper ? 'deep' : 'essential')
}

// followTime drops the last choice made on a page, so the depth follows the
// time answer again, after someone changes it in My Reflection Style.
export function followTime(): void {
  remove(KEY)
}
