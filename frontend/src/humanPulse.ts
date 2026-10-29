// One Human Pulse for every page (Edwin, 2026-10-28: "Pulse everywhere, but
// never everywhere at once"). Today, Insights, Connect and the Mirrors all
// read the same counts from here and word them the same way, so a number
// never differs between pages.
//
// The counts come from GET /api/not-alone: the same for everyone, sent with
// no device pass, only for questions with at least 20 answers, intimate
// questions left out and answers a few people chose folded into "a few".
// This phone picks out its own answers. Heavy and regional answers are never
// used. Words are precise: people who chose the same answer, not people who
// feel the same.

import { count } from './pulse'
import { getNotAlone, notAloneFor, type NotAloneLine, type NotAloneQuestion } from './insights'
import type { OthersStep } from './mirrorStory'
import type { History } from './profile'
import { loadJSON, saveJSON } from './storage'

export const PULSE_CACHE = 'pi.pulse.notalone'

export type PulseCounts = { questions: NotAloneQuestion[]; stale: boolean }

// loadPulse fetches the counts, keeping the last ones this phone got for when
// it is offline (marked stale, so a page can say they may be out of date).
export async function loadPulse(date: string): Promise<PulseCounts | null> {
  const fresh = await getNotAlone(date)
  if (fresh) {
    saveJSON(PULSE_CACHE, { date, questions: fresh })
    return { questions: fresh, stale: false }
  }
  const kept = loadJSON(PULSE_CACHE) as { date: string; questions: NotAloneQuestion[] } | null
  return kept && Array.isArray(kept.questions) ? { questions: kept.questions, stale: true } : null
}

// pulseWords is the one sentence every page uses, or null when there is
// nothing honest to say yet.
export function pulseWords(line: NotAloneLine): string | null {
  if (line.kind === 'count') return `${count(line.same)} of ${count(line.total)} people chose the same answer as you.`
  if (line.kind === 'few') return 'A few others chose this answer too.'
  return null
}

// The short form, beside any item built from one of your answers (Edwin,
// 2026-10-29: every item you can relate to others carries the Pulse). The
// templates are looked up whole, so another language can order them its own
// way; `t` is the app's translator (i18n trf), plain filling by default.
export const PULSE_COUNT = '{same} of {total} chose the same'
export const PULSE_FEW = 'A few others chose this too'
export const STEP_HELPED = 'Of the {total} who tried this and reported back, {helped} said it helped'
export const STEP_REPORTED = '{total} reported back on this step'

type Translate = (template: string, vars?: Record<string, string | number>) => string
const fill: Translate = (template, vars = {}) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`))

export function pulseShort(line: NotAloneLine | null, t: Translate = fill): string | null {
  if (line?.kind === 'count') return t(PULSE_COUNT, { same: count(line.same), total: count(line.total) })
  if (line?.kind === 'few') return t(PULSE_FEW)
  return null
}

// answerPulse is the short line for one of your answers, or null while its
// counts are still forming (fewer than 20 answers) or the Pulse is off.
export function answerPulse(counts: NotAloneQuestion[] | null, questionId: string, optionId: string | undefined, t: Translate = fill): string | null {
  if (!counts || !optionId) return null
  return pulseShort(notAloneFor(counts, questionId, optionId), t)
}

// stepPulse is what the people who tried the step an answer offered found,
// from the anonymous What helped totals, or null. Counts only, never
// percentages, and a folded few is never added in.
export function stepPulse(steps: OthersStep[] | null, questionId: string, optionId: string | undefined, t: Translate = fill): string | null {
  const s = steps?.find((x) => x.questionId === questionId && x.optionId === optionId)
  if (!s || !optionId) return null
  const counted = (o: OthersStep['outcomes'][number]['outcome']) => {
    const c = s.outcomes.find((x) => x.outcome === o)
    return c && !c.few ? c.count : 0
  }
  const helped = counted('helped_lot') + counted('helped_little')
  return helped > 0 ? t(STEP_HELPED, { total: count(s.total), helped: count(helped) }) : t(STEP_REPORTED, { total: count(s.total) })
}

export type SharedMoment = { questionId: string; optionId: string; date: string; theme: string; line: NotAloneLine }

// sharedMoments is each of your own answers that has counts, newest first.
export function sharedMoments(counts: NotAloneQuestion[], h: History): SharedMoment[] {
  return [...h.answers]
    .filter((a) => a.optionId && !a.heavy && !a.regional)
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((a) => {
      const line = notAloneFor(counts, a.questionId, a.optionId!)
      return line && line.kind !== 'forming' ? [{ questionId: a.questionId, optionId: a.optionId!, date: a.date, theme: a.theme, line }] : []
    })
}
