// Reminders, planned on the phone, for the app on iPhone, Android and Mac
// (the website has none; mobile/src/platform/reminders.ts hands them to the
// system). The morning three, the evening three, the Sunday Mirror and the
// check-ins are always on, with nothing to switch (Edwin, 2026-10-29); the
// person can choose the morning and evening times, and the phone's own
// settings can silence them. The plan covers the week ahead, one
// notification per day per kind, so today's can be dropped once its sitting
// is done; the app plans again whenever it opens or a sitting is finished.
// The text never carries a word of the person's answers or writing, and
// nothing here is sent.

import { addDays, loadJSON, saveJSON } from './storage'
import { EVENING_OPENS, MORNING_OPENS, type Sitting } from './day'

export type ReminderSettings = {
  morning: boolean
  morningAt: number // minutes after midnight
  evening: boolean
  eveningAt: number
  sunday: boolean
  intentions: boolean
}

export const REMINDERS_OFF: ReminderSettings = { morning: false, morningAt: 8 * 60, evening: false, eveningAt: 19 * 60, sunday: false, intentions: false }
export const REMINDERS_ON: ReminderSettings = { morning: true, morningAt: 8 * 60, evening: true, eveningAt: 19 * 60, sunday: true, intentions: true }

export type PlannedReminder = { id: string; date: string; minutes: number; title: string; body: string; opens: 'today' | 'mirrors' | 'reflect' }

// Notification ids, not a key on the phone.
export const REMINDER_PREFIX = 'reminder.'
const KEY = 'pi.reminders.v1'
const DAYS_AHEAD = 7
export const SUNDAY_AT = 10 * 60
export const CHECK_IN_AT = 9 * 60

export const anyOn = (s: ReminderSettings) => s.morning || s.evening || s.sunday || s.intentions

// The morning three are open from 5 am until 5 pm, the evening three from
// 5 pm until midnight, so a chosen time is kept inside its sitting.
export const morningMinutes = (s: ReminderSettings) => Math.min(Math.max(s.morningAt, MORNING_OPENS), EVENING_OPENS - 30)
export const eveningMinutes = (s: ReminderSettings) => Math.min(Math.max(s.eveningAt, EVENING_OPENS), 23 * 60 + 30)

// Reminders belong to a phone, so they are never backed up. Only the chosen
// times are kept; every reminder is on, whatever an older copy said.
export function reminderSettings(): ReminderSettings {
  const v = loadJSON(KEY)
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ReminderSettings>
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : d)
  return { ...REMINDERS_ON, morningAt: num(o.morningAt, REMINDERS_ON.morningAt), eveningAt: num(o.eveningAt, REMINDERS_ON.eveningAt) }
}

export function setReminderTimes(times: Partial<Pick<ReminderSettings, 'morningAt' | 'eveningAt'>>) {
  const s = reminderSettings()
  saveJSON(KEY, { morningAt: times.morningAt ?? s.morningAt, eveningAt: times.eveningAt ?? s.eveningAt })
}

const isSunday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 0

export function planReminders(
  s: ReminderSettings,
  today: string,
  minutesNow: number,
  doneToday: ReadonlySet<Sitting>,
  intentionDays: readonly string[],
): PlannedReminder[] {
  if (!anyOn(s)) return []
  const out: PlannedReminder[] = []
  const due = new Set(intentionDays)
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const day = addDays(today, i)
    const isToday = i === 0
    const later = (m: number) => !isToday || m > minutesNow
    if (isSunday(day)) {
      if (s.sunday && later(SUNDAY_AT))
        out.push({ id: `${REMINDER_PREFIX}sunday.${day}`, date: day, minutes: SUNDAY_AT, opens: 'mirrors', title: 'Your Sunday Mirror is ready', body: 'A look back at your week, set only against your own.' })
    } else {
      const m = morningMinutes(s)
      if (s.morning && later(m) && !(isToday && doneToday.has('morning')))
        out.push({ id: `${REMINDER_PREFIX}morning.${day}`, date: day, minutes: m, opens: 'today', title: 'Your morning three are waiting', body: 'Two minutes, then the day is yours.' })
      const e = eveningMinutes(s)
      if (s.evening && later(e) && !(isToday && doneToday.has('evening')))
        out.push({ id: `${REMINDER_PREFIX}evening.${day}`, date: day, minutes: e, opens: 'today', title: 'Your evening three are waiting', body: 'A quiet look back at the day.' })
    }
    if (s.intentions && due.has(day) && later(CHECK_IN_AT))
      out.push({ id: `${REMINDER_PREFIX}checkin.${day}`, date: day, minutes: CHECK_IN_AT, opens: 'reflect', title: 'A gentle check-in', body: 'A gentle check-in on something you wanted to try. Only you see it.' })
  }
  return out
}
