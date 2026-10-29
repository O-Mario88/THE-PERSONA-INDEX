// The Mirror day (Edwin's brief, 2026-10-29: "choose Mirror day"). Sunday
// until the person chooses another. Sunday ends the week, so a Sunday Mirror
// shows the week it ends; on any other day the Mirror shows the week that has
// just finished. The day moves the Mirror's reminder and the countdown on
// Today; the week itself still runs Monday to Sunday, and Sunday still brings
// no questions.
import { locale } from './locale'
import { addDays, loadJSON, saveJSON } from './storage'

export const MIRROR_DAY_KEY = 'pi.mirror.day'
export const SUNDAY = 0

// Monday to Sunday, as days of the week (0 is Sunday).
export const MIRROR_DAYS = [1, 2, 3, 4, 5, 6, 0] as const

const isDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6

export function mirrorDay(): number {
  const v = loadJSON(MIRROR_DAY_KEY)
  return isDay(v) ? v : SUNDAY
}

export function setMirrorDay(day: number) {
  if (isDay(day)) saveJSON(MIRROR_DAY_KEY, day)
}

export const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

export const isMirrorDay = (iso: string, day = mirrorDay()) => weekdayOf(iso) === day

// 2026-11-01 was a Sunday, so adding the day gives a date with that name.
export const dayName = (day: number, style: 'long' | 'short' = 'long') => new Date(`${addDays('2026-11-01', day)}T12:00:00Z`).toLocaleDateString(locale(), { weekday: style, timeZone: 'UTC' })

export const mirrorName = (day = mirrorDay()) => `${dayName(day)} Mirror`

// How many weeks back the Mirror that is ready on its day looks.
export const readyBack = (day = mirrorDay()) => (day === SUNDAY ? 0 : 1)
