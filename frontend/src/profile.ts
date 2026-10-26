// The on-phone profile: answer history, interest per theme, how far each
// leaning has been earned, the thread line on a card, change against the
// person's own past, and the checks for low and heavy answers.
// None of it is ever sent to the server.
//
// Scoring rules, version 3 (change SCORING_VERSION when they change, so old
// reads are never silently reinterpreted):
// - Interest per theme: each answer adds (depth - 2.5) / 1.5, from -1 for the
//   lightest option to +1 for the deepest; each skip adds -1. Every event
//   halves in weight each week, so interests fade over about two weeks.
// - A leaning (a trait and a side) is earned by the answers of the last 21
//   days whose weights point that way (earned): a hint, a pattern or steady.
// - An answer whose card the person tapped "Not me" says nothing about them
//   (since 2026-10-16): it counts towards no leaning, unless they picked the
//   reading that is closer, whose trait weights count in its place
//   (traitsOf). It still moves interest, since they did answer it.
// - Evening follow-up answers (asked until 2026-10-15, still read while they
//   are kept) carry trait weights but no depth, so they never move interest.

import type { Question, Verdict } from './api'
import { isNeed, type Need } from './needs'
import { addDays, loadJSON, remove, saveJSON } from './storage'
import { weave } from './tapestry'
import { TRAITS, type TraitSide } from './traits'

export const SCORING_VERSION = 3

export type AnswerRecord = {
  date: string
  questionId: string
  theme: string
  depth: number
  traits: Record<string, number>
  optionId?: string // since 2026-10-16
  verdict?: Verdict // the tap under the card
  closer?: { optionId: string; traits: Record<string, number> } // after "Not me": the reading picked as closer
  evening?: true
  heavy?: true // a heavy answer (since 2026-10-24)
  need?: Need // what the answer reached for (since 2026-10-24)
  route?: Route // the evening's "Does that route usually get you there?"
  label?: string // the option's label, kept once a route is tapped, for the mirror
  regional?: true // a regional question (regional.ts), answered on this phone only (since 2026-10-24)
}
// How well a route gets the person to what they were after, in their words.
export type Route = 'yes' | 'bit' | 'no'
// A skipped regional question keeps its id, so the phone can pace them (regional.ts).
export type SkipRecord = { date: string; theme: string; regional?: true; questionId?: string }
export type History = { answers: AnswerRecord[]; skips: SkipRecord[] }

const DAY = 86400_000
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY

const historyKey = 'pi.history.v1'
const KEEP_DAYS = 60

// recalledAnswer is the history kept of one answered question, if any.
export function recalledAnswer(questionId: string): AnswerRecord | null {
  return loadHistory().answers.find((a) => a.questionId === questionId) ?? null
}

export function loadHistory(): History {
  const raw = loadJSON(historyKey) as History | null
  if (raw && Array.isArray(raw.answers) && Array.isArray(raw.skips)) return raw
  return { answers: [], skips: [] }
}

function saveHistory(h: History, today: string) {
  const keep = <T extends { date: string }>(xs: T[]) => xs.filter((x) => days(x.date, today) <= KEEP_DAYS)
  saveJSON(historyKey, { answers: keep(h.answers), skips: keep(h.skips) })
}

export function recordAnswer(q: Question, optionId: string, date: string) {
  const o = q.options.find((x) => x.id === optionId)
  if (!o || !q.theme) return
  const h = loadHistory()
  if (h.answers.some((a) => a.questionId === q.id)) return
  h.answers.push({
    date,
    questionId: q.id,
    theme: q.theme,
    depth: o.depth ?? 1,
    traits: o.traits ?? {},
    optionId,
    ...(o.heavy ? { heavy: true as const } : {}),
    ...(isNeed(o.need) ? { need: o.need } : {}),
    ...(q.local ? { regional: true as const } : {}),
  })
  saveHistory(h, date)
  weave(date, o.need)
}

// recordRoute keeps the person's word on whether an answer's route usually
// gets them what they were after, with the answer's label for the mirror.
export function recordRoute(questionId: string, route: Route, label: string) {
  const h = loadHistory()
  const a = h.answers.find((x) => x.questionId === questionId)
  if (!a) return
  a.route = route
  a.label = label
  saveHistory(h, a.date)
}

// recordVerdict keeps the tap under a card with its answer, and after "Not
// me" the trait weights of the reading the person picked as closer.
export function recordVerdict(questionId: string, verdict: Verdict, closer?: AnswerRecord['closer']) {
  const h = loadHistory()
  const a = h.answers.find((x) => x.questionId === questionId)
  if (!a) return
  a.verdict = verdict
  if (closer) a.closer = closer
  else delete a.closer
  saveHistory(h, a.date)
}

// traitsOf is what an answer says about the person: its option's trait
// weights, or after "Not me" those of the closer reading, or nothing.
export function traitsOf(a: AnswerRecord): Record<string, number> {
  if (a.verdict !== 'not_me') return a.traits
  return a.closer?.traits ?? {}
}

export function recordSkip(q: Question, date: string) {
  if (!q.theme) return
  const h = loadHistory()
  h.skips.push(q.local ? { date, theme: q.theme, regional: true, questionId: q.id } : { date, theme: q.theme })
  saveHistory(h, date)
}

export function interestScores(h: History, today: string): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (theme: string, v: number, date: string) => {
    out[theme] = (out[theme] ?? 0) + v * 0.5 ** (Math.max(0, days(date, today)) / 7)
  }
  for (const a of h.answers) if (!a.evening) add(a.theme, (a.depth - 2.5) / 1.5, a.date)
  for (const s of h.skips) add(s.theme, -1, s.date)
  return out
}

// pickThree chooses this phone's three questions for one half of the day:
// the two highest-interest themes, then the theme seen least in two weeks,
// never two from one theme, and none of the questions or themes already taken
// that morning. A regional question on offer (regional.ts) takes the third
// place when its theme is free. A phone with no history gets the shared
// default three.
export function pickThree(
  pool: Question[],
  defaults: Question[],
  h: History,
  today: string,
  adult: boolean,
  taken: Question[] = [],
  offer: Question | null = null,
): Question[] {
  const takenIds = new Set(taken.map((q) => q.id))
  const eligible = pool.filter((q) => (q.care !== 'intimate' || adult) && !takenIds.has(q.id))
  // The shared defaults, less any the morning already took, topped up from the pool.
  const fallback = defaults.filter((q) => !takenIds.has(q.id))
  for (const q of eligible) if (fallback.length < 3 && !fallback.includes(q)) fallback.push(q)
  if (h.answers.length === 0 && h.skips.length === 0) return fallback
  const interest = interestScores(h, today)
  const seen: Record<string, number> = {}
  for (const a of h.answers) if (!a.evening && days(a.date, today) <= 14) seen[a.theme] = (seen[a.theme] ?? 0) + 1

  const picked: Question[] = []
  const usedThemes = new Set<string>(taken.map((q) => q.theme ?? q.id))
  const take = (q: Question | undefined) => {
    if (!q) return
    picked.push(q)
    usedThemes.add(q.theme ?? q.id)
  }
  const fresh = () => eligible.filter((q) => !usedThemes.has(q.theme ?? q.id))
  const byInterest = (a: Question, b: Question) => (interest[b.theme ?? ''] ?? 0) - (interest[a.theme ?? ''] ?? 0)
  const bySeen = (a: Question, b: Question) => (seen[a.theme ?? ''] ?? 0) - (seen[b.theme ?? ''] ?? 0)

  take([...fresh()].sort(byInterest)[0])
  take([...fresh()].sort(byInterest)[0])
  if (offer && !takenIds.has(offer.id) && !usedThemes.has(offer.theme ?? offer.id)) take(offer)
  else take([...fresh()].sort(bySeen)[0])
  return picked.length === 3 ? picked : fallback
}

// writeFirstOf picks the one card of a sitting that opens with a short box
// for the person's own words, the options coming after as "which is
// closest?" (Edwin, 2026-10-24: "some deep answers are typed instead of
// selected but character controlled"). It is the question in the theme they
// have gone deepest on lately, judged from answers before today so the pick
// holds all day. Never an intimacy question, and none until some theme has
// drawn a deep answer.
const WRITE_FIRST_INTEREST = 0.5

export function writeFirstOf(questions: Question[], h: History, today: string): string | null {
  const before: History = { answers: h.answers.filter((a) => a.date < today), skips: h.skips.filter((s) => s.date < today) }
  const interest = interestScores(before, today)
  let best: { id: string; v: number } | null = null
  for (const q of questions) {
    const v = q.theme && q.care !== 'intimate' ? (interest[q.theme] ?? 0) : 0
    if (v >= WRITE_FIRST_INTEREST && (!best || v > best.v)) best = { id: q.id, v }
  }
  return best?.id ?? null
}

export type Half = 'morning' | 'evening'

const pickKey = (today: string, half: Half) => (half === 'morning' ? `pi.pick.${today}` : `pi.pick.${today}.pm`)

// Each half's pick is fixed at first sight, so the three don't change while
// someone is answering them. The evening is picked once the morning is
// answered or closed, and never repeats the morning's questions or themes.
export function todaysPick(
  pool: Question[],
  defaults: Question[],
  today: string,
  adult: boolean,
  half: Half = 'morning',
  taken: Question[] = [],
  offer: Question | null = null,
  local: Question[] = [],
): Question[] {
  const key = pickKey(today, half)
  const ids = loadJSON(key)
  if (Array.isArray(ids)) {
    // A regional question already picked stays, even if it would not be offered now.
    const known = [...pool, ...defaults, ...(offer ? [offer] : []), ...local]
    const qs = ids.map((id) => known.find((q) => q.id === id))
    if (qs.every(Boolean)) return qs as Question[]
  }
  const h = loadHistory()
  const picked = pickThree(pool.length ? pool : defaults, defaults, h, today, adult, taken, offer)
  const qs = isFirstDay(h, today) ? gentleFirst(picked) : picked
  saveJSON(key, qs.map((q) => q.id))
  return qs
}

// A person's first day: nothing answered or skipped before today (Edwin,
// 2026-10-26: "do you think the users love it on day one?"). The first day
// opens gently, keeps insider labels out and closes on a first glimpse.
export function isFirstDay(h: History, today: string): boolean {
  return !h.answers.some((a) => a.date < today) && !h.skips.some((s) => s.date < today)
}

// Themes that ask a lot of someone who has only just arrived. On the first
// day they come after the everyday ones, never first.
const TENDER_THEMES = new Set(['body', 'sadness-stress', 'anger', 'partnership', 'dating', 'faith', 'intimacy'])
const tenderness = (q: Question) => (q.care === 'intimate' ? 2 : TENDER_THEMES.has(q.theme ?? '') ? 1 : 0)

// gentleFirst orders a sitting lightest first, keeping the order within each.
export function gentleFirst(qs: Question[]): Question[] {
  return qs
    .map((q, i) => ({ q, i }))
    .sort((a, b) => tenderness(a.q) - tenderness(b.q) || a.i - b.i)
    .map(({ q }) => q)
}

// forgetPick drops the given halves' picks for today, so they are picked again.
export function forgetPick(today: string, halves: Half[] = ['morning', 'evening']) {
  for (const half of halves) remove(pickKey(today, half))
}

// A deep answer about sadness and stress. Its card, and the close of its
// sitting, carry one quiet line on where to find support (the review of
// 2026-10-15: help was hard to find). The weekly mirror adds its own note
// when such answers repeat (backend/mirror.go). Many such answers are
// healthy ("The real answer, even if it's messy"), so the card keeps its
// insight; a heavy answer (Option.heavy, marked in the bank) is the one
// whose card stops and points to people.
export const isLowMood = (theme: string | undefined, depth: number | undefined) =>
  theme === 'sadness-stress' && (depth ?? 0) >= 3

// heavyPause is on while answers sound heavy: a heavy answer today, or two
// in the last seven days. While it is on, the close of each sitting leaves
// out the honest part and the offer of a plan (the proposal of 2026-10-24:
// a hard week is no time to be told what to work on).
export function heavyPause(h: History, today: string): boolean {
  const recent = h.answers.filter((a) => a.heavy && days(a.date, today) >= 0 && days(a.date, today) < 7)
  return recent.some((a) => a.date === today) || recent.length >= 2
}

// How far a leaning has been earned on this phone (the same rules as the
// server's mirror, backend/mirror.go): a hint is one or two answers or one
// day; a pattern is three or more answers on two or more days; steady is
// seven or more across three or more weeks. Answers from the last 21 days.
export type Earned = { level: 'hint' | 'pattern' | 'steady'; answers: number; days: number; weeks: number }

const EARN_DAYS = 21

export function earned(h: History, today: string, trait: string, high: boolean): Earned {
  const dates = new Set<string>()
  const mondays = new Set<string>()
  let answers = 0
  for (const a of h.answers) {
    const age = days(a.date, today)
    const w = traitsOf(a)[trait] ?? 0
    if (age < 0 || age >= EARN_DAYS || w === 0 || w > 0 !== high) continue
    answers++
    dates.add(a.date)
    mondays.add(mondayOf(a.date))
  }
  const level =
    answers >= 7 && mondays.size >= 3 ? 'steady' : answers >= 3 && dates.size >= 2 ? 'pattern' : 'hint'
  return { level, answers, days: dates.size, weeks: mondays.size }
}

export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((day + 6) % 7))
}

const ORDINALS = ['', '', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']

// "14 September": the day first, whatever the phone's locale.
const dayMonth = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCDate()} ${d.toLocaleDateString('en', { month: 'long', timeZone: 'UTC' })}`
}

// Change noticed out loud, set only against the person's own past (the
// proposal of 2026-10-24, "The app remembers you"). An answer is a change
// when it leans one way on a trait after three or more answers that leaned
// the other way, with nothing on its own side for two weeks or more. Evening
// answers and intimacy answers are left out, and so is any answer the person
// said was not them (traitsOf). weeks is how long it has been, at most eight
// (the phone keeps 60 days).
export type Change = { date: string; questionId: string; trait: string; high: boolean; weeks: number }

const WEEK_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight']
const readsForChange = (a: AnswerRecord) => !a.evening && a.theme !== 'intimacy'

// changeAt is the change the answer at index i of the history makes, if any.
export function changeAt(h: History, i: number): Change | null {
  const mine = h.answers[i]
  if (!mine || !readsForChange(mine)) return null
  let best: Change | null = null
  let bestAgainst = 0
  for (const [trait, w] of Object.entries(traitsOf(mine))) {
    if (!TRAITS[trait] || w === 0) continue
    const high = w > 0
    let against = 0
    let from: string | null = null
    for (let j = i - 1; j >= 0; j--) {
      const a = h.answers[j]
      const v = readsForChange(a) ? (traitsOf(a)[trait] ?? 0) : 0
      if (v === 0) continue
      from = a.date
      if (v > 0 === high) break
      against++
    }
    if (against < 3 || !from) continue
    const weeks = Math.min(8, Math.floor(days(from, mine.date) / 7))
    if (weeks < 2) continue
    if (!best || weeks > best.weeks || (weeks === best.weeks && against > bestAgainst)) {
      best = { date: mine.date, questionId: mine.questionId, trait, high, weeks }
      bestAgainst = against
    }
  }
  return best
}

// "First time in three weeks your answer leaned towards saying what you think."
export function changeWords(c: Change): string {
  const t = TRAITS[c.trait]
  return `First time in ${WEEK_WORDS[c.weeks]} weeks your answer leaned towards ${(c.high ? t.high : t.low).lean}.`
}

// changeLine is the change one recorded answer makes, in words, if any.
export function changeLine(h: History, questionId: string): string | null {
  const c = changeAt(h, h.answers.findIndex((a) => a.questionId === questionId))
  return c && changeWords(c)
}

// changesBetween lists the changes made by answers between two dates, for the mirror.
export function changesBetween(h: History, from: string, to: string): Change[] {
  return h.answers.flatMap((a, i) => {
    const c = a.date >= from && a.date <= to ? changeAt(h, i) : null
    return c ? [c] : []
  })
}

// threadLine ties a fresh answer to the person's own earlier ones, and is
// there only when it is true (the review of 2026-10-15): a change against
// their own past, the last time the same question came up, or else how
// often this week's answers have leaned the same way. Built on this phone
// from its own history; nothing is sent. The answer itself must already be
// recorded.
export function threadLine(h: History, q: Question, optionId: string, today: string): string | null {
  const bankId = q.id.slice(11)
  if (q.care !== 'intimate') {
    const change = changeLine(h, q.id)
    if (change) return change
    const before = h.answers
      .filter((a) => a.questionId !== q.id && a.questionId.slice(11) === bankId && a.optionId && a.date < today)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    const then = before && q.options.find((o) => o.id === before.optionId)
    if (before && then) {
      return then.id === optionId
        ? `Same answer as when this came up on ${dayMonth(before.date)}.`
        : `When this came up on ${dayMonth(before.date)}, you chose “${then.label}”.`
    }
  }

  const mine = h.answers.find((a) => a.questionId === q.id)
  if (!mine) return null
  const monday = mondayOf(today)
  let best: { n: number; side: TraitSide } | null = null
  for (const [trait, w] of Object.entries(traitsOf(mine))) {
    const t = TRAITS[trait]
    if (!t || w === 0) continue
    const n = h.answers.filter((a) => {
      const v = traitsOf(a)[trait] ?? 0
      return a.date >= monday && a.date <= today && v !== 0 && v > 0 === w > 0
    }).length
    if (n >= 2 && (!best || n > best.n)) best = { n, side: w > 0 ? t.high : t.low }
  }
  if (!best) return null
  return best.n < ORDINALS.length
    ? `${ORDINALS[best.n]} time this week your answer leaned towards ${best.side.lean}.`
    : `Your answers have leaned towards ${best.side.lean} ${best.n} times this week.`
}

// "That's me", "Partly" or "Not me" under a leaning in the mirror. Kept on
// this phone only, for five weeks, so a leaning the person said is not them
// is left out of the mirror's title and summary until fresh answers have had
// time to say otherwise.
export const LEANING_KEEP_DAYS = 35
const leaningPrefix = 'pi.leaning.'
type LeaningVerdict = { verdict: Verdict; date: string }

export function rememberLeaning(trait: string, high: boolean, verdict: Verdict, date: string) {
  saveJSON(`${leaningPrefix}${trait}.${high ? 'high' : 'low'}`, { verdict, date } satisfies LeaningVerdict)
}

export function leaningVerdict(trait: string, high: boolean, today: string): Verdict | null {
  const v = loadJSON(`${leaningPrefix}${trait}.${high ? 'high' : 'low'}`) as LeaningVerdict | null
  if (!v || typeof v.date !== 'string' || days(v.date, today) > LEANING_KEEP_DAYS) return null
  return v.verdict === 'me' || v.verdict === 'partly' || v.verdict === 'not_me' ? v.verdict : null
}

// notMeSides lists the leanings the person said are not them, as "trait.high".
export function notMeSides(today: string): string[] {
  return Object.keys(TRAITS).flatMap((t) =>
    [true, false].filter((high) => leaningVerdict(t, high, today) === 'not_me').map((high) => `${t}.${high ? 'high' : 'low'}`),
  )
}
