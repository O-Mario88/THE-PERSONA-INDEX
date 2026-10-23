// My notebook (Phase 3 of the review of 2026-10-15, "Yours to keep"): what a
// person chooses to keep, on this phone only. Cards they kept, three good
// things before bed, one Sunday sentence a week, the plans they made for an
// honest part, and the names they gave themselves. Nothing here is sent; the
// encrypted backup (vault.ts) carries it when the person turns that on.
//
// Each entry is its own key under pi.nb., stamped with the moment it last
// changed (at), so a backup from another phone merges entry by entry and the
// newer copy wins. Removing an entry leaves a small mark in its place, so a
// backup from before the removal cannot bring it back; marks go after 400
// days.

import type { Verdict } from './api'
import { addDays, daysBetween, keys, loadJSON, remove, saveJSON } from './storage'

const PREFIX = 'pi.nb.'
const MARK_DAYS = 400

type Stamp = { at: number }
type Removed = Stamp & { removed: true }

// Revisits: once a month, Sunday asks whether a kept card still feels true.
export type Revisit = { date: string; verdict: 'still' | 'changing' | 'not_anymore' }

export type KeptCard = Stamp & {
  kind: 'card'
  date: string // the question's day
  questionId: string
  theme: string
  private?: true // an intimacy question: shown folded
  prompt: string
  answer: string // the option chosen, or the closest one to the person's words
  words?: string // the person's own words, when they answered that way
  headline: string
  body?: string
  otherSide?: string
  step?: string
  verdict?: Verdict
  revisits?: Revisit[]
}

export type GoodThings = Stamp & { kind: 'good'; date: string; lines: string[] }
export type Sentence = Stamp & { kind: 'sentence'; week: string; text: string } // week: its Monday
// A check of a plan. "did" and "not_yet" go to the server under their own
// random key, so a resend counts once and no two checks can be tied to one
// plan there; "changed" never leaves the phone.
export type PlanCheck = { date: string; status: 'did' | 'not_yet' | 'changed'; key?: string; sent?: true }
export type Plan = Stamp & {
  kind: 'plan'
  id: string
  made: string
  madeAt?: number // when it was made, in ms, so the next sitting asks about it
  trait: string
  high: boolean
  when: string
  will: string
  checks: PlanCheck[]
  closed?: true
}
export type Name = Stamp & { kind: 'name'; week: string; suggested: string; name: string }
export type Practised = Stamp & { kind: 'practice'; date: string; practice: string }

export type NotebookEntry = KeptCard | GoodThings | Sentence | Plan | Name | Practised

const keyOf = (e: NotebookEntry): string => {
  switch (e.kind) {
    case 'card':
      return `${PREFIX}card.${e.questionId}`
    case 'good':
      return `${PREFIX}good.${e.date}`
    case 'sentence':
      return `${PREFIX}sentence.${e.week}`
    case 'plan':
      return `${PREFIX}plan.${e.id}`
    case 'name':
      return `${PREFIX}name.${e.week}`
    case 'practice':
      return `${PREFIX}practice.${e.date}.${e.practice}`
  }
}

const isRemoved = (v: unknown): v is Removed => !!v && typeof v === 'object' && (v as Removed).removed === true

function read<T extends NotebookEntry>(key: string, kind: T['kind']): T | null {
  const v = loadJSON(key) as T | null
  return v && typeof v === 'object' && v.kind === kind && typeof v.at === 'number' ? v : null
}

function write(e: NotebookEntry) {
  saveJSON(keyOf(e), { ...e, at: Math.max(Date.now(), e.at + 1) })
}

function drop(key: string) {
  if (loadJSON(key) !== null) saveJSON(key, { removed: true, at: Date.now() } satisfies Removed)
}

function all<T extends NotebookEntry>(kind: T['kind']): T[] {
  return keys(`${PREFIX}${kind}.`).flatMap((k) => {
    const v = read<T>(k, kind)
    return v ? [v] : []
  })
}

// Kept cards.
export const keptCard = (questionId: string) => read<KeptCard>(`${PREFIX}card.${questionId}`, 'card')
export const keptCards = () => all<KeptCard>('card').sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)

export function keepCard(c: Omit<KeptCard, 'kind' | 'at'>) {
  write({ ...c, kind: 'card', at: 0 })
}

export function unkeepCard(questionId: string) {
  drop(`${PREFIX}card.${questionId}`)
}

// noteVerdict keeps the tap under a card with the card, when it is kept.
export function noteVerdict(questionId: string, verdict: Verdict) {
  const c = keptCard(questionId)
  if (c && c.verdict !== verdict) write({ ...c, verdict })
}

export function reviseCard(questionId: string, r: Revisit) {
  const c = keptCard(questionId)
  if (c) write({ ...c, revisits: [...(c.revisits ?? []), r] })
}

// Three good things, one entry a day.
export const goodThings = (date: string) => read<GoodThings>(`${PREFIX}good.${date}`, 'good')
export const allGoodThings = () => all<GoodThings>('good').sort((a, b) => b.date.localeCompare(a.date))

export function keepGoodThings(date: string, lines: string[]) {
  const kept = lines.map((l) => l.trim()).filter(Boolean)
  if (kept.length === 0) return
  write({ kind: 'good', date, lines: kept, at: goodThings(date)?.at ?? 0 })
}

// The Sunday sentence, one a week, under its Monday.
export const sentence = (week: string) => read<Sentence>(`${PREFIX}sentence.${week}`, 'sentence')
export const sentencesBetween = (from: string, to: string) =>
  all<Sentence>('sentence')
    .filter((s) => s.week >= from && s.week <= to)
    .sort((a, b) => a.week.localeCompare(b.week))

export function keepSentence(week: string, text: string) {
  write({ kind: 'sentence', week, text: text.trim(), at: sentence(week)?.at ?? 0 })
}

// Plans for an honest part: "When ___, I will ___".
export const plan = (id: string) => read<Plan>(`${PREFIX}plan.${id}`, 'plan')
export const plans = () => all<Plan>('plan').sort((a, b) => b.made.localeCompare(a.made) || b.at - a.at)
export const openPlans = () => plans().filter((p) => !p.closed)

export function makePlan(p: Omit<Plan, 'kind' | 'at' | 'checks' | 'id' | 'madeAt'> & { id?: string; madeAt?: number }): Plan {
  const made: Plan = { ...p, kind: 'plan', id: p.id ?? newId(), checks: [], at: 0, madeAt: p.madeAt ?? Date.now() }
  write(made)
  return plan(made.id)!
}

export function changePlan(id: string, when: string, will: string, date: string) {
  const p = plan(id)
  if (p) write({ ...p, when, will, checks: [...p.checks, { date, status: 'changed' }] })
}

export function checkPlan(id: string, status: 'did' | 'not_yet', date: string) {
  const p = plan(id)
  if (p) write({ ...p, checks: [...p.checks, { date, status, key: newId() }] })
}

// markCheckSent notes that the server has a check, or never can.
export function markCheckSent(id: string, key: string) {
  const p = plan(id)
  if (p) write({ ...p, checks: p.checks.map((c) => (c.key === key ? { ...c, sent: true as const } : c)) })
}

// unsentChecks lists the checks the server has not got yet.
export function unsentChecks(): { planId: string; check: PlanCheck & { key: string } }[] {
  return plans().flatMap((p) =>
    p.checks.flatMap((c) => (c.key && !c.sent && c.status !== 'changed' ? [{ planId: p.id, check: { ...c, key: c.key } }] : [])),
  )
}

export function closePlan(id: string) {
  const p = plan(id)
  if (p) write({ ...p, closed: true })
}

export function removePlan(id: string) {
  drop(`${PREFIX}plan.${id}`)
}

// planToCheck is the open plan a sitting asks about: one made before the
// sitting began (since, in ms) and not checked today, the oldest first.
export function planToCheck(date: string, since: number): Plan | null {
  const madeAt = (p: Plan) => p.madeAt ?? Date.parse(`${p.made}T00:00:00`)
  return (
    openPlans()
      .filter((p) => madeAt(p) < since)
      .filter((p) => !p.checks.some((c) => c.date === date))
      .sort((a, b) => madeAt(a) - madeAt(b))[0] ?? null
  )
}

// The name the identity card carries for a week: the one suggested, or the
// one the person gave it.
export const nameFor = (week: string) => read<Name>(`${PREFIX}name.${week}`, 'name')
export const names = () => all<Name>('name').sort((a, b) => b.week.localeCompare(a.week))

export function rename(week: string, suggested: string, name: string) {
  const n = name.trim()
  if (!n || n === suggested) drop(`${PREFIX}name.${week}`)
  else write({ kind: 'name', week, suggested, name: n, at: nameFor(week)?.at ?? 0 })
}

// Practices done, one entry per practice a day.
export function notePractice(date: string, practice: string) {
  write({ kind: 'practice', date, practice, at: 0 })
}
export const practicesDone = () => all<Practised>('practice').sort((a, b) => b.date.localeCompare(a.date))

// revisitDue is the kept card Sunday brings back: one that felt true (or was
// not judged) at least four weeks ago and has not been revisited for four
// weeks, the longest-kept first. Only one a month: none while a revisit was
// answered in the last four weeks.
export function revisitDue(today: string): KeptCard | null {
  const recent = (r: Revisit) => daysBetween(r.date, today) < 28
  const cards = keptCards()
  if (cards.some((c) => c.revisits?.some(recent))) return null
  return (
    cards
      .filter((c) => !c.private && c.verdict !== 'not_me' && daysBetween(c.date, today) >= 28)
      .filter((c) => !(c.revisits ?? []).some(recent))
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  )
}

// pruneNotebook clears the marks of removed entries after 400 days.
export function pruneNotebook(today: string) {
  const cutoff = Date.parse(`${addDays(today, -MARK_DAYS)}T00:00:00Z`)
  for (const k of keys(PREFIX)) {
    const v = loadJSON(k)
    if (isRemoved(v) && v.at < cutoff) remove(k)
  }
}

export function notebookCount(): number {
  return keys(PREFIX).filter((k) => {
    const v = loadJSON(k) as NotebookEntry | null
    return !!v && !isRemoved(v) && typeof v === 'object' && v.kind !== 'practice'
  }).length
}

// mergeEntry picks which of two copies of one notebook key to keep: the one
// changed last, a removal mark included.
export function mergeEntry(local: unknown, other: unknown): unknown {
  const at = (v: unknown) => (v && typeof v === 'object' && typeof (v as Stamp).at === 'number' ? (v as Stamp).at : -1)
  return at(other) > at(local) ? other : local
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
