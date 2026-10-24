// The Human Pulse (Stage 5 proposal, 2026-10-24): the anonymous totals the
// server already counts for every question (GET /api/questions/{id}/results),
// shown quietly, only to a person who said yes to seeing them.
//
// The rules: every number is the server's count, never an estimate. Under
// PULSE_MIN answers no split is shown, since with a handful of answers a
// person could work out what someone else chose. Intimacy questions have no
// split (the server keeps no option for them) and regional ones are never
// sent. "+N in the last minute" is the difference between two counts this
// phone actually fetched about a minute apart, and nothing when it has not
// fetched twice.

import type { Question } from './api'
import { load, save } from './storage'

export const PULSE_MIN = 20

export type PulseOption = { optionId: string; count: number; percent: number }
export type Pulse = { questionId: string; total: number; options: PulseOption[] }

export async function getPulse(questionId: string): Promise<Pulse | null> {
  try {
    const res = await fetch(`/api/questions/${encodeURIComponent(questionId)}/results`)
    if (!res.ok) return null
    const b = (await res.json()) as { questionId: string; totalVotes: number; options: PulseOption[] }
    if (typeof b?.totalVotes !== 'number' || !Array.isArray(b.options)) return null
    return { questionId: b.questionId, total: b.totalVotes, options: b.options }
  } catch {
    return null
  }
}

// hasPulse says whether a question can have a pulse at all.
export const hasPulse = (q: Question) => q.care !== 'intimate' && !q.local

// showsSplit says whether a pulse has enough answers for its split.
export const showsSplit = (p: Pulse) => p.total >= PULSE_MIN

// shareOf is the percent of answers that chose the same option, or null.
export function shareOf(p: Pulse, optionId: string): number | null {
  if (!showsSplit(p)) return null
  const o = p.options.find((x) => x.optionId === optionId)
  return o ? o.percent : null
}

// sameAs says how many chose the same as you, in words a person would use.
export function sameAs(percent: number): string {
  const p = Math.round(percent)
  if (p >= 70) return 'Most people made the same choice you did.'
  if (p >= 55) return 'More than half made the same choice you did.'
  if (p >= 45) return 'About half made the same choice you did.'
  if (p >= 30) return 'About one in three made the same choice you did.'
  if (p >= 22) return 'About one in four made the same choice you did.'
  if (p >= 17) return 'About one in five made the same choice you did.'
  if (p >= 8) return 'About one in ten made the same choice you did.'
  return 'Few people made the same choice you did. That is allowed.'
}

export const count = (n: number) => n.toLocaleString('en-GB')

// The last count this phone fetched for a question, to tell the change.
type Seen = { n: number; t: number }
const seenKey = (questionId: string) => `pi.pulse.${questionId}`

// noteCount keeps the newest count and says how much it grew since the one
// before, when that was fetched 45 to 120 seconds earlier.
export function noteCount(questionId: string, n: number, now = Date.now()): number | null {
  let before: Seen | null = null
  try {
    before = JSON.parse(load(seenKey(questionId)) ?? 'null')
  } catch {
    before = null
  }
  save(seenKey(questionId), JSON.stringify({ n, t: now }))
  if (!before || typeof before.n !== 'number' || typeof before.t !== 'number') return null
  const gap = now - before.t
  if (gap < 45_000 || gap > 120_000 || n < before.n) return null
  return n - before.n
}
