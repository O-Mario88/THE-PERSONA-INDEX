// The Season Tapestry (Stage 5 proposal, 2026-10-24): ninety days, one tile
// a day. A day with answers weaves a tile tinted by the need its answers
// reached for most (needs.ts). A missed day stays linen: nothing resets,
// nothing is counted against anyone, and there is no streak.
//
// It lives on this phone only. Each day keeps how many answers reached for
// each need, never the answers; days before the current season go.

import { isNeed, NEEDS, type Need } from './needs'
import { addDays, daysBetween, loadJSON, saveJSON } from './storage'

export const SEASON_DAYS = 90
const key = 'pi.tapestry.v1'

// "sat": answered, with no need tagged (an own-words answer, an older card).
type DayCounts = Partial<Record<Need | 'sat', number>>
type Stored = { start: string; days: Record<string, DayCounts> }

function load(): Stored | null {
  const v = loadJSON(key) as Stored | null
  return v && typeof v.start === 'string' && v.days && typeof v.days === 'object' ? v : null
}

// seasonStart is the first day of the season that holds today: seasons run
// ninety days at a time from the first day this phone answered anything.
function seasonStart(first: string, today: string): string {
  const n = Math.max(0, daysBetween(first, today))
  return addDays(first, n - (n % SEASON_DAYS))
}

// weave adds one answer to its day's tile.
export function weave(date: string, need?: string) {
  const s = load() ?? { start: date, days: {} }
  const start = seasonStart(s.start, date)
  // Days before this season are let go.
  for (const d of Object.keys(s.days)) if (d < start) delete s.days[d]
  const k: Need | 'sat' = isNeed(need) ? need : 'sat'
  const day = (s.days[date] ??= {})
  day[k] = (day[k] ?? 0) + 1
  saveJSON(key, { start: s.start, days: s.days })
}

export type Tile = { date: string; state: 'woven' | 'linen' | 'ahead'; need?: Need; today: boolean }
export type Season = { day: number; start: string; tiles: Tile[]; woven: number }

// topNeed is the need a day reached for most; ties go to the first in
// NEEDS, so a day always shows the same colour.
function topNeed(c: DayCounts): Need | undefined {
  let best: Need | undefined
  for (const n of NEEDS) if ((c[n] ?? 0) > 0 && (!best || (c[n] ?? 0) > (c[best] ?? 0))) best = n
  return best
}

// season is the tapestry as of today: day N of 90, and a tile for each day.
export function season(today: string): Season {
  const s = load()
  const start = s ? seasonStart(s.start, today) : today
  const day = daysBetween(start, today) + 1
  const tiles: Tile[] = []
  let woven = 0
  for (let i = 0; i < SEASON_DAYS; i++) {
    const date = addDays(start, i)
    const c = s?.days[date]
    if (date > today) tiles.push({ date, state: 'ahead', today: false })
    else if (c && Object.values(c).some((n) => (n ?? 0) > 0)) {
      woven++
      const need = topNeed(c)
      tiles.push({ date, state: 'woven', ...(need ? { need } : {}), today: date === today })
    } else tiles.push({ date, state: 'linen', today: date === today })
  }
  return { day, start, tiles, woven }
}

// week is this week's seven tiles, Monday to Sunday (Edwin, 2026-10-28: a
// ninety-day grid makes people give up; a week ends at the Sunday Mirror).
export function week(today: string): Tile[] {
  const s = load()
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday is 0
  const monday = addDays(today, -weekday)
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const c = s?.days[date]
    if (date > today) return { date, state: 'ahead' as const, today: false }
    if (c && Object.values(c).some((n) => (n ?? 0) > 0)) {
      const need = topNeed(c)
      return { date, state: 'woven' as const, ...(need ? { need } : {}), today: date === today }
    }
    return { date, state: 'linen' as const, today: date === today }
  })
}

// dayNeeds is what one day's answers reached for, most first: the morning
// close says what today's tiles were woven from.
export function dayNeeds(date: string): Need[] {
  const c = load()?.days[date] ?? {}
  return NEEDS.filter((n) => (c[n] ?? 0) > 0).sort((a, b) => (c[b] ?? 0) - (c[a] ?? 0))
}
