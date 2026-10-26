// What an answer reaches for: the seven needs of the proposal of 2026-10-24
// ("What you're reaching for") and docs/writing-guide.md. Every option in the
// bank carries one (backend/needs.go); this is where the app names them in
// everyday words. backend TestNeedsMatchTheFrontend keeps the ids in step.
//
// A need is shown, never scored. It appears as one soft line on a card, as
// the evening's question about whether the morning's route usually gets the
// person there, and in the weekly mirror once it is a pattern.

export const NEEDS = ['freedom', 'belonging', 'respect', 'competence', 'security', 'calm', 'understood'] as const
export type Need = (typeof NEEDS)[number]

export const isNeed = (v: unknown): v is Need => typeof v === 'string' && (NEEDS as readonly string[]).includes(v)

// The names the mirror uses as headings.
export const NEED_NAMES: Record<Need, string> = {
  freedom: 'Choosing for yourself',
  belonging: 'Being close to people',
  respect: 'Being respected',
  competence: 'Doing well',
  security: 'Feeling safe, having enough',
  calm: 'Feeling settled',
  understood: 'Being understood',
}

// The same needs as they read inside a sentence.
export const NEED_PHRASES: Record<Need, string> = {
  freedom: 'choosing for yourself',
  belonging: 'being close to people',
  respect: 'being respected',
  competence: 'doing well',
  security: 'feeling safe',
  calm: 'feeling settled',
  understood: 'being understood',
}

// The one soft line on a card, after the reading.
export const reachingLine = (n: Need) => `Sounds like ${NEED_PHRASES[n]} mattered most here.`

