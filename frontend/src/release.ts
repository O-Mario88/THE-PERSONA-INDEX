// The first release (Edwin, 2026-10-29; docs/first-release.md): what it holds
// back, without deleting anything. Social feeds and the fuller Circle (closer
// together, common ground, the circle's shared insights, support and
// celebrate, walking alongside one person) wait, and Patron is offered as one
// paid tier, with prepaid passes on the website. The server keeps every plan,
// so Duo and the Founding place can come back without a migration.
import type { PatronPlan } from './patron'

export const FIRST_RELEASE = true

const HELD_BACK = { walkAlongside: FIRST_RELEASE, circleExtras: FIRST_RELEASE } as const
export type Held = keyof typeof HELD_BACK

export const shows = (feature: Held): boolean => !HELD_BACK[feature]

// The plans the Patron page offers: one tier, and prepaid passes where other
// ways to pay are allowed (the website; a phone app must use its store).
export function plansOffered(web: boolean): PatronPlan[] {
  const tier: PatronPlan[] = ['monthly', 'yearly']
  const more: PatronPlan[] = FIRST_RELEASE ? [] : ['duo_monthly', 'duo_yearly', 'founding']
  return [...tier, ...more, ...(web ? (['pass_90', 'pass_365'] as PatronPlan[]) : [])]
}
