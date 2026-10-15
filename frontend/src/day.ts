// The local day. Each phone plays the edition for its own date, so the
// morning questions arrive in the person's morning, and the evening check-in
// opens at EVENING_HOUR on the phone's clock.

import { useEffect, useState } from 'react'
import { answeredAt, recalledChoice, type Option, type Question } from './api'

export const EVENING_HOUR = 17

const pad = (n: number) => String(n).padStart(2, '0')

// localDate is the phone's own date as YYYY-MM-DD.
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function isEvening(now = new Date()): boolean {
  return now.getHours() >= EVENING_HOUR
}

// eveningStart is the moment the check-in opens on date, in ms.
export function eveningStart(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, EVENING_HOUR).getTime()
}

// useEvening says whether it is evening, and turns true at EVENING_HOUR while
// the app is open.
export function useEvening(): boolean {
  const [evening, setEvening] = useState(() => isEvening())
  useEffect(() => {
    if (evening) return
    const now = new Date()
    const opens = new Date(now.getFullYear(), now.getMonth(), now.getDate(), EVENING_HOUR).getTime()
    const id = setTimeout(() => setEvening(true), opens - now.getTime() + 1000)
    return () => clearTimeout(id)
  }, [evening])
  return evening
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
