// Seasonal Echoes (Edwin's brief, 2026-10-29). People change slowly, so day
// to day it rarely feels like growth. Once a week at most, a sitting brings
// back a question the person answered about a month, three months, six
// months or a year ago, without saying so, so the answer is today's. At the
// close, the echo sets the two answers side by side: a different answer,
// and what the person makes of it (changed, some of each, or just a
// different day), or the same answer, with the step that helped last time.
//
// The answers it remembers are kept on the phone (a small note of each: the
// question, the day, the choice and what it reached for), for about a year,
// never an intimate, heavy or regional one. A month-old echo is free; the
// longer ones are part of Patron.

import type { Question } from './api'
import type { CheckIn } from './growthJourney'
import { dateOf } from './locale'
import type { Move } from './moves'
import { isNeed, NEED_PHRASES, type Need } from './needs'
import { isPatron } from './patron'
import type { History } from './profile'
import { addDays, daysBetween, loadJSON, saveJSON } from './storage'

export const ECHO_LOG = 'pi.echoes.v1'
export const ECHO_SEEN = 'pi.echoseen.v1'
const PICK = 'pi.echo.' // pi.echo.<date>: the echo a sitting brought back that day
const LAST = 'pi.echo.last' // the day an echo last came
const KEEP_DAYS = 400
const KEEP_MAX = 1500
const SEEN_MAX = 100
const EVERY_DAYS = 7

export type EchoEntry = { bank: string; date: string; optionId: string; label?: string; need?: Need }
export type Milestone = 30 | 90 | 180 | 365

// How long ago an answer must be for each echo, in days.
const WINDOWS: Record<Milestone, [number, number]> = { 30: [28, 40], 90: [85, 100], 180: [170, 195], 365: [355, 380] }
const PATRON_ORDER: Milestone[] = [365, 180, 90, 30]
const FREE_ORDER: Milestone[] = [30, 365, 180, 90]
export const FREE_MILESTONE: Milestone = 30

// A dated question id is "YYYY-MM-DD-" and the question's own id.
export const bankOf = (questionId: string): string => (/^\d{4}-\d{2}-\d{2}-/.test(questionId) ? questionId.slice(11) : questionId)

const asEntry = (v: unknown): EchoEntry | null => {
  if (!v || typeof v !== 'object') return null
  const e = v as Record<string, unknown>
  if (typeof e.bank !== 'string' || typeof e.date !== 'string' || typeof e.optionId !== 'string') return null
  return { bank: e.bank, date: e.date, optionId: e.optionId, ...(typeof e.label === 'string' ? { label: e.label } : {}), ...(isNeed(e.need) ? { need: e.need } : {}) }
}

export function echoes(): EchoEntry[] {
  const v = loadJSON(ECHO_LOG)
  return Array.isArray(v) ? v.map(asEntry).filter((e): e is EchoEntry => e !== null) : []
}

function saveEchoes(list: EchoEntry[], today: string) {
  const from = addDays(today, -KEEP_DAYS)
  const seen = new Set<string>()
  const kept = list
    .filter((e) => e.date >= from)
    .filter((e) => {
      const k = `${e.bank}|${e.date}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-KEEP_MAX)
  saveJSON(ECHO_LOG, kept)
}

const echoable = (q: Question) => q.care !== 'intimate' && q.theme !== 'intimacy' && !q.local && !!q.theme

// keepEcho notes an answer for an echo later on.
export function keepEcho(q: Question, optionId: string, date: string): void {
  const o = q.options.find((x) => x.id === optionId)
  if (!o || o.heavy || !echoable(q)) return
  saveEchoes([...echoes(), { bank: bankOf(q.id), date, optionId, label: o.label, ...(isNeed(o.need) ? { need: o.need } : {}) }], date)
}

// seedEchoes adds the answers already on the phone that aren't noted yet.
export function seedEchoes(h: History, labelOf: (questionId: string) => string | undefined, today?: string): void {
  const have = new Set(echoes().map((e) => `${e.bank}|${e.date}`))
  const add = h.answers
    .filter((a) => a.optionId && !a.heavy && !a.regional && a.theme !== 'intimacy' && !have.has(`${bankOf(a.questionId)}|${a.date}`))
    .map((a) => {
      const label = labelOf(a.questionId)
      return { bank: bankOf(a.questionId), date: a.date, optionId: a.optionId as string, ...(label ? { label } : {}), ...(isNeed(a.need) ? { need: a.need } : {}) }
    })
  if (add.length)
    saveEchoes(
      [...echoes(), ...add],
      today ??
        add
          .map((e) => e.date)
          .sort()
          .slice(-1)[0],
    )
}

export type FoundEcho = { question: Question; entry: EchoEntry; milestone: Milestone }

// findEcho looks for a question in today's pool answered one of the echo
// lengths ago: the longest first for a Patron, the free month-old one first
// otherwise.
export function findEcho(pool: Question[], today: string, log: EchoEntry[] = echoes(), patron: boolean = isPatron(today)): FoundEcho | null {
  for (const milestone of patron ? PATRON_ORDER : FREE_ORDER) {
    const [lo, hi] = WINDOWS[milestone]
    for (const question of pool) {
      if (!echoable(question)) continue
      const bank = bankOf(question.id)
      const entry = log.filter((e) => e.bank === bank && daysBetween(e.date, today) >= lo && daysBetween(e.date, today) <= hi).sort((a, b) => a.date.localeCompare(b.date))[0]
      if (entry) return { question, entry, milestone }
    }
  }
  return null
}

type Pick = { questionId: string; half: string; milestone: Milestone; from: EchoEntry }

// withEcho puts an echo in a newly picked sitting's third place, once a week
// at most and never twice from one part of life in a sitting.
export function withEcho(picked: Question[], pool: Question[], today: string, half: string): Question[] {
  if (picked.length < 3) return picked
  const last = loadJSON(LAST)
  if (typeof last === 'string' && daysBetween(last, today) < EVERY_DAYS) return picked
  if (loadJSON(PICK + today)) return picked
  const firstTwo = picked.slice(0, 2)
  const found = findEcho(
    pool.filter((x) => !firstTwo.some((p) => p.id === x.id)),
    today,
  )
  if (!found || firstTwo.some((p) => p.theme === found.question.theme)) return picked
  saveJSON(PICK + today, { questionId: found.question.id, half, milestone: found.milestone, from: found.entry } satisfies Pick)
  saveJSON(LAST, today)
  return [...firstTwo, found.question]
}

// echoFor says whether a question of today's sittings is an echo, and of what.
export function echoFor(questionId: string, today: string): { from: EchoEntry; milestone: Milestone } | null {
  const v = loadJSON(PICK + today) as Pick | null
  const from = asEntry(v?.from)
  return v && v.questionId === questionId && from && v.milestone in WINDOWS ? { from, milestone: v.milestone } : null
}

export type EchoReading = { kind: 'shift' | 'steady'; milestone: Milestone; fromDate: string; before: string; after: string; beforeNeed?: Need; afterNeed?: Need; step?: string }

const words = (step: string) => step.trim().replace(/\.+(["”’']?)$/, '$1')

// readEcho sets today's answer beside the one from back then, in today's
// words for both, and on a steady thread the step that helped last time.
export function readEcho(question: Question, nowOptionId: string, from: EchoEntry, milestone: Milestone, moves: Move[], checks: CheckIn[]): EchoReading {
  const option = (id: string) => question.options.find((o) => o.id === id)
  const before = option(from.optionId)?.label ?? from.label ?? ''
  const after = option(nowOptionId)?.label ?? ''
  const beforeNeed = from.need ?? (isNeed(option(from.optionId)?.need) ? option(from.optionId)?.need : undefined)
  const afterNeed = isNeed(option(nowOptionId)?.need) ? option(nowOptionId)?.need : undefined
  const base = { milestone, fromDate: from.date, before, after, ...(beforeNeed ? { beforeNeed } : {}), ...(afterNeed ? { afterNeed } : {}) }
  if (from.optionId !== nowOptionId) return { kind: 'shift', ...base }
  const oldId = `${from.date}-${from.bank}`
  const helped = moves.find((m) => {
    if (m.questionId !== oldId) return false
    const c = checks.find((x) => x.questionId === m.questionId)
    return c ? c.outcome === 'helped' || c.outcome === 'helped_little' : m.status === 'helped'
  })
  return { kind: 'steady', ...base, ...(helped ? { step: helped.step } : {}) }
}

const AGO: Record<Milestone, string> = { 30: 'a month ago', 90: '3 months ago', 180: '6 months ago', 365: 'a year ago' }
const SPAN: Record<Milestone, string> = { 30: 'a month', 90: '3 months', 180: '6 months', 365: 'a year' }
export const echoSpan = (m: Milestone): string => SPAN[m]

const day = (date: string, m: Milestone) => dateOf(date, m >= 180 ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' })
const reaching = (n?: Need) => (n ? `, reaching for ${NEED_PHRASES[n]}` : '')

// Honest both ways (Edwin's brief, 2026-10-29): the same answer is called the
// same, and a different one is asked about, never taken as growth.
export function echoLines(r: EchoReading): { title: string; lines: string[] } {
  if (r.kind === 'steady')
    return {
      title: `The same answer · ${SPAN[r.milestone]}`,
      lines: [
        `Both on ${day(r.fromDate, r.milestone)} and today, you chose “${r.before}”.`,
        r.step ? `Last time this came up, the step that helped was “${words(r.step)}”.` : 'No change here, and that is worth knowing too.',
      ],
    }
  return {
    title: `An echo from ${AGO[r.milestone]}`,
    lines: [
      `On ${day(r.fromDate, r.milestone)}, you were asked this same question.`,
      `Back then, you chose “${r.before}”${reaching(r.beforeNeed)}.`,
      `Today, you chose “${r.after}”${reaching(r.afterNeed)}.`,
      'Has something changed, or was today just different?',
    ],
  }
}

// What the person makes of a different answer: something changed, some of
// each, or just a different day.
export type EchoFelt = 'changed' | 'mixed' | 'different'

export const ECHO_FELT: { id: EchoFelt; label: string }[] = [
  { id: 'changed', label: 'Something has changed' },
  { id: 'mixed', label: 'Some of each' },
  { id: 'different', label: 'Not really, just a different day' },
]

const FELT_REPLY: Record<EchoFelt, string> = {
  changed: 'Kept in My journey, as a change you noticed.',
  mixed: 'Kept in My journey, as partly changed.',
  different: 'Kept in My journey. Some days are simply different days.',
}
const FELT_LINE: Record<EchoFelt, string> = {
  changed: 'You said something has changed.',
  mixed: 'You said it’s some of each.',
  different: 'You said that was just a different day.',
}
export const feltReply = (f: EchoFelt): string => FELT_REPLY[f]
export const feltLine = (f: EchoFelt): string => FELT_LINE[f]

// What the person said about an echo, kept for My Journey.
export type EchoSeen = { date: string; questionId: string; from: string; milestone: Milestone; before: string; after: string; felt?: EchoFelt }

// An older "Feels true to how I've grown" reads as something changed.
const feltOf = (v: unknown): EchoFelt | undefined => (v === 'grown' ? 'changed' : v === 'changed' || v === 'mixed' || v === 'different' ? v : undefined)

export function echoesSeen(): EchoSeen[] {
  const v = loadJSON(ECHO_SEEN)
  if (!Array.isArray(v)) return []
  return v
    .filter((e) => e && typeof e.date === 'string' && typeof e.questionId === 'string' && typeof e.before === 'string')
    .map((e) => {
      const { felt, ...rest } = e as EchoSeen & { felt?: unknown }
      const f = feltOf(felt)
      return f ? { ...rest, felt: f } : rest
    })
}

export function noteEchoSeen(e: EchoSeen): void {
  saveJSON(ECHO_SEEN, [...echoesSeen().filter((x) => x.questionId !== e.questionId), e].slice(-SEEN_MAX))
}
