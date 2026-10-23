// The reads as the app and the public pages use them (Phase 3 of the review
// of 2026-10-15): one short read for each life area and each trait side.
// The words are checked by gate.ts; this file only finds and picks them.

import { THEMES, themeName } from '../themes'
import { TRAITS } from '../traits'
import { minutes } from './gate'
import shipped from './reads.json'
import type { Read } from './types'

export const READS = shipped as Read[]
export { minutes }

// Reads on intimacy stay in the app, behind its 18+ answer and "Keep it
// mild"; they get no public page.
export const appOnly = (r: Read) => r.kind === 'theme' && r.key === 'intimacy'

// Reads about heavy feelings end with the quiet helpline line.
const HEAVY = new Set(['theme:sadness-stress', 'trait:neuroticism.high', 'trait:rumination.high'])
export const heavy = (r: Read) => HEAVY.has(`${r.kind}:${r.key}`)

export const readBySlug = (slug: string) => READS.find((r) => r.slug === slug) ?? null
export const readFor = (kind: Read['kind'], key: string) => READS.find((r) => r.kind === kind && r.key === key) ?? null

// What a read is about, in the app's own words: "Money", or "Getting things
// done" for a trait side.
export function topicOf(r: Read): string {
  if (r.kind === 'theme') return themeName(r.key)
  return TRAITS[r.key.split('.')[0]]?.name ?? r.key
}

// related lists other reads on the same life area's group, or the other side
// of the same trait first.
export function related(r: Read, n = 3, from: Read[] = READS): Read[] {
  const score = (o: Read) => {
    if (o.kind === 'trait' && r.kind === 'trait') return o.key.split('.')[0] === r.key.split('.')[0] ? 0 : 2
    if (o.kind === 'theme' && r.kind === 'theme') return THEMES[o.key]?.area === THEMES[r.key]?.area ? 1 : 3
    return 4
  }
  return from
    .filter((o) => o.slug !== r.slug)
    .map((o, i) => ({ o, s: score(o) * 100 + ((i * 7 + r.slug.length) % 97) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, n)
    .map((x) => x.o)
}

// todaysRead picks one read for the day: about one of today's life areas
// first, then any other, never one already opened, and never intimacy
// unless the person has those questions on. The same day gives the same read.
export function todaysRead(date: string, themes: string[], opened: (slug: string) => boolean, intimacy: boolean): Read | null {
  const allowed = READS.filter((r) => !opened(r.slug) && (intimacy || r.key !== 'intimacy'))
  if (allowed.length === 0) return null
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400_000)
  const first = allowed.filter((r) => r.kind === 'theme' && themes.includes(r.key))
  const pool = first.length > 0 ? first : allowed
  return pool[((day % pool.length) + pool.length) % pool.length]
}
