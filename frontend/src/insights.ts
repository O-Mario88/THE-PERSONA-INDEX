// Insights (Edwin, 2026-10-25): understand yourself, discover you're not
// alone, find what helps. Everything here is worked out on this phone from
// the person's own answers. The only thing fetched is the counts for You're
// not alone, which are the same for everyone (GET /api/not-alone), so asking
// for them says nothing about which questions this phone answered.
//
// The rules: no percentages and no scores; an evidence level is a label, not
// a rank; a card the person says is not them stops counting towards a
// pattern; heavy answers get people, not a step; intimate answers stay out.

import type { Question } from './api'
import type { Need } from './needs'
import { evidenceFor, type Evidence } from './patterns'
import type { History } from './profile'
import { dayMonth } from './reflect'
import { daysBetween, keys, loadJSON, remove, saveJSON } from './storage'

// The card an answer showed, kept for 30 days so Insights can show it again
// once the day's questions are gone from this phone.
export type CardText = {
  date: string
  questionId: string
  theme?: string
  prompt: string
  label: string
  need?: Need
  heavy?: true
  reveal?: string
  otherSide?: string
  step?: string
}

export const CARD_PREFIX = 'pi.insight.'
export const CARD_DAYS = 30

// cardFrom is the card a question's option showed, or null for an intimate
// question (which never appears in Insights).
function cardFrom(q: Question, optionId: string, date: string): CardText | null {
  if (q.care === 'intimate') return null
  const o = q.options.find((x) => x.id === optionId)
  if (!o) return null
  const insight = o.heavy ? undefined : o.insight
  return {
    date,
    questionId: q.id,
    ...(q.theme ? { theme: q.theme } : {}),
    prompt: q.prompt,
    label: o.label,
    ...(o.need ? { need: o.need } : {}),
    ...(o.heavy ? { heavy: true as const } : {}),
    ...(insight?.reveal ? { reveal: insight.reveal } : {}),
    ...(insight?.otherSide ? { otherSide: insight.otherSide } : {}),
    ...(insight?.step ? { step: insight.step } : {}),
  }
}

export function keepCardText(q: Question, optionId: string, date: string) {
  const text = cardFrom(q, optionId, date)
  if (text) saveJSON(CARD_PREFIX + q.id, text)
}

export function cardTextOf(questionId: string): CardText | null {
  const t = loadJSON(CARD_PREFIX + questionId) as CardText | null
  return t && typeof t.date === 'string' && typeof t.prompt === 'string' ? t : null
}

export function pruneCardTexts(today: string) {
  for (const k of keys()) {
    if (!k.startsWith(CARD_PREFIX)) continue
    const t = loadJSON(k) as CardText | null
    if (!t || typeof t.date !== 'string' || daysBetween(t.date, today) >= CARD_DAYS) remove(k)
  }
}

// How sure a card can be, from the person's own answers in the last 30 days
// (patterns.ts, where the longer Mirrors can retire a pattern).
export { evidenceFor, type Evidence }

export function evidenceLabel(e: Evidence, date: string, today: string): string {
  if (e === 'pattern') return 'A pattern worth exploring'
  if (e === 'noticing') return 'Something you’ve been noticing'
  return date === today ? 'A thought from today' : `A thought from ${dayMonth(date)}`
}

export type ForYouCard = CardText & { optionId: string; evidence: Evidence; verdict?: History['answers'][number]['verdict']; regional?: true }

// forYou is the person's own answers from the last `days`, newest first,
// each with its card and how sure it can be. A card they said is not them
// is left out, and so is an answer whose card was not kept (today's
// questions stand in for one given before cards were kept).
export function forYou(h: History, today: string, days: number, questions: Question[] = []): ForYouCard[] {
  const out: ForYouCard[] = []
  for (const a of h.answers) {
    if (!a.optionId || a.verdict === 'not_me' || a.theme === 'intimacy') continue
    const age = daysBetween(a.date, today)
    if (age < 0 || age >= days) continue
    const q = questions.find((x) => x.id === a.questionId)
    const text = cardTextOf(a.questionId) ?? (q ? cardFrom(q, a.optionId, a.date) : null)
    if (!text) continue
    const need = text.need ?? a.need
    out.push({
      ...text,
      optionId: a.optionId,
      evidence: need && !text.heavy ? evidenceFor(h, need, today) : 'thought',
      ...(a.verdict ? { verdict: a.verdict } : {}),
      ...(a.regional ? { regional: true as const } : {}),
    })
  }
  return out.sort((x, y) => y.date.localeCompare(x.date))
}

// You're not alone: the server's counts (backend/notalone.go).
export type NotAloneOption = { optionId: string; count: number; few?: boolean }
export type NotAloneQuestion = { questionId: string; total: number; options: NotAloneOption[] }
export type NotAloneLine = { kind: 'count'; same: number; total: number } | { kind: 'few' } | { kind: 'forming' }

export function notAloneFor(counts: NotAloneQuestion[] | null, questionId: string, optionId: string): NotAloneLine | null {
  if (!counts) return null
  const q = counts.find((x) => x.questionId === questionId)
  const o = q?.options.find((x) => x.optionId === optionId)
  if (!q || !o) return { kind: 'forming' }
  return o.few ? { kind: 'few' } : { kind: 'count', same: o.count, total: q.total }
}

export async function getNotAlone(date: string): Promise<NotAloneQuestion[] | null> {
  try {
    const res = await fetch(`/api/not-alone?date=${encodeURIComponent(date)}`)
    if (!res.ok) return null
    const b = (await res.json()) as { questions?: NotAloneQuestion[] }
    return Array.isArray(b?.questions) ? b.questions : null
  } catch {
    return null
  }
}
