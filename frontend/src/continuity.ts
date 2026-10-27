// Reasons to keep going past day 3 (Edwin, 2026-10-27: "is there still
// motivation to come back?"). The app shows it remembers: each sitting can
// open with a line tied to an earlier answer, and a step someone said they'd
// try comes back to them on Today, instead of waiting in a list.

import { cardTextOf } from './insights'
import { loadMoves, type Move } from './moves'
import type { History } from './profile'
import { splitReveal } from './reveal'
import { addDays } from './storage'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const whenWas = (date: string, today: string) =>
  date === addDays(today, -1) ? 'Yesterday' : `On ${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`

// rememberLine ties today to the most recent earlier answer that had a card:
// what the person chose, and what the app noticed then. Null on the first
// day, after a heavy answer, or with nothing from the last week.
export function rememberLine(today: string, h: History): string | null {
  const from = addDays(today, -7)
  const earlier = [...h.answers].filter((a) => a.date < today && a.date >= from).sort((a, b) => b.date.localeCompare(a.date))
  if (earlier[0]?.heavy) return null
  for (const a of earlier) {
    const card = cardTextOf(a.questionId)
    if (!card || card.heavy || !card.reveal) continue
    const { headline } = splitReveal(card.reveal)
    return `${whenWas(card.date, today)} you chose “${card.label}”, and I noticed: ${headline} Let's see what today adds.`
  }
  return null
}

// stepToFollow is the oldest step from the past week, before today, that
// someone said they'd try and hasn't said how it went.
export function stepToFollow(today: string, moves: Move[] = loadMoves()): Move | null {
  const from = addDays(today, -7)
  return [...moves].filter((m) => m.status === 'started' && m.date < today && m.date >= from).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}
