// The weekly Mirror's five questions (Edwin's brief, 2026-10-29): what
// mattered this week, what kept recurring, what the person said helped, what
// is still unresolved and what they want to carry into next week, then one
// action, "Choose what to focus on next". Each answer comes only from what
// the person kept, chose or said; an empty answer stays empty.
import { stepWords } from './growthJourney'
import { STARTS } from './makeSense'
import { say, type Direction, type HelpedItem } from './mirrorStory'
import type { Reflection } from './notebook'

export const WEEK_QUESTIONS = {
  mattered: 'What mattered this week?',
  recurring: 'What kept recurring?',
  helped: 'What did you say helped?',
  unresolved: 'What is still unresolved?',
  carry: 'What do you want to carry into next week?',
} as const

export const FOCUS_NEXT = 'Choose what to focus on next'

const MATTERED_MAX = 3
const FOCUS_MAX = 4

export type Mattered = { id: string; date: string; label: string; text: string }

const inWeek = (r: Reflection, from: string, to: string) => r.date >= from && r.date <= to && r.answer.trim().length > 0

// The hard moments they made sense of and the moments they kept that week,
// newest first. Their private answers and free writing stay out.
export function matteredOf(written: Reflection[], from: string, to: string): Mattered[] {
  return written
    .filter((r) => inWeek(r, from, to) && (r.source === 'sense' || r.source === 'moment'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
    .slice(0, MATTERED_MAX)
    .map((r) => ({ id: r.id, date: r.date, label: r.source === 'moment' ? 'A moment you kept' : r.question.trim(), text: r.answer.trim() }))
}

const timesWord = (n: number) => (n === 2 ? 'twice' : `${say(n)} times`)

// A starting point they came back to more than once that week.
export function recurringOf(written: Reflection[], from: string, to: string): string[] {
  const counts = new Map<string, number>()
  for (const r of written) if (inWeek(r, from, to) && r.source === 'sense' && r.start && r.start !== 'reflect') counts.set(r.start, (counts.get(r.start) ?? 0) + 1)
  return STARTS.filter((s) => (counts.get(s.id) ?? 0) >= 2).map((s) => `You came back to “${s.short}” ${timesWord(counts.get(s.id) ?? 0)} this week.`)
}

// What they said helped, fully or a little.
export const saidHelped = (items: HelpedItem[]): HelpedItem[] => items.filter((i) => i.outcome === 'helped' || i.outcome === 'some')

// What is still open: no change, made things harder, still testing, not
// tried yet. What they let go stays let go.
export const stillOpen = (items: HelpedItem[]): HelpedItem[] => items.filter((i) => i.outcome === 'no_change' || i.outcome === 'harder' || i.outcome === 'testing' || i.outcome === 'not_tried')

export type FocusChoice = { key: string; text: string }

// What to focus on next: the week's suggestion, then what they said helped,
// then what they are still finding out. Never a step they said made things
// harder: that one comes back only if they write it in themselves.
export function focusChoices(direction: Direction | null, items: HelpedItem[]): FocusChoice[] {
  const out: FocusChoice[] = []
  const add = (key: string, text: string) => {
    if (!out.some((c) => c.key === key || c.text === text)) out.push({ key, text })
  }
  if (direction) add(direction.key, direction.text)
  for (const i of saidHelped(items)) add(`keep.${i.text}`, `Keep “${stepWords(i.text)}” going.`)
  for (const i of items) {
    if (i.outcome === 'testing') add(`testing.${i.text}`, `Keep finding out how “${stepWords(i.text)}” works for you.`)
    if (i.outcome === 'not_tried') add(`try.${i.text}`, `Try “${stepWords(i.text)}” this week.`)
  }
  return out.slice(0, FOCUS_MAX)
}
