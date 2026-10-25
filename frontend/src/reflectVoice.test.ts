import { describe, expect, it } from 'vitest'
import { reminderFor } from './journal'
import { thoughtsFor, type ThoughtInput } from './thoughts'
import { voiceProblems } from './voice'

// The words Reflect says on its own follow the voice rules (voice.ts): no
// comparisons, no promises, no forced cheer, no labels, UK English.
const base: ThoughtInput = { period: 'day', today: '2026-10-25', answered: [], kept: [], traits: null, outside: null, past: [], due: [] }

describe('Reflect keeps the voice', () => {
  it('in every question, lead and reason it makes up', () => {
    const lines = (['day', 'week', 'month'] as const).flatMap((period) => thoughtsFor({ ...base, period }).flatMap((t) => [t.question, t.lead, t.why]))
    for (let d = 0; d < 5; d++) lines.push(reminderFor(`2026-10-2${d}`))
    for (const l of lines) expect(voiceProblems(l), l).toEqual([])
  })
})
