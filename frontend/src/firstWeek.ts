import { adviceFor } from './advice'
import { heavyPause, isLowMood, loadHistory, type History } from './profile'
import { daysBetween, load, save } from './storage'

// The first week (Edwin, 2026-10-26: "simple, healthy and focused"). A new
// person starts with three light questions, gets a first glimpse of what
// their answers hint at, then makes an account to keep going. Until their
// eighth day the app shows only Today, Reflect, Insights and You; Connect
// and the Mirrors come in once there is something in them. Nothing is
// removed from the app: the full library of questions, reads and words is
// all still there, it just arrives as the person does.

// The day this phone's person began, set when they finish the welcome. Only
// people who began after this release have it, so nobody already using the
// app is suddenly asked to sign up or loses a tab.
export const STARTED_KEY = 'pi.started'
// Set when the person asked to see every section now (Settings), or tapped
// "Invite a friend" from their first glimpse.
export const SHOW_ALL_KEY = 'pi.showall'
export const CONNECT_OPEN_KEY = 'pi.connect.open'
// Which sitting showed the first glimpse, so it stays on that close and no other.
export const GLIMPSE_KEY = 'pi.glimpse'

export const WEEK_ONE_DAYS = 7

export function markStarted(today: string) {
  if (!load(STARTED_KEY)) save(STARTED_KEY, today)
}

// The day the person began: the welcome's day, else their earliest answer.
export function startedOn(today: string, h: History = loadHistory()): string {
  const kept = load(STARTED_KEY)
  if (kept && /^\d{4}-\d{2}-\d{2}$/.test(kept)) return kept
  let first = today
  for (const a of h.answers) if (a.date < first) first = a.date
  for (const s of h.skips) if (s.date < first) first = s.date
  return first
}

// dayWithYou counts from 1 on the first day.
export function dayWithYou(today: string, h?: History): number {
  return Math.max(1, daysBetween(startedOn(today, h), today) + 1)
}

export const showAll = () => load(SHOW_ALL_KEY) === '1'

// A person who began with this release: only they get the first-week
// layout and the sign-up step, so nobody already using the app loses a tab.
export const isNewcomer = () => !!load(STARTED_KEY)

export function inWeekOne(today: string, h?: History): boolean {
  return isNewcomer() && !showAll() && dayWithYou(today, h) <= WEEK_ONE_DAYS
}

// The first glimpse belongs to the close of the person's very first sitting.
export function glimpseHere(date: string, sitting: 'morning' | 'evening', h: History = loadHistory()): boolean {
  const here = `${date}|${sitting}`
  const kept = load(GLIMPSE_KEY)
  if (kept) return kept === here
  if (!isNewcomer()) return false
  // After a heavy answer the close keeps to kind words: no glimpse, no sign-up.
  if (h.answers.some((a) => a.date === date && (a.heavy || isLowMood(a.theme, a.depth)))) return false
  // Every answer so far is from this sitting's day: this is the first one.
  const answered = h.answers.filter((a) => (sitting === 'evening' ? a.evening : !a.evening) && a.date === date)
  if (answered.length === 0 || h.answers.some((a) => a.date !== date || (sitting === 'morning') === !!a.evening)) return false
  save(GLIMPSE_KEY, here)
  return true
}

// The sign-up step (Edwin, 2026-10-26: "first 3 questions and the insight
// then the signup page"): it comes straight after the first glimpse. "Maybe
// later" lets the person finish that day; from the next day their new
// questions wait for an account. Reflect, Insights and their answers stay
// open either way, and everything stays on the phone.
export function needsAccount(signedIn: boolean, today: string): boolean {
  if (signedIn || !isNewcomer()) return false
  const glimpse = load(GLIMPSE_KEY)
  return !!glimpse && glimpse.slice(0, 10) < today
}

// What the person's answers leaned towards on the last day they answered
// before today, in the traits' own words, or null.
export function lastLeaning(today: string, h: History = loadHistory()): string | null {
  let last = ''
  for (const a of h.answers) if (a.date < today && a.date > last) last = a.date
  // A hard stretch is no time to be told what you lean towards.
  if (!last || heavyPause(h, today)) return null
  const day = h.answers.filter((a) => a.date === last && !a.heavy)
  const points = adviceFor(day, h, last, 'morning').points
  return points.length ? points.map((p) => p.lean).join(' and ') : null
}
