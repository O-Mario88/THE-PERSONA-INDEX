// The first glimpse's shared need (Edwin, 2026-10-26): the need two or more
// of a person's first answers reached for, if one did.
import type { Need } from './needs'
import type { AnswerRecord } from './profile'

const MIN_SHARED_NEED = 2

export function sharedNeed(answers: AnswerRecord[]): Need | null {
  const counts = new Map<Need, number>()
  for (const a of answers) if (a.need) counts.set(a.need, (counts.get(a.need) ?? 0) + 1)
  let best: Need | null = null
  for (const [need, n] of counts) if (n >= MIN_SHARED_NEED && (!best || n > (counts.get(best) ?? 0))) best = need
  return best
}
