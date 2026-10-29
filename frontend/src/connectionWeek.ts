// "Connection this week" in the Mirror (Edwin, 2026-10-29): only what actually
// happened between the person and people they trust that week, by name, and
// never a count of anyone else. If they received support, the Mirror asks
// once whether it helped, and remembers the answer for that week, so "What
// did you say helped?" can include it.
import type { OutsideView, ReflectTogetherView, SharesView } from './social'
import { loadJSON, saveJSON } from './storage'

export const SUPPORT_ASK = 'Did the support you received this week help?'
export type SupportAnswer = 'helped' | 'some' | 'no'
const KEY = 'pi.support.v1' // week (its Monday) -> what the person said

const inWeek = (date: string, from: string, to: string) => date >= from && date <= to
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const unique = (xs: string[]) => [...new Set(xs)]

export function connectionWeek(shares: SharesView, together: ReflectTogetherView, outside: OutsideView, from: string, to: string): { lines: string[]; received: boolean } {
  const lines: string[] = []
  const sent = shares.sent.filter((s) => inWeek(s.date, from, to))
  if (sent.length) lines.push(`You shared ${plural(sent.length, 'thing', 'things')} with ${listOf(unique(sent.flatMap((s) => s.people.map((p) => p.name))))}.`)

  const received = shares.received.filter((s) => inWeek(s.date, from, to))
  for (const name of unique(received.map((s) => s.from.name))) {
    lines.push(`${name} shared ${plural(received.filter((s) => s.from.name === name).length, 'thing', 'things')} with you.`)
  }

  const replies = [...shares.sent.flatMap((s) => s.people.flatMap((p) => p.notes)), ...shares.received.flatMap((s) => s.notes)].filter((n) => !n.mine && inWeek(n.date, from, to))
  if (replies.length) lines.push(`You received ${plural(replies.length, 'reply', 'replies')}.`)

  const together_ = together.items.filter((t) => t.theirs && inWeek(t.date, from, to))
  if (together_.length) lines.push(`You reflected together with ${listOf(unique(together_.map((t) => t.with.name)))}.`)

  const notes = outside.notes.filter((n) => inWeek(n.date, from, to))
  for (const name of unique(notes.map((n) => n.from.name))) lines.push(`${name} wrote you a note.`)

  return { lines, received: received.length + replies.length + together_.length + notes.length > 0 }
}

export function supportFor(week: string): SupportAnswer | null {
  const v = (loadJSON(KEY) as Record<string, unknown> | null)?.[week]
  return v === 'helped' || v === 'some' || v === 'no' ? v : null
}

export function saySupport(week: string, answer: SupportAnswer): void {
  const was = loadJSON(KEY)
  saveJSON(KEY, { ...(was && typeof was === 'object' ? was : {}), [week]: answer })
}
