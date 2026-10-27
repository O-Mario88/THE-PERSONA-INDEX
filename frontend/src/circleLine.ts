import type { OutsideMirror } from './social'
import { sideOf, TRAITS } from './traits'

// One perspective from the Circle in the story Mirrors (Edwin's Mirrors,
// 2026-10-26). The Outside Mirror opens at three friends; a line here waits
// for CIRCLE_LINE_MIN, so a single friend's view can never be picked out by
// someone who knows who answered. Only where the circle and the person's own
// answers meet; never who said it.
export const CIRCLE_LINE_MIN = 5

export function circleLine(o: OutsideMirror | null, own: { trait: string; score: number }[]): string | null {
  if (!o || !o.open || o.friends < CIRCLE_LINE_MIN) return null
  const mine = new Map(own.map((t) => [t.trait, t.score]))
  const shared = o.traits
    .filter((t) => TRAITS[t.trait] && mine.has(t.trait))
    .map((t) => ({ t, gap: Math.abs(t.position - (mine.get(t.trait) ?? 50)) }))
    .sort((a, b) => a.gap - b.gap)[0]
  if (!shared || shared.gap >= 15) return null
  return `Blended from ${o.friends} friends: your circle also sees you near ${sideOf(TRAITS[shared.t.trait], shared.t.position >= 50).lean}.`
}
