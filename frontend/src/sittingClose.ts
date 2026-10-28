// The close of a sitting as one reflection (Edwin's brief, 2026-10-28: "one
// thoughtful conversation, not three independent personality tests"). The
// questions are answered one at a time with only their reading in between;
// what to try waits for the close, where one step is offered from the
// sitting's own answers instead of one under every card.

import type { Question } from './api'
import { heldBack, stepKey } from './growthJourney'
import { loadMoves, type Move } from './moves'
import type { Need } from './needs'

export type SittingPick = { question: Question; optionId: string }
export type CloseStep = { kind: 'offer'; questionId: string; optionId: string; step: string; local: boolean } | { kind: 'trying'; move: Move }

// The need that ran through a sitting: the one at least two answers reached for.
function sittingNeed(picks: SittingPick[]): Need | null {
  const counts = new Map<Need, number>()
  for (const p of picks) {
    const need = p.question.options.find((o) => o.id === p.optionId)?.need
    if (need) counts.set(need, (counts.get(need) ?? 0) + 1)
  }
  const [top] = [...counts].sort((a, b) => b[1] - a[1])
  return top && top[1] >= 2 ? top[0] : null
}

// stepToTry is the one thing worth trying after a sitting: the step already
// chosen from it, else the step from what ran through the sitting, else the
// first answer's. Never a step from a heavy answer, and never one the person
// said made things harder.
export function stepToTry(picks: SittingPick[], moves: Move[] = loadMoves(), held: Set<string> = heldBack(moves)): CloseStep | null {
  const ids = new Set(picks.map((p) => p.question.id))
  const trying = moves.find((m) => ids.has(m.questionId))
  if (trying) return { kind: 'trying', move: trying }
  const offers = picks.flatMap(({ question, optionId }) => {
    const option = question.options.find((o) => o.id === optionId)
    const step = option && !option.heavy ? option.insight?.step : undefined
    return option && step && !held.has(stepKey(step)) ? [{ question, option, step }] : []
  })
  const need = sittingNeed(picks)
  const best = offers.find((x) => need && x.option.need === need) ?? offers[0]
  if (!best) return null
  return { kind: 'offer', questionId: best.question.id, optionId: best.option.id, step: best.step, local: !!best.question.local }
}
