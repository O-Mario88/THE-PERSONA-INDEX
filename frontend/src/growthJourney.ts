// My Growth Journey (Edwin, 2026-10-28: "Every little step teaches you
// something"). It closes the loop on every step someone chooses to try: did
// they try it, how did it go, how do they feel now, and anything they want to
// remember. All of it stays on this phone. The server only ever hears the
// step's existing status (helped, no change, not tried), never a feeling or a
// note, and the note is kept with the person's other writing (journal class).
// From these check-ins come the My Journey page (what you've learned, your
// eight parts of life, your history) and the gentle "Last time you tried…".
// Nothing is scored, compared or made up.

import type { StepStatus } from './api'
import { cardTextOf } from './insights'
import { loadMoves, restartMove, type Move } from './moves'
import type { Reflection, ReflectionArea } from './notebook'
import type { History } from './profile'
import { AREA_NAMES, areaOf } from './reflect'
import { addDays, load, loadJSON, save, saveJSON } from './storage'

export type Tried = 'yes' | 'little' | 'not_yet' | 'decided_not'
export type Outcome = 'helped' | 'helped_little' | 'no_difference' | 'harder'
export type Feeling = 'lighter' | 'same' | 'unsettled' | 'unsure'
// later: kept for later, to be asked about again on this day.
export type CheckIn = { questionId: string; date: string; tried: Tried; outcome?: Outcome; feeling?: Feeling; later?: string }

export const CHECKINS_KEY = 'pi.checkins.v1'
export const NOTE_PREFIX = 'pi.stepnote.'
const KEEP = 60
const RECENT_DAYS = 60
const DUE_DAYS = 7

function all(): CheckIn[] {
  const v = loadJSON(CHECKINS_KEY)
  return Array.isArray(v) ? v.filter((c) => c && typeof c.questionId === 'string' && typeof c.date === 'string' && typeof c.tried === 'string') : []
}

export const checkIns = (): CheckIn[] => all()
export const checkInFor = (questionId: string, checks: CheckIn[] = all()): CheckIn | null => checks.find((c) => c.questionId === questionId) ?? null

// saveCheckIn keeps the latest check-in for a step, and the note apart from
// it. It returns the status to send, or null when there is nothing new.
export function saveCheckIn(c: CheckIn, note?: string): StepStatus | null {
  saveJSON(CHECKINS_KEY, [...all().filter((x) => x.questionId !== c.questionId), c].slice(-KEEP))
  const words = note?.trim()
  if (words) save(NOTE_PREFIX + c.questionId, words)
  return statusFor(c)
}

export const noteFor = (questionId: string): string | null => load(NOTE_PREFIX + questionId)

// What a check-in adds to the anonymous What helped totals (api.ts
// reportHelped, when the person keeps that choice on): the outcome alone, in
// the totals' words. "It made things harder" counts as no help, never as
// help; a step kept for later says nothing yet.
export type HelpedOutcome = 'helped_lot' | 'helped_little' | 'no_change' | 'not_tried'
export function helpedReport(c: CheckIn): HelpedOutcome | null {
  if (c.tried === 'not_yet') return c.later ? null : 'not_tried'
  if (c.tried === 'decided_not') return 'not_tried'
  if (c.outcome === 'helped') return 'helped_lot'
  if (c.outcome === 'helped_little') return 'helped_little'
  return c.outcome ? 'no_change' : null
}

// tryAgain opens a step again from today, after "Would you like to try it
// again?": the old check-in goes, so the next one asks about this try. The
// note, in the person's own words, stays.
export function tryAgain(questionId: string, today: string): void {
  saveJSON(CHECKINS_KEY, all().filter((c) => c.questionId !== questionId))
  restartMove(questionId, today).catch(() => {
    // offline: sent again the next time the app opens
  })
}

// statusFor turns a check-in into the status the server already knows.
export function statusFor(c: CheckIn): StepStatus | null {
  if (c.tried === 'not_yet') return c.later ? null : 'not_tried'
  if (c.tried === 'decided_not') return 'not_tried'
  return c.outcome === 'helped' || c.outcome === 'helped_little' ? 'helped' : 'no_change'
}

const helpedBy = (m: Move, c: CheckIn | null) => (c ? c.outcome === 'helped' || c.outcome === 'helped_little' : m.status === 'helped')

// dueStep is the step to ask about on Today: the oldest open one from the
// past week, or one kept for later once its day comes.
export function dueStep(today: string, moves: Move[] = loadMoves(), checks: CheckIn[] = all()): Move | null {
  const from = addDays(today, -DUE_DAYS)
  return (
    moves
      .filter((m) => m.status === 'started')
      .map((m) => ({ m, later: checkInFor(m.questionId, checks)?.later }))
      .filter(({ m, later }) => (later ? later <= today && later >= from : m.date < today && m.date >= from))
      .sort((a, b) => (a.later ?? a.m.date).localeCompare(b.later ?? b.m.date))[0]?.m ?? null
  )
}

export const FEELS: Record<Feeling, string> = {
  lighter: 'you felt a little lighter',
  same: 'you felt about the same',
  unsettled: 'you felt more unsettled',
  unsure: 'you weren’t sure yet how you felt',
}

// outcomeLine says how a step went, in plain words, the ones that didn't help
// included.
export function outcomeLine(c: CheckIn | null, status: StepStatus): string {
  if (c?.tried === 'not_yet') return c.later ? 'Kept for later.' : 'You let it go for now.'
  if (c?.tried === 'decided_not') return 'You decided it wasn’t for you, and that’s fine.'
  if (c?.outcome === 'helped' || c?.outcome === 'helped_little') {
    const how = c.outcome === 'helped' ? 'it helped' : 'it helped a little'
    return c.feeling ? `You said ${how}, and ${FEELS[c.feeling]}.` : `You said ${how}.`
  }
  if (c?.outcome === 'no_difference') return 'You said it didn’t make a difference. That’s worth knowing too.'
  if (c?.outcome === 'harder') return 'You said it made things harder, so I won’t suggest it again without asking.'
  // Steps answered before the check-in existed, or not asked about yet.
  if (status === 'helped') return 'You said it helped.'
  if (status === 'no_change') return 'You said there was no change yet.'
  if (status === 'not_tried') return 'You didn’t get to it, and that’s fine.'
  return 'An idea you’re still exploring.'
}

// A step's words for quoting inside a sentence, without its closing full
// stop, even one inside a quotation of its own: “Ask one person for help”,
// you said…
export const stepWords = (step: string): string => step.trim().replace(/\.+(["”’']?)$/, '$1')

// A step's words as one key, so the same step from two cards is one step.
export const stepKey = (step: string): string => step.trim().toLowerCase()

// heldBack is every step someone said made things harder, by its words: it
// is not suggested to them again, whatever card it comes from, unless they
// choose it themselves.
export function heldBack(moves: Move[] = loadMoves(), checks: CheckIn[] = all()): Set<string> {
  const harder = new Set(checks.filter((c) => c.outcome === 'harder').map((c) => c.questionId))
  return new Set(moves.filter((m) => harder.has(m.questionId)).map((m) => stepKey(m.step)))
}

// The part of life a step belongs to, from the answer it came from; null
// when that answer is no longer kept here.
function areaOfMove(m: Move, h: History): ReflectionArea | null {
  const theme = h.answers.find((a) => a.questionId === m.questionId)?.theme ?? cardTextOf(m.questionId)?.theme
  return theme ? areaOf(theme) : null
}

export const LIFE_AREAS: ReflectionArea[] = ['work', 'school', 'family', 'culture', 'social', 'health', 'money', 'self']
export type AreaLine = { area: ReflectionArea; line: string | null }

function areaLine(m: Move, c: CheckIn | null): string {
  if (helpedBy(m, c)) return `“${stepWords(m.step)}” helped you.`
  if (m.status === 'started') return `Exploring “${stepWords(m.step)}”.`
  if (c?.outcome === 'harder') return `You tried “${stepWords(m.step)}”; it made things harder.`
  if (m.status === 'no_change') return `You tried “${stepWords(m.step)}”; it didn’t make a difference yet.`
  return `You thought about “${stepWords(m.step)}”, and let it be.`
}

// lifeAreas is each of the eight parts of life with what you've explored
// there lately, or null: nothing is guessed for a part you haven't touched.
export function lifeAreas(moves: Move[], h: History, written: Reflection[], today: string, checks: CheckIn[] = all()): AreaLine[] {
  const since = addDays(today, -RECENT_DAYS)
  return LIFE_AREAS.map((area) => {
    const m = moves.filter((x) => x.date >= since && areaOfMove(x, h) === area).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (m) return { area, line: areaLine(m, checkInFor(m.questionId, checks)) }
    return { area, line: written.some((r) => r.area === area && r.date >= since) ? 'You reflected on this recently.' : null }
  })
}

export type JourneyItem = { date: string; title: string; detail?: string }

// journeyHistory is what you chose, how it went and when you reflected,
// newest first. It names a reflection's part of life, never its words.
export function journeyHistory(moves: Move[], written: Reflection[], checks: CheckIn[] = all(), limit = 30): JourneyItem[] {
  const items: JourneyItem[] = []
  for (const m of moves) {
    items.push({ date: m.date, title: `You chose to try “${stepWords(m.step)}”` })
    const c = checkInFor(m.questionId, checks)
    if (c) items.push({ date: c.date, title: `How “${stepWords(m.step)}” went`, detail: outcomeLine(c, m.status) })
  }
  for (const r of written) items.push({ date: r.date, title: `You reflected on ${AREA_NAMES[r.area].toLowerCase()}` })
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

// revisitFor brings back a step that helped, when today's answers touch the
// same part of life.
export function revisitFor(today: string, h: History, moves: Move[] = loadMoves(), checks: CheckIn[] = all()): { move: Move; line: string } | null {
  const todays = new Set(h.answers.filter((a) => a.date === today && !a.heavy).map((a) => areaOf(a.theme)))
  if (todays.size === 0) return null
  const m = moves
    .filter((x) => x.date < today && helpedBy(x, checkInFor(x.questionId, checks)))
    .filter((x) => {
      const area = areaOfMove(x, h)
      return area !== null && todays.has(area)
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!m) return null
  const c = checkInFor(m.questionId, checks)
  const how = c?.outcome === 'helped_little' ? 'it helped a little' : 'it helped'
  const feel = c?.feeling === 'lighter' ? ' and you felt a little lighter' : ''
  return { move: m, line: `Last time you tried “${stepWords(m.step)}”, you said ${how}${feel}. Would you like to try it again?` }
}
