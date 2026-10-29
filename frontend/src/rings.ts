import { loadJSON, saveJSON } from './storage'

// Circles are about permission, not popularity (Edwin, 2026-10-29). Everyone
// the person is connected with is a Connection; the people they choose as
// their closest are the Inner Circle. No numbered levels. Kept on this phone
// only (and sealed in the backup): nobody, the server included, ever learns
// who is in someone's Inner Circle. Adding someone shows them nothing shared
// before; removing them ends their access to what was shared with the Inner
// Circle (connections.ts).

export const CONNECTION = 'Connection'
export const INNER_CIRCLE = 'Inner Circle'

// What each can see, in plain words, for You and for Connect.
export const CIRCLE_ACCESS: { who: string; sees: string }[] = [
  { who: CONNECTION, sees: 'Your name and anything you deliberately send them.' },
  { who: INNER_CIRCLE, sees: 'Items you choose to share with your Inner Circle, and invitations to reflect together.' },
  { who: 'Selected person', sees: 'A particular answer, reflection or Mirror you choose to share with them directly.' },
]

const KEY = 'pi.rings'

// The Inner Circle, by account id. An older phone kept three circles; only
// "inner" carries over.
export function innerCircle(): string[] {
  const raw = loadJSON(KEY)
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, r]) => r === 'inner')
    .map(([id]) => id)
}

export const isInner = (friendId: string): boolean => innerCircle().includes(friendId)

export function setInner(friendId: string, on: boolean): string[] {
  const ids = innerCircle().filter((id) => id !== friendId)
  const next = on ? [...ids, friendId] : ids
  saveJSON(KEY, Object.fromEntries(next.map((id) => [id, 'inner'])))
  return next
}
