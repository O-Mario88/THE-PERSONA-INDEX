import { loadJSON, saveJSON } from './storage'

// "Your week in connection" (Connect 3.0): the person's own moves towards
// their friends, noted on this phone when they make them: a quiet nod, a
// shared insight, asking for support, celebrating a win. Only the day and
// the kind, never who, and never sent: the server counts none of these. The
// Mirrors read it back for the week, month, quarter and year.

export const CONNECTION_KEY = 'pi.connection.v1'
export type ConnectionKind = 'nod' | 'share' | 'support' | 'celebrate'
type Entry = { d: string; k: ConnectionKind }
export type ConnectionCounts = Record<ConnectionKind, number> & { days: number }

const KEEP_DAYS = 366
const KINDS: ConnectionKind[] = ['nod', 'share', 'support', 'celebrate']

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function entries(): Entry[] {
  const raw = loadJSON(CONNECTION_KEY)
  return Array.isArray(raw) ? (raw as Entry[]).filter((e) => e && typeof e.d === 'string' && KINDS.includes(e.k)) : []
}

export function noteConnection(kind: ConnectionKind, date: string): void {
  const cutoff = shift(date, -KEEP_DAYS)
  saveJSON(CONNECTION_KEY, [...entries().filter((e) => e.d >= cutoff), { d: date, k: kind }])
}

export function connectionBetween(from: string, to: string): ConnectionCounts {
  const within = entries().filter((e) => e.d >= from && e.d <= to)
  const counts: ConnectionCounts = { nod: 0, share: 0, support: 0, celebrate: 0, days: new Set(within.map((e) => e.d)).size }
  for (const e of within) counts[e.k] += 1
  return counts
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => NUMBERS[n] ?? String(n)

const PHRASES: Record<ConnectionKind, (n: number) => string> = {
  nod: (n) => (n === 1 ? 'sent a quiet nod' : `sent ${say(n)} quiet nods`),
  share: (n) => (n === 1 ? 'shared one thing that helped' : `shared ${say(n)} things that helped`),
  support: (n) => (n === 1 ? 'asked someone for support' : `asked for support ${say(n)} times`),
  celebrate: (n) => (n === 1 ? 'celebrated a win with someone' : `celebrated ${say(n)} wins with friends`),
}

function list(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// One plain sentence. A quiet span is only quiet: no nudge, no judgement.
export function connectionLine(c: ConnectionCounts, span: 'week' | 'month' | 'quarter' | 'year'): string {
  const parts = KINDS.filter((k) => c[k] > 0).map((k) => PHRASES[k](c[k]))
  if (parts.length === 0) return `A quiet ${span} for connection. That is all it was.`
  return `This ${span} you ${list(parts)}.`
}
