// The local day, on the phone's own clock. Five short windows a day (the
// Stage 5 proposal, Edwin 2026-10-24), each with one thing to open:
//
//   05:00 morning    three questions, their cards and one small step
//   11:30 midday     a one-tap check on the step, today's friend, today's read
//   14:30 afternoon  the Human Pulse: how everyone else answered this morning
//   17:00 evening    three evening questions and how the step went
//   21:00 night      three good things, a quiet nod, and tomorrow
//
// Midnight to 5 am is for rest. The morning three stay open until 5 pm and
// the evening three until midnight, so a late start still gets its six
// questions (the sittings of 2026-10-15). Nobody picks a time of day; the
// clock decides. Sunday has no questions: it is the day for the mirror.

import { useEffect, useState } from 'react'

// Minutes after midnight.
export const MORNING_OPENS = 5 * 60
export const MIDDAY_OPENS = 11 * 60 + 30
export const AFTERNOON_OPENS = 14 * 60 + 30
export const EVENING_OPENS = 17 * 60
export const NIGHT_OPENS = 21 * 60
// The morning three can be answered until the evening opens.
export const MORNING_CLOSES = EVENING_OPENS

export type Window = 'rest' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'
// The five windows a person sees, in the day's order.
export const WINDOWS = ['morning', 'midday', 'afternoon', 'evening', 'night'] as const
export type OpenWindow = (typeof WINDOWS)[number]

// Each window's name and when it opens and closes.
export const WINDOW_INFO: Record<OpenWindow, { name: string; short: string; opens: number; closes: number }> = {
  morning: { name: 'Morning', short: 'Morning', opens: MORNING_OPENS, closes: MIDDAY_OPENS },
  midday: { name: 'Midday', short: 'Midday', opens: MIDDAY_OPENS, closes: AFTERNOON_OPENS },
  afternoon: { name: 'Afternoon', short: 'Pulse', opens: AFTERNOON_OPENS, closes: EVENING_OPENS },
  evening: { name: 'Evening', short: 'Evening', opens: EVENING_OPENS, closes: NIGHT_OPENS },
  night: { name: 'Night', short: 'Night', opens: NIGHT_OPENS, closes: 24 * 60 },
}

// The two sittings of three questions.
export type Sitting = 'morning' | 'evening'

const pad = (n: number) => String(n).padStart(2, '0')
const minutesOf = (now: Date) => now.getHours() * 60 + now.getMinutes()

// localDate is the phone's own date as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function windowAt(now: Date): Window {
  const m = minutesOf(now)
  if (m < MORNING_OPENS) return 'rest'
  if (m < MIDDAY_OPENS) return 'morning'
  if (m < AFTERNOON_OPENS) return 'midday'
  if (m < EVENING_OPENS) return 'afternoon'
  if (m < NIGHT_OPENS) return 'evening'
  return 'night'
}

// sittingOf is the sitting whose questions can be answered in a window:
// the morning three from 5 am to 5 pm, the evening three from 5 pm to
// midnight, none while resting.
export function sittingOf(w: Window): Sitting | null {
  if (w === 'rest') return null
  return w === 'evening' || w === 'night' ? 'evening' : 'morning'
}

// isEvening says whether the morning is over: from 5 pm to midnight.
export function isEvening(now = new Date()): boolean {
  return minutesOf(now) >= MORNING_CLOSES
}

// clock is a time of day as a phone shows it: "07:51".
export function clock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
}

// opensAt names when a sitting opens, the way a person would say it.
export function opensAt(sitting: Sitting): string {
  return sitting === 'morning' ? '5 am' : '5 pm'
}

// isSaturday says whether date (YYYY-MM-DD) is a Saturday: tomorrow is review day.
export function isSaturday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 6
}

const at = (date: string, minutes: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 0, minutes).getTime()
}

// morningEnd is the moment the morning three close on date, in ms. Anything
// after it belongs to the evening.
export const morningEnd = (date: string) => at(date, MORNING_CLOSES)

// sittingStart is the moment the morning (5 am) or the evening (5 pm) of
// date began, in ms.
export const sittingStart = (date: string, sitting: Sitting) =>
  at(date, sitting === 'morning' ? MORNING_OPENS : EVENING_OPENS)

// windowCloses is the moment a window of date closes, in ms.
export const windowCloses = (date: string, w: OpenWindow) => at(date, WINDOW_INFO[w].closes)

// isMidday says whether it is around lunch, from 11:30 am until the evening:
// the time for the small-step check.
export function isMidday(now = new Date()): boolean {
  const m = minutesOf(now)
  return m >= MIDDAY_OPENS && m < EVENING_OPENS
}

export type Day = { date: string; window: Window; sitting: Sitting | null }

export function dayAt(now: Date): Day {
  const w = windowAt(now)
  return { date: localDate(now), window: w, sitting: sittingOf(w) }
}

// nextTurn is when the day next changes after now, in ms: the next window's
// opening, or midnight.
export function nextTurn(now: Date): number {
  const [y, mo, d] = [now.getFullYear(), now.getMonth(), now.getDate()]
  const m = minutesOf(now)
  const next = [MORNING_OPENS, MIDDAY_OPENS, AFTERNOON_OPENS, EVENING_OPENS, NIGHT_OPENS].find((t) => t > m)
  return next === undefined ? new Date(y, mo, d + 1).getTime() : new Date(y, mo, d, 0, next).getTime()
}

// left says how long until a moment, the way the countdown ring shows it:
// "2h 16m", "16m", or "1m" for anything under a minute.
export function left(ms: number): { hours: number; minutes: number; text: string } {
  const total = Math.max(1, Math.ceil(ms / 60_000))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return { hours, minutes, text: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m` }
}

// useDay is the phone's date and its window. It turns by itself while the
// app is open, checks again whenever the app comes back into view, since a
// phone asleep at a turn may miss the timer, and checks once a minute in case
// the clock itself moved (a new time zone, a corrected clock).
export function useDay(): Day {
  const [day, setDay] = useState(() => dayAt(new Date()))
  useEffect(() => {
    const check = () =>
      setDay((d) => {
        const now = dayAt(new Date())
        return now.date === d.date && now.window === d.window ? d : now
      })
    const now = new Date()
    const id = setTimeout(check, nextTurn(now) - now.getTime() + 1000)
    const backstop = setInterval(check, 60_000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(id)
      clearInterval(backstop)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [day])
  return day
}

// useNow is the time, refreshed once a minute, for countdowns.
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}
