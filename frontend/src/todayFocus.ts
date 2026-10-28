// The focused Today screen (Edwin, 2026-10-28: "more focused, personal"):
// one thing you said before, today's questions tied to it when they truly
// are, one quiet next step of your own, and the Mirror that's coming. Each
// part says nothing rather than something generic.

import { carryLine, ideaToTry, lastCard, whenWas } from './continuity'
import { dueStep, revisitFor } from './growthJourney'
import { acrossDays, startedOn } from './firstWeek'
import { readWriting } from './kinder'
import { loadMoves, type Move } from './moves'
import { reflections, type Reflection, type ReflectionArea } from './notebook'
import type { History } from './profile'
import { AREA_NAMES } from './reflect'
import { addDays } from './storage'
import { themeName } from './themes'

const MEMORY_DAYS = 7

export type Memory =
  | { kind: 'writing'; id: string; date: string; when: string; text: string; area: ReflectionArea }
  | { kind: 'answer'; date: string; when: string; label: string; noticed: string; theme?: string }

// lastMemory is the most recent thing from the past week, before today: your
// own written words first, else the card from your last answers. Hard words
// and heavy answers never come back onto the home screen.
export function lastMemory(today: string, h: History, written: Reflection[] = reflections()): Memory | null {
  const from = addDays(today, -MEMORY_DAYS)
  const lastAnswer = [...h.answers].filter((a) => a.date < today && a.date >= from).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (lastAnswer?.heavy) return null
  const words = [...written]
    .filter((r) => r.date < today && r.date >= from && r.answer.trim() && readWriting(r.answer) === null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)[0]
  const card = lastCard(today, h)
  if (words && (!card || words.date >= card.date)) {
    return { kind: 'writing', id: words.id, date: words.date, when: whenWas(words.date, today), text: words.answer.trim(), area: words.area }
  }
  return card ? { kind: 'answer', when: whenWas(card.date, today), ...card } : null
}

// personalLine sits under the greeting: how many days you've been here (in
// the first week) and what you were thinking about last time. It names the
// part of life, never your words, which stay behind a tap on the card.
export function personalLine(dayN: number | null, m: Memory | null): string | null {
  const day = dayN && dayN > 1 ? `Day ${dayN} with you.` : ''
  const topic = !m ? null : m.kind === 'writing' ? AREA_NAMES[m.area].toLowerCase() : m.theme ? themeName(m.theme).toLowerCase() : null
  const last = m && topic ? (m.kind === 'writing' ? `${m.when}, you wrote about ${topic}.` : `${m.when}, your answers touched on ${topic}.`) : ''
  return [day, last].filter(Boolean).join(' ') || null
}

// The question themes that belong to each part of life you can write about.
const AREA_THEMES: Record<ReflectionArea, string[]> = {
  work: ['work-career', 'colleagues'],
  school: ['school', 'learning'],
  family: ['family', 'relatives', 'parenting', 'partnership'],
  culture: ['faith', 'celebrations'],
  social: ['friendship', 'neighbours', 'helping', 'dating'],
  health: ['sleep-health', 'body', 'food'],
  money: ['money', 'wealth-luxury'],
  self: ['confidence', 'happiness', 'sadness-stress', 'honesty', 'anger', 'rest'],
}

// linkLine ties today's questions to what you said before, only when one of
// them is about the same part of life.
export function linkLine(m: Memory, todaysThemes: string[]): string {
  const near = m.kind === 'answer' ? (m.theme ? [m.theme] : []) : AREA_THEMES[m.area]
  const shared = todaysThemes.find((t) => near.includes(t))
  return shared ? `One of today’s questions comes back to ${themeName(shared).toLowerCase()}.` : 'Let’s see what today adds to it.'
}

export type QuietStep =
  | { kind: 'followUp'; move: Move }
  | { kind: 'revisit'; move: Move; line: string }
  | { kind: 'carry'; text: string }
  | { kind: 'idea'; questionId: string; optionId: string; step: string; from: string }

// quietStep is the one next step on Today: how a step you said you'd try
// went (the Growth Journey check-in), then a step that helped before when
// today touches the same part of life, then one thing to carry from today's
// answers, then a small idea from your own recent cards.
export function quietStep(today: string, h: History, moves: Move[] = loadMoves()): QuietStep | null {
  const move = dueStep(today, moves)
  if (move) return { kind: 'followUp', move }
  const again = revisitFor(today, h, moves)
  if (again) return { kind: 'revisit', ...again }
  const carry = carryLine(today, h)
  if (carry) return { kind: 'carry', text: carry }
  const idea = ideaToTry(today, h, moves)
  return idea ? { kind: 'idea', ...idea } : null
}

export type MirrorPreview = { days: number; answered: boolean[]; first: boolean; lean: string | null }

// nextMirror counts down to Sunday's Mirror: a dot for each day this week
// since you started, filled where you answered (nothing lost on a missed
// day), and what this week's answers lean towards so far. Null on Sunday,
// when the Mirror itself is ready.
export function nextMirror(today: string, h: History): MirrorPreview | null {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (weekday === 0) return null
  const monday = addDays(today, 1 - weekday)
  const started = startedOn(today, h)
  const start = started > monday ? started : monday
  const answeredOn = new Set(h.answers.map((a) => a.date))
  const answered: boolean[] = []
  for (let d = start; d <= today; d = addDays(d, 1)) answered.push(answeredOn.has(d))
  const week = { answers: h.answers.filter((a) => a.date >= start), skips: h.skips }
  return { days: 7 - weekday, answered, first: started >= addDays(today, -weekday), lean: acrossDays(today, week).lean }
}
