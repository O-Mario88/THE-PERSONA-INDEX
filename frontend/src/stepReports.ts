// What Helped (Insights Release 2, 2026-10-26). After someone saves
// "Something you could try" from an Insights card, they may say how it went,
// from the next day: tried and it helped a lot, helped a little, no change,
// or didn't try. Only if they want to. The report goes to the server under a
// key of its own (backend/whathelped.go), never with the person's words, and
// the totals come back the same for everyone, counts only, once 50 people
// have reported on a step, with any outcome under 10 folded into "a few".
// Those who report back chose to, so the app says so wherever it shows them.

import { reportStep } from './api'
import { intentions } from './notebook'
import { loadHistory } from './profile'
import { addDays, load, save } from './storage'

export type HelpedOutcome = 'helped_lot' | 'helped_little' | 'no_change' | 'not_tried'

export const HELPED_CHOICES: { outcome: HelpedOutcome; label: string }[] = [
  { outcome: 'helped_lot', label: 'Tried it: helped a lot' },
  { outcome: 'helped_little', label: 'Tried it: helped a little' },
  { outcome: 'no_change', label: 'Tried it: no change' },
  { outcome: 'not_tried', label: 'Didn’t try it' },
]

const OUTCOMES = HELPED_CHOICES.map((c) => c.outcome)

export type HelpedCount = { outcome: HelpedOutcome; count: number; few?: boolean }
export type WhatHelpedStep = { questionId: string; optionId: string; total: number; outcomes: HelpedCount[] }

// A step this phone saved from Insights, and the answer whose card offered it.
export type SavedStep = { questionId: string; optionId: string; text: string; saved: string }

// The Insights card's "Save as an intention" keeps it under this id prefix.
const FROM_INSIGHTS = 'insight-'
const REPORTED = 'pi.helped.'
// The server keeps a phone's answers for 35 days and takes a report only for
// an answer it still has, so a step is asked about for 30 days after saving.
const ASK_DAYS = 30

// The steps to ask about today: saved from Insights before today (a day to
// try it) and within ASK_DAYS, whose answer is still on the phone, newest first.
export function stepsToAsk(today: string): SavedStep[] {
  const answers = loadHistory().answers
  const since = addDays(today, -ASK_DAYS)
  return intentions().flatMap((i) => {
    if (!i.id.startsWith(FROM_INSIGHTS) || i.date >= today || i.date < since) return []
    const answer = answers.find((a) => a.questionId === i.from)
    return answer?.optionId ? [{ questionId: i.from, optionId: answer.optionId, text: i.text, saved: i.date }] : []
  })
}

// What this phone told the server about a step, once the server had it.
export function reportedOutcome(questionId: string, optionId: string): HelpedOutcome | null {
  const v = load(`${REPORTED}${questionId}.${optionId}`)
  return OUTCOMES.includes(v as HelpedOutcome) ? (v as HelpedOutcome) : null
}

export function rememberReport(questionId: string, optionId: string, outcome: HelpedOutcome) {
  save(`${REPORTED}${questionId}.${optionId}`, outcome)
}

// Sends a report and remembers it once the server has it. False when it
// did not go through: then nothing is remembered, and nothing was counted.
export async function sendReport(step: SavedStep, outcome: HelpedOutcome, today: string): Promise<boolean> {
  try {
    await reportStep(step.questionId, step.optionId, outcome, today)
  } catch {
    return false
  }
  rememberReport(step.questionId, step.optionId, outcome)
  return true
}

// The totals, the same for everyone: only steps with enough reports are in
// it. Null when they cannot be reached.
export async function getWhatHelped(): Promise<WhatHelpedStep[] | null> {
  try {
    const res = await fetch('/api/what-helped')
    if (!res.ok) return null
    const b = (await res.json()) as { steps?: WhatHelpedStep[] }
    return Array.isArray(b?.steps) ? b.steps : null
  } catch {
    return null
  }
}

// The totals in plain words. Counts only, never a percentage; "a few" where
// the server folded a small group; a real zero is simply not mentioned.
// Those who didn't try are told apart from those who did.
export function helpedLines(step: WhatHelpedStep): { tried: string | null; notTried: string | null } {
  const of = (o: HelpedOutcome) => step.outcomes.find((c) => c.outcome === o)
  const amount = (c: HelpedCount | undefined) => (c?.few ? 'a few' : c && c.count > 0 ? String(c.count) : null)
  const parts = [
    [amount(of('helped_lot')), 'said it helped a lot'],
    [amount(of('helped_little')), 'said it helped a little'],
    [amount(of('no_change')), 'saw no change'],
  ].flatMap(([n, words]) => (n ? [`${n} ${words}`] : []))
  const tried = parts.length ? `Of those who tried this and reported back, ${joinWords(parts)}.` : null

  const n = amount(of('not_tried'))
  let notTried: string | null = null
  if (n && tried) notTried = `${n === 'a few' ? 'A few' : n} more said they didn’t get to try it.`
  else if (n) notTried = `${n === 'a few' ? 'A few' : n} who reported back said they didn’t get to try it.`
  return { tried, notTried }
}

function joinWords(parts: string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
