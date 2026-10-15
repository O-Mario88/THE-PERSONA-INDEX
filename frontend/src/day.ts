// The local day. Each phone plays the edition for its own date, so the
// morning questions arrive in the person's morning, the afternoon three open
// at AFTERNOON_HOUR and the evening check-in at EVENING_HOUR, all on the
// phone's clock. Sunday has no questions: it is the day for the mirror.

import { useEffect, useState } from 'react'
import { answeredAt, recalledChoice, type Option, type Question } from './api'

export const AFTERNOON_HOUR = 12
export const EVENING_HOUR = 17

const pad = (n: number) => String(n).padStart(2, '0')

// localDate is the phone's own date as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isEvening(now = new Date()): boolean {
  return now.getHours() >= EVENING_HOUR
}

export function isAfternoon(now = new Date()): boolean {
  return now.getHours() >= AFTERNOON_HOUR
}

// isSaturday says whether date (YYYY-MM-DD) is a Saturday: tomorrow is review day.
export function isSaturday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 6
}

// eveningStart is the moment the check-in opens on date, in ms.
export function eveningStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, EVENING_HOUR).getTime()
}

// useFromHour says whether the phone's clock has reached hour today, and
// turns true at that hour while the app is open.
function useFromHour(hour: number): boolean {
  const [reached, setReached] = useState(() => new Date().getHours() >= hour)
  useEffect(() => {
    if (reached) return
    const now = new Date()
    const opens = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour).getTime()
    const id = setTimeout(() => setReached(true), opens - now.getTime() + 1000)
    return () => clearTimeout(id)
  }, [reached, hour])
  return reached
}

export const useEvening = () => useFromHour(EVENING_HOUR)
export const useAfternoon = () => useFromHour(AFTERNOON_HOUR)

export type FollowUpItem = { question: Question; said: Option }

// followUpsFor lists the morning answers the evening check-in goes back to
// (the afternoon three get none):
// answered (not skipped) before the evening opened, on questions that have a
// follow-up. A question first answered in the evening has had no day to
// reflect on yet. Answers saved before answer times were kept count as morning.
export function followUpsFor(questions: Question[], date: string): FollowUpItem[] {
  const opens = eveningStart(date)
  return questions.flatMap((question) => {
    const said = question.options.find((o) => o.id === recalledChoice(question.id))
    const at = answeredAt(question.id)
    if (!question.followUp || !said || (at !== null && at >= opens)) return []
    return [{ question, said }]
  })
}
