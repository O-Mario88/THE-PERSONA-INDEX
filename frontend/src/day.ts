// The local day, on the phone's own clock. Each phone plays the edition for
// its own date in two sittings of three questions: the morning, from 5 am
// to 4:30 pm, and the evening, from 5 pm to midnight (Edwin, 2026-10-15).
// Between them is a half-hour pause, and the night until 5 am is for rest.
// Nobody picks a time of day; the clock decides. Sunday has no questions:
// it is the day for the mirror.

import { useEffect, useState } from 'react'

// Minutes after midnight.
export const MORNING_OPENS = 5 * 60
export const MORNING_CLOSES = 16 * 60 + 30
export const EVENING_OPENS = 17 * 60

export type Sitting = 'night' | 'morning' | 'pause' | 'evening'

const pad = (n: number) => String(n).padStart(2, '0')
const minutesOf = (now: Date) => now.getHours() * 60 + now.getMinutes()

// localDate is the phone's own date as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function sittingAt(now: Date): Sitting {
  const m = minutesOf(now)
  if (m < MORNING_OPENS) return 'night'
  if (m < MORNING_CLOSES) return 'morning'
  if (m < EVENING_OPENS) return 'pause'
  return 'evening'
}

// isEvening says whether the morning is over: from 4:30 pm to midnight.
export function isEvening(now = new Date()): boolean {
  return minutesOf(now) >= MORNING_CLOSES
}

// opensAt names when a sitting opens, the way a person would say it.
export function opensAt(sitting: 'morning' | 'evening'): string {
  return sitting === 'morning' ? '5 am' : '5 pm'
}

// isSaturday says whether date (YYYY-MM-DD) is a Saturday: tomorrow is review day.
export function isSaturday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 6
}

// morningEnd is the moment the morning closes on date, in ms. Anything
// after it belongs to the evening.
export function morningEnd(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 0, MORNING_CLOSES).getTime()
}

// sittingStart is the moment the morning (5 am) or the evening (5 pm) of
// date began, in ms.
export function sittingStart(date: string, sitting: 'morning' | 'evening'): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 0, sitting === 'morning' ? MORNING_OPENS : EVENING_OPENS).getTime()
}

// isMidday says whether it is around lunch, from 11:30 am until the morning
// closes at 4:30 pm: the time for the small-step check.
export function isMidday(now = new Date()): boolean {
  const m = minutesOf(now)
  return m >= 11 * 60 + 30 && m < MORNING_CLOSES
}

export type Day = { date: string; sitting: Sitting }

export function dayAt(now: Date): Day {
  return { date: localDate(now), sitting: sittingAt(now) }
}

// nextTurn is when the day next changes after now, in ms: 5 am, 4:30 pm,
// 5 pm or midnight.
export function nextTurn(now: Date): number {
  const [y, mo, d] = [now.getFullYear(), now.getMonth(), now.getDate()]
  const m = minutesOf(now)
  const next = [MORNING_OPENS, MORNING_CLOSES, EVENING_OPENS].find((t) => t > m)
  return next === undefined ? new Date(y, mo, d + 1).getTime() : new Date(y, mo, d, 0, next).getTime()
}

// useDay is the phone's date and its sitting. It turns by itself while the
// app is open, checks again whenever the app comes back into view, since a
// phone asleep at a turn may miss the timer, and checks once a minute in case
// the clock itself moved (a new time zone, a corrected clock).
export function useDay(): Day {
  const [day, setDay] = useState(() => dayAt(new Date()))
  useEffect(() => {
    const check = () =>
      setDay((d) => {
        const now = dayAt(new Date())
        return now.date === d.date && now.sitting === d.sitting ? d : now
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
