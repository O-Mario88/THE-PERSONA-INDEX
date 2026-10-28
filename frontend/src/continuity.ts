// Reasons to keep going past day 3 (Edwin, 2026-10-27: "is there still
// motivation to come back?"). The app shows it remembers: each sitting can
// open with a line tied to an earlier answer, and a step someone said they'd
// try comes back to them on Today, instead of waiting in a list.

import { heldBack, stepKey } from './growthJourney'
import { cardTextOf, forYou } from './insights'
import { loadMoves, type Move } from './moves'
import type { Need } from './needs'
import type { History } from './profile'
import { splitReveal } from './reveal'
import { addDays } from './storage'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// whenWas names a day in the past week: "Yesterday", or "On Monday".
export const whenWas = (date: string, today: string): string =>
  date === addDays(today, -1) ? 'Yesterday' : `On ${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`

// The most recent answer before today, from the past week, that had a card:
// what the person chose and what the app noticed then. Null after a heavy
// answer, so a hard day is never brought back unasked.
export function lastCard(today: string, h: History): { date: string; label: string; noticed: string; theme?: string } | null {
  const from = addDays(today, -7)
  const earlier = [...h.answers].filter((a) => a.date < today && a.date >= from).sort((a, b) => b.date.localeCompare(a.date))
  if (earlier[0]?.heavy) return null
  for (const a of earlier) {
    const card = cardTextOf(a.questionId)
    if (!card || card.heavy || !card.reveal) continue
    return { date: card.date, label: card.label, noticed: splitReveal(card.reveal).headline, ...(card.theme ? { theme: card.theme } : {}) }
  }
  return null
}

// rememberLine ties today to that answer, at the start of a sitting. Null on
// the first day, after a heavy answer, or with nothing from the last week.
export function rememberLine(today: string, h: History): string | null {
  const card = lastCard(today, h)
  return card ? `${whenWas(card.date, today)} you chose “${card.label}”, and I noticed: ${card.noticed} Let's see what today adds.` : null
}

// ideaToTry is something useful for a day someone doesn't feel like answering:
// a small step from one of their own recent cards that they haven't tried yet.
export function ideaToTry(today: string, h: History, moves: Move[] = loadMoves()): { questionId: string; optionId: string; step: string; from: string } | null {
  const tried = new Set(moves.map((m) => m.questionId))
  const held = heldBack(moves)
  const card = forYou(h, today, 30).find((c) => c.step && !c.heavy && !tried.has(c.questionId) && !held.has(stepKey(c.step)))
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
