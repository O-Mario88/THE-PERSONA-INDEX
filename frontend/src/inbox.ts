// "Shared with you" (Edwin, 2026-10-29): a small inbox, not a feed. What
// friends chose to share with this person, and the replies to what this
// person shared, each grouped under its item. What has been seen is kept on
// this phone only, so the page can end with "You're caught up".
import type { RTItem, SentShareView, ShareView, SharesView } from './social'
import { loadJSON, saveJSON } from './storage'

export const CAUGHT_UP = 'You’re caught up. Come back whenever you need.'

const KEY = 'pi.inbox.v1' // item id -> how much of it has been seen

export type InboxEntry =
  | { kind: 'received'; id: string; share: ShareView; size: number; isNew: boolean }
  | { kind: 'replies'; id: string; share: SentShareView; size: number; isNew: boolean }
  | { kind: 'together'; id: string; item: RTItem; size: number; isNew: boolean }

function seen(): Record<string, number> {
  const v = loadJSON(KEY)
  if (!v || typeof v !== 'object') return {}
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number'))
}

// How much there is to see: a received item itself and every reply from the
// friend who shared it; for a sent item, every reply from the people it went to.
const receivedSize = (s: ShareView) => 1 + s.notes.filter((n) => !n.mine).length
const repliesSize = (s: SentShareView) => s.people.reduce((n, p) => n + p.notes.filter((x) => !x.mine).length, 0)

// Reflecting together is new when it arrives, and again when the other
// person answers, reveals or keeps theirs private.
const togetherSize = (t: RTItem) => 1 + (t.theyAnswered ? 1 : 0) + (t.theirs ? 1 : 0) + (t.theyKept ? 1 : 0)

export function inboxOf(shares: SharesView, together: RTItem[] = []): InboxEntry[] {
  const was = seen()
  const fresh = (id: string, size: number) => size > (was[id] ?? 0)
  return [
    ...shares.received.map((share) => {
      const size = receivedSize(share)
      return { kind: 'received' as const, id: share.id, share, size, isNew: fresh(share.id, size) }
    }),
    ...shares.sent
      .filter((share) => repliesSize(share) > 0)
      .map((share) => {
        const size = repliesSize(share)
        return { kind: 'replies' as const, id: share.id, share, size, isNew: fresh(share.id, size) }
      }),
    ...together.map((item) => {
      const size = togetherSize(item)
      return { kind: 'together' as const, id: item.id, item, size, isNew: fresh(item.id, size) }
    }),
  ]
}

export function markSeen(entries: InboxEntry[]): void {
  const next = { ...seen() }
  for (const e of entries) next[e.id] = Math.max(next[e.id] ?? 0, e.size)
  saveJSON(KEY, next)
}
