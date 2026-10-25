import { loadJSON, saveJSON } from './storage'

// The three circles (Edwin, 2026-10-25): inner, the people you would trust
// with a secret; middle, close but not that close; outer, friends out there.
// The person places each friend. Kept on this phone only (and sealed in the
// backup): nobody, the server included, ever learns which circle they are in.

export type Ring = 'inner' | 'middle' | 'outer'
export const RINGS: Ring[] = ['inner', 'middle', 'outer']

export const RING_NAMES: Record<Ring, string> = { inner: 'Inner circle', middle: 'Close', outer: 'Wider circle' }
export const RING_NOTES: Record<Ring, string> = {
  inner: 'People you would trust with a secret',
  middle: 'Close, but not that close',
  outer: 'Friends out there',
}

const KEY = 'pi.rings'

export type Rings = Record<string, Ring>

export function loadRings(): Rings {
  const raw = loadJSON(KEY)
  if (!raw || typeof raw !== 'object') return {}
  const out: Rings = {}
  for (const [id, r] of Object.entries(raw as Record<string, unknown>)) if (RINGS.includes(r as Ring)) out[id] = r as Ring
  return out
}

export const ringOf = (rings: Rings, friendId: string): Ring => rings[friendId] ?? 'outer'

export function placeIn(friendId: string, ring: Ring): Rings {
  const next = { ...loadRings(), [friendId]: ring }
  saveJSON(KEY, next)
  return next
}
