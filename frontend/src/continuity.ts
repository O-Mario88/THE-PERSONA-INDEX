// Reasons to keep going past day 3 (Edwin, 2026-10-27: "is there still
// motivation to come back?"). The app shows it remembers: each sitting can
// open with a line tied to an earlier answer, and a step someone said they'd
// try comes back to them on Today, instead of waiting in a list.

import { cardTextOf, forYou } from './insights'
import { loadMoves, type Move } from './moves'
import type { Need } from './needs'
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

// ideaToTry is something useful for a day someone doesn't feel like answering:
// a small step from one of their own recent cards that they haven't tried yet.
export function ideaToTry(today: string, h: History, moves: Move[] = loadMoves()): { questionId: string; optionId: string; step: string; from: string } | null {
  const tried = new Set(moves.map((m) => m.questionId))
  const card = forYou(h, today, 30).find((c) => c.step && !c.heavy && !tried.has(c.questionId))
  return card?.step ? { questionId: card.questionId, optionId: card.optionId, step: card.step, from: card.label } : null
}

// A question worth carrying: one thing to notice in the day ahead, from what
// today's answers reached for. Not a task and not a notification; just
// something that may come back to mind in an ordinary moment.
export const CARRY: Record<Need, string> = {
  freedom: 'Today, notice one moment when you chose something for yourself, however small.',
  belonging: 'Today, notice who you feel most at ease with, and what they do that helps.',
  respect: 'If you feel unseen today, notice what you wanted someone to see.',
  competence: 'Notice one thing you did well today, even if nobody else saw it.',
  security: 'When something feels uncertain today, notice what helps you feel steady.',
  calm: 'Notice one moment today when your shoulders drop.',
  understood: 'Notice when someone really gets what you mean today.',
}

export function carryLine(today: string, h: History): string | null {
  const counts = new Map<Need, number>()
  for (const a of h.answers) if (a.date === today && a.need && !a.heavy) counts.set(a.need, (counts.get(a.need) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return top ? CARRY[top] : null
}
