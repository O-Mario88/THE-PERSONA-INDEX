// The local day, on the phone's own clock. Each phone plays the edition for
// its own date: three questions in the morning, then from EVENING_HOUR (4 pm)
// a check-in on the morning's answers and three more questions. The day turns
// over at local midnight. Nobody picks a time of day; the clock decides.
// Sunday has no questions: it is the day for the mirror.

import { useEffect, useState } from 'react'
import { answeredAt, recalledChoice, type Option, type Question } from './api'

export const EVENING_HOUR = 16

const pad = (n: number) => String(n).padStart(2, '0')

// localDate is the phone's own date as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isEvening(now = new Date()): boolean {
  return now.getHours() >= EVENING_HOUR
}

// isSaturday says whether date (YYYY-MM-DD) is a Saturday: tomorrow is review day.
export function isSaturday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 6
}

// eveningStart is the moment the evening opens on date, in ms.
export function eveningStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, EVENING_HOUR).getTime()
}

export type Day = { date: string; evening: boolean }

export function dayAt(now: Date): Day {
  return { date: localDate(now), evening: isEvening(now) }
}

// nextTurn is when the day next changes after now, in ms: 4 pm, or midnight.
export function nextTurn(now: Date): number {
  const [y, m, d] = [now.getFullYear(), now.getMonth(), now.getDate()]
  return isEvening(now) ? new Date(y, m, d + 1).getTime() : new Date(y, m, d, EVENING_HOUR).getTime()
}

// useDay is the phone's date and whether its evening has opened. It turns by
// itself while the app is open, and checks again whenever the app comes back
// into view, since a phone asleep at 4 pm or midnight may miss the timer.
export function useDay(): Day {
  const [day, setDay] = useState(() => dayAt(new Date()))
  useEffect(() => {
    const check = () =>
      setDay((d) => {
        const now = dayAt(new Date())
        return now.date === d.date && now.evening === d.evening ? d : now
      })
    const now = new Date()
    const id = setTimeout(check, nextTurn(now) - now.getTime() + 1000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(id)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [day])
  return day
}

export type FollowUpItem = { question: Question; said: Option }

// followUpsFor lists the morning answers the evening check-in goes back to:
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
