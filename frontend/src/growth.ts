// Your Growth (Insights Release 3, 2026-10-26): "Earlier / More recent"
// pairs from the person's own record, side by side, with nothing said about
// what changed. For each part of life (reflect.ts' areas), the earliest and
// the latest entry at least two weeks apart: answers, with the question and
// the answer chosen (their card text, kept on this phone for 30 days), and
// reflections, in their own words, only if they chose to include them in
// Reflect. Private (intimacy) and heavy answers are left out. Worked out on
// this phone; nothing is sent. No pair is made up: without two real entries
// far enough apart there is nothing to show, and the page says so.

import { cardTextOf, type CardText } from './insights'
import type { Reflection, ReflectionArea } from './notebook'
import type { History } from './profile'
import { areaOf } from './reflect'
import { daysBetween } from './storage'

export const GROWTH_GAP_DAYS = 14
const GROWTH_MAX = 3

export type GrowthSide = { date: string; asked: string; words: string }
export type GrowthPair = { area: ReflectionArea; kind: 'answers' | 'reflections'; earlier: GrowthSide; recent: GrowthSide }

export function growthPairs(
  h: History,
  reflections: Reflection[],
  today: string,
  textOf: (questionId: string) => CardText | null = cardTextOf,
  include: { reflections?: boolean } = {},
): GrowthPair[] {
  const fromAnswers = h.answers.flatMap((a) => {
    if (a.theme === 'intimacy' || a.heavy || daysBetween(a.date, today) < 0) return []
    const t = textOf(a.questionId)
    return t && !t.heavy ? [{ area: areaOf(a.theme), side: { date: a.date, asked: t.prompt, words: t.label } }] : []
  })
  const fromReflections = include.reflections
    ? reflections.filter((r) => r.answer.trim()).map((r) => ({ area: r.area, side: { date: r.date, asked: r.question, words: r.answer.trim() } }))
    : []
  const pairs = [...pairsOf(fromAnswers, 'answers'), ...pairsOf(fromReflections, 'reflections')]
  return pairs.sort((x, y) => y.recent.date.localeCompare(x.recent.date)).slice(0, GROWTH_MAX)
}

function pairsOf(entries: { area: ReflectionArea; side: GrowthSide }[], kind: GrowthPair['kind']): GrowthPair[] {
  const byArea = new Map<ReflectionArea, GrowthSide[]>()
  for (const e of entries) byArea.set(e.area, [...(byArea.get(e.area) ?? []), e.side])
  return [...byArea].flatMap(([area, sides]) => {
    const sorted = [...sides].sort((x, y) => x.date.localeCompare(y.date))
    const earlier = sorted[0]
    const recent = sorted[sorted.length - 1]
    return daysBetween(earlier.date, recent.date) >= GROWTH_GAP_DAYS ? [{ area, kind, earlier, recent }] : []
  })
}
