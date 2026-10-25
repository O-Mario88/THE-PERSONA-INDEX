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

// Revisits: once a month, Sunday brings back a kept card or a Sunday
// sentence and asks "Is that still true?" (wordsBackDue). After a change,
// the person can say what is different now, in their own words.
export type Revisit = { date: string; verdict: 'still' | 'changing' | 'not_anymore'; note?: string }

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
export type Sentence = Stamp & { kind: 'sentence'; week: string; text: string; revisits?: Revisit[] } // week: its Monday
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
  lookedBack?: string // the day the person last chose to keep going with it, at the eight-week look back
}
export type Name = Stamp & { kind: 'name'; week: string; suggested: string; name: string }
export type Practised = Stamp & { kind: 'practice'; date: string; practice: string }

// A reflection the person typed on the Reflect page (Edwin, 2026-10-25),
// kept with what it was about, and brought back later.
export type ReflectionArea = 'work' | 'school' | 'family' | 'culture' | 'social' | 'health' | 'money' | 'self'
export type ReflectionGroup = 'learnt' | 'strength' | 'grow'
export type ReflectionSource = 'answers' | 'week' | 'circle'
export type ReflectionPeriod = 'day' | 'week' | 'month'
export type Reflection = Stamp & {
  kind: 'reflection'
  id: string
  date: string
  period: ReflectionPeriod
  area: ReflectionArea
  group: ReflectionGroup
  source: ReflectionSource
  about: string
  question: string
  answer: string
  followsUp?: string // the id of the earlier reflection this answers
  free?: true // written freely, with no question (Reflect)
  why?: string // why the question appeared: "From your answers on Tuesday"
  thread?: string // the id of the reflection that started its thread
}

// "Something I'd like to try" (Reflect): an intention saved from a
// reflection, and a gentle check-in a week later. No goals, scores or
// failure: "let it go" is an answer like any other.
export type IntentionCheck = 'helped' | 'some' | 'not_yet' | 'let_go'
export type Intention = Stamp & {
  kind: 'intention'
  id: string
  date: string
  text: string
  from: string // the reflection it came from
  checkOn: string // the day the check-in appears
  check?: IntentionCheck
  checkedOn?: string
}

export type NotebookEntry = KeptCard | GoodThings | Sentence | Plan | Name | Practised | Reflection | Intention

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
    case 'reflection':
      return `${PREFIX}reflection.${e.id}`
    case 'intention':
      return `${PREFIX}intention.${e.id}`
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

// Reflections, newest first.
export const reflections = () => all<Reflection>('reflection').sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)

export function keepReflection(r: Omit<Reflection, 'kind' | 'at'>) {
  const answer = r.answer.trim()
  if (answer) write({ ...r, answer, kind: 'reflection', at: 0 })
}

export function removeReflection(id: string) {
  drop(`${PREFIX}reflection.${id}`)
}

const INTENTION_CHECK_DAYS = 7

export const intentions = () => all<Intention>('intention').sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)

export function keepIntention(i: { id: string; date: string; text: string; from: string }) {
  const text = i.text.trim()
  if (text) write({ ...i, text, kind: 'intention', checkOn: addDays(i.date, INTENTION_CHECK_DAYS), at: 0 })
}

export function removeIntention(id: string) {
  drop(`${PREFIX}intention.${id}`)
}

export function checkIntention(id: string, check: IntentionCheck, today: string) {
  const i = all<Intention>('intention').find((x) => x.id === id)
  if (i) write({ ...i, check, checkedOn: today })
}

// The intentions whose gentle check-in is due today, oldest first.
export const intentionsDue = (today: string) => intentions().filter((i) => !i.check && i.checkOn <= today).reverse()

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
  const was = sentence(week)
  write({ ...was, kind: 'sentence', week, text: text.trim(), at: was?.at ?? 0 })
}

export function reviseSentence(week: string, r: Revisit) {
  const s = sentence(week)
  if (s) write({ ...s, revisits: [...(s.revisits ?? []), r] })
}

// Plans for an honest part: "When ___, I will ___". One is open at a time:
// the one thing the person is working on (the proposal of 2026-10-24, "One
// thing you're working on"), so making a new plan closes the others. Every
// eight weeks the mirror looks back at it with them.
export const plan = (id: string) => read<Plan>(`${PREFIX}plan.${id}`, 'plan')
export const plans = () => all<Plan>('plan').sort((a, b) => b.made.localeCompare(a.made) || b.at - a.at)
export const openPlans = () => plans().filter((p) => !p.closed)
export const focusPlan = (): Plan | null => openPlans()[0] ?? null

export function makePlan(p: Omit<Plan, 'kind' | 'at' | 'checks' | 'id' | 'madeAt'> & { id?: string; madeAt?: number }): Plan {
  for (const o of openPlans()) write({ ...o, closed: true })
  const made: Plan = { ...p, kind: 'plan', id: p.id ?? newId(), checks: [], at: 0, madeAt: p.madeAt ?? Date.now() }
  write(made)
  return plan(made.id)!
}

export const LOOK_BACK_DAYS = 56
// lookBackDue: eight weeks since the plan was made, or since the person last
// chose to keep going with it.
export const lookBackDue = (p: Plan, today: string) => daysBetween(p.lookedBack ?? p.made, today) >= LOOK_BACK_DAYS
export const timesDone = (p: Plan) => p.checks.filter((c) => c.status === 'did').length

export function lookBack(id: string, date: string) {
  const p = plan(id)
  if (p) write({ ...p, lookedBack: date })
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

// Words back (the proposal of 2026-10-24): what Sunday brings back and asks
// "Is that still true?" about. A kept card (with the person's own words, when
// they answered that way) or a Sunday sentence, kept four weeks or more ago,
// the oldest first, and only one a month: none while a revisit was answered
// in the last four weeks. An item is done with once it has changed or is not
// them any more; one that is still true may come back after half a year.
// Private cards and cards the person said were not them never come back.
export type WordsBack = { kind: 'card'; card: KeptCard } | { kind: 'sentence'; sentence: Sentence }

const WORDS_BACK_DAYS = 28
const STILL_AGAIN_DAYS = 182

export function wordsBackDue(today: string): WordsBack | null {
  const cards = keptCards()
  const sentences = all<Sentence>('sentence')
  const recent = (r: Revisit) => daysBetween(r.date, today) < WORDS_BACK_DAYS
  if ([...cards, ...sentences].some((e) => e.revisits?.some(recent))) return null
  const open = (rs: Revisit[] = []) => {
    const last = rs[rs.length - 1]
    return !last || (last.verdict === 'still' && daysBetween(last.date, today) >= STILL_AGAIN_DAYS)
  }
  const old = (date: string) => daysBetween(date, today) >= WORDS_BACK_DAYS
  const due = [
    ...cards
      .filter((c) => !c.private && c.verdict !== 'not_me' && old(c.date) && open(c.revisits))
      .map((card) => ({ from: card.date, item: { kind: 'card', card } as WordsBack })),
    ...sentences
      .filter((s) => s.text && old(addDays(s.week, 6)) && open(s.revisits))
      .map((sentence) => ({ from: addDays(sentence.week, 6), item: { kind: 'sentence', sentence } as WordsBack })),
  ]
  return due.sort((a, b) => a.from.localeCompare(b.from))[0]?.item ?? null
}

// reviseWords keeps the answer to "Is that still true?" with what was brought back.
export function reviseWords(item: WordsBack, r: Revisit) {
  if (item.kind === 'card') reviseCard(item.card.questionId, r)
  else reviseSentence(item.sentence.week, r)
}

// noteRevisit adds "What's different now?" to the item's last revisit.
export function noteRevisit(item: WordsBack, note: string) {
  const text = note.trim()
  const e = item.kind === 'card' ? keptCard(item.card.questionId) : sentence(item.sentence.week)
  const rs = e?.revisits ?? []
  if (!e || !text || rs.length === 0) return
  write({ ...e, revisits: [...rs.slice(0, -1), { ...rs[rs.length - 1], note: text }] })
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
