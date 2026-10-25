// What you're reaching for (Stage 2 of the proposal of 2026-10-24): which
// needs a person's own answers reached for, whether their usual routes get
// them there, and the one question the mirror asks when feeling safe keeps
// coming first. All of it is read from this phone's history; nothing here is
// sent, scored or set against anyone else.

import type { Question } from './api'
import { NEEDS, type Need } from './needs'
import { addDays, loadJSON, saveJSON } from './storage'
import { mondayOf, type AnswerRecord, type History, type Route } from './profile'

// An answer counts towards what someone reaches for when it carries a need,
// is not an intimacy answer (the mirror never shows those), is not heavy (a
// heavy card shows no reading) and is not one they said was not them.
const counts = (a: AnswerRecord): a is AnswerRecord & { need: Need } =>
  !!a.need && a.theme !== 'intimacy' && !a.heavy && a.verdict !== 'not_me'

export type RouteNote = { questionId: string; date: string; label: string; route: Route }
export type NeedRead = { need: Need; answers: number; days: number; routes: RouteNote[] }

// needsBetween counts each need's answers from one date to another, most
// answers first; a tie goes to the need reached for most recently.
export function needsBetween(h: History, from: string, to: string): NeedRead[] {
  const reads = new Map<Need, NeedRead & { dates: Set<string>; last: string }>()
  for (const a of h.answers) {
    if (a.date < from || a.date > to || !counts(a)) continue
    const r = reads.get(a.need) ?? { need: a.need, answers: 0, days: 0, routes: [], dates: new Set<string>(), last: '' }
    r.answers++
    r.dates.add(a.date)
    if (a.date >= r.last) r.last = a.date
    if (a.route && a.label) r.routes.push({ questionId: a.questionId, date: a.date, label: a.label, route: a.route })
    reads.set(a.need, r)
  }
  return [...reads.values()]
    .sort((x, y) => y.answers - x.answers || y.last.localeCompare(x.last) || NEEDS.indexOf(x.need) - NEEDS.indexOf(y.need))
    .map(({ need, answers, dates, routes }) => ({ need, answers, days: dates.size, routes }))
}

// A need is shown once it is a pattern: three or more answers on two or more
// days, the same rule as a leaning's reading level.
const isPattern = (r: NeedRead) => r.answers >= 3 && r.days >= 2

// reachedFor is the week's two needs that drove most choices, once each is a
// pattern.
export function reachedFor(h: History, from: string, to: string): NeedRead[] {
  return needsBetween(h, from, to).filter(isPattern).slice(0, 2)
}

// safetyLed says whether feeling safe has led three weeks running, the week
// ending on `to` and the two before it. Then the mirror asks, never tells,
// whether something else feels uncertain (security is often a stand-in when
// another need is frustrated).
export function safetyLed(h: History, from: string, to: string): boolean {
  return [0, 7, 14].every((back) => {
    const top = needsBetween(h, addDays(from, -back), addDays(to, -back))[0]
    return !!top && top.need === 'security' && isPattern(top)
  })
}

// routeToAsk is the morning answer the evening asks about: the deepest one
// that counts, from the morning's questions. One a day, and none when the
// morning held no such answer.
export function routeToAsk(h: History, morning: Question[], date: string) {
  let best: { record: AnswerRecord & { need: Need }; question: Question; label: string } | null = null
  for (const q of morning) {
    const record = h.answers.find((a) => a.questionId === q.id)
    if (!record || record.date !== date || record.evening || !counts(record)) continue
    const label = q.options.find((o) => o.id === record.optionId)?.label
    if (!label) continue
    if (!best || record.depth > best.record.depth) best = { record, question: q, label }
  }
  return best
}

// The answer to "Is something else feeling uncertain right now?", kept on
// this phone for five weeks, by the Monday of the mirror's week.
export const UNCERTAIN = ['money', 'people', 'work', 'health', 'nothing'] as const
export type Uncertain = (typeof UNCERTAIN)[number]
export const safetyPrefix = 'pi.safety.'

export function safetyAnswer(from: string): Uncertain | null {
  const v = loadJSON(safetyPrefix + mondayOf(from))
  return typeof v === 'string' && (UNCERTAIN as readonly string[]).includes(v) ? (v as Uncertain) : null
}

export function rememberSafety(from: string, answer: Uncertain) {
  saveJSON(safetyPrefix + mondayOf(from), answer)
}
