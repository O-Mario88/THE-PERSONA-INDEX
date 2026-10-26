// Patterns (Insights Release 3, 2026-10-26). The evidence levels Insights
// gives a need, from the person's own answers of the last 30 days: a thought,
// something they've been noticing (three answers on two days or more), or a
// pattern worth exploring (and a week or more between the first and last).
// The month, quarter and year Mirrors ask about each with "Does this still
// feel true?": Yes and Partly keep it; No retires it, everywhere, and only
// answers given after that can build it again. Kept on this phone, in the
// backup; nothing is sent.

import { NEEDS, type Need } from './needs'
import { loadHistory, type History } from './profile'
import { daysBetween, loadJSON, saveJSON } from './storage'

export type Evidence = 'thought' | 'noticing' | 'pattern'
export type PatternCheck = 'yes' | 'partly' | 'no'
export type Pattern = { need: Need; evidence: Exclude<Evidence, 'thought'>; answers: number; days: number; since: string }

const EVIDENCE_DAYS = 30 // the window Insights reads, the same as its cards
const NOTICING_ANSWERS = 3 // the same need across several answers…
const NOTICING_DAYS = 2 // …on more than one day
const PATTERN_SPAN = 7 // and, to be a pattern, at least a week apart
const PREFIX = 'pi.pattern.'
const CHECKS: PatternCheck[] = ['yes', 'partly', 'no']

export function patternCheckOf(need: Need): { check: PatternCheck; date: string } | null {
  const v = loadJSON(PREFIX + need) as { check?: unknown; date?: unknown } | null
  return v && CHECKS.includes(v.check as PatternCheck) && typeof v.date === 'string' ? { check: v.check as PatternCheck, date: v.date } : null
}

export function checkPattern(need: Need, check: PatternCheck, today: string) {
  saveJSON(PREFIX + need, { check, date: today })
}

// The answers behind a need, and how sure that can be. After a No, only
// answers dated after it count.
export function evidenceDetail(h: History, need: Need, today: string): Omit<Pattern, 'need' | 'evidence'> & { evidence: Evidence } {
  const checked = patternCheckOf(need)
  const retired = checked?.check === 'no' ? checked.date : null
  const recent = h.answers.filter(
    (a) =>
      a.need === need &&
      a.theme !== 'intimacy' &&
      !a.heavy &&
      daysBetween(a.date, today) < EVIDENCE_DAYS &&
      daysBetween(a.date, today) >= 0 &&
      (!retired || a.date > retired),
  )
  const days = [...new Set(recent.map((a) => a.date))].sort()
  const counts = { answers: recent.length, days: days.length, since: days[0] ?? '' }
  // "Not me" on any of them: the person has said this is not a pattern.
  if (recent.some((a) => a.verdict === 'not_me')) return { ...counts, evidence: 'thought' }
  if (recent.length < NOTICING_ANSWERS || days.length < NOTICING_DAYS) return { ...counts, evidence: 'thought' }
  return { ...counts, evidence: daysBetween(days[0], days[days.length - 1]) >= PATTERN_SPAN ? 'pattern' : 'noticing' }
}

export const evidenceFor = (h: History, need: Need, today: string): Evidence => evidenceDetail(h, need, today).evidence

export const hasPatterns = (today: string) => patternsFor(loadHistory(), today).length > 0

// The needs to ask about in the longer Mirrors: patterns first, then what
// the person has been noticing.
export function patternsFor(h: History, today: string): Pattern[] {
  const out = NEEDS.flatMap((need) => {
    const d = evidenceDetail(h, need, today)
    return d.evidence === 'thought' ? [] : [{ need, ...d, evidence: d.evidence }]
  })
  return out.sort((a, b) => (a.evidence === b.evidence ? 0 : a.evidence === 'pattern' ? -1 : 1))
}
