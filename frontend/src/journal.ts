import { reflections, type Reflection, type ReflectionPeriod } from './notebook'
import { daysBetween, keys, load, loadJSON, remove, save, saveJSON } from './storage'

// The quiet machinery of Reflect, all on this phone and all under keys
// the registry marks "journal", so the person's writing travels only in the
// end-to-end journal copy of the backup: half-written reflections, the
// memories they put away, their Reflect choices, threads, and which earlier
// words come back.

const DRAFT = 'pi.reflect.draft.'
const DISMISSED = 'pi.reflect.dismissed'

export type DraftSpace = ReflectionPeriod | 'free'

export const draftOf = (space: DraftSpace) => load(`${DRAFT}${space}`) ?? ''

export function saveDraft(space: DraftSpace, text: string) {
  if (text.trim()) save(`${DRAFT}${space}`, text)
  else remove(`${DRAFT}${space}`)
}

// clearReflect removes the drafts, the memories put away and the Reflect
// choices, when the person deletes their reflections.
export function clearReflect() {
  for (const k of keys('pi.reflect.')) remove(k)
}

const dismissed = (): string[] => {
  const v = loadJSON(DISMISSED)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function dismissMemory(id: string) {
  saveJSON(DISMISSED, [...new Set([...dismissed(), id])])
}

// What the app may do with the person's own writing: count what they wrote
// about in What you've noticed, set an earlier and a later reflection side by
// side in Your Growth, show the threads they kept going and bring a line
// back in the Mirrors. Always on (Edwin, 2026-10-27: the app should simply
// feel personal, with no switches to make people wonder), and all of it
// worked out and shown on this phone only; nothing is sent. Old switches a
// person set before then (pi.reflect.settings) are no longer read.
export type ReflectSettings = { threadsInMirror: boolean; reflectionsInNoticed: boolean; reflectionsInGrowth: boolean; reflectionsInMirror: boolean }
const ALWAYS: ReflectSettings = { threadsInMirror: true, reflectionsInNoticed: true, reflectionsInGrowth: true, reflectionsInMirror: true }

export function reflectSettings(): ReflectSettings {
  return ALWAYS
}

// Threads: a reflection starts one; later ones name it.
export const rootOf = (r: Reflection) => r.thread ?? r.id

export function threadOf(rootId: string): Reflection[] {
  return reflections()
    .filter((r) => r.id === rootId || r.thread === rootId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
}

export function threadsOf(): { root: Reflection; entries: Reflection[] }[] {
  const all = reflections()
  const roots = new Set(all.filter((r) => r.thread).map((r) => r.thread!))
  return [...roots].flatMap((id) => {
    const entries = threadOf(id)
    return entries[0]?.id === id ? [{ root: entries[0], entries }] : []
  })
}

// The threads kept going in a span, for the longer Mirrors: only when the
// person let threads in.
export function threadsBetween(from: string, to: string) {
  if (!reflectSettings().threadsInMirror) return []
  return threadsOf()
    .map((t) => ({ root: t.root, count: t.entries.filter((e) => e.date >= from && e.date <= to).length }))
    .filter((t) => t.count > 0)
}

const MEMORY_MIN_DAYS = 5
const MEMORY_MAX_DAYS = 40

function ago(days: number): string {
  if (days < 14) return 'Last week'
  if (days < 21) return 'Two weeks ago'
  if (days < 45) return 'A few weeks ago'
  const months = Math.round(days / 30)
  return months <= 1 ? 'A month ago' : `${['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][months] ?? months} months ago`
}

// Reflection memory: words from a week or a few back that have not been
// followed up or put away, brought back once.
export function memoryFor(today: string): { reflection: Reflection; when: string } | null {
  const all = reflections()
  const followed = new Set(all.map((r) => r.followsUp).filter(Boolean))
  const away = new Set(dismissed())
  const r = all.find((x) => {
    const d = daysBetween(x.date, today)
    return d >= MEMORY_MIN_DAYS && d <= MEMORY_MAX_DAYS && !followed.has(x.id) && !away.has(x.id)
  })
  return r ? { reflection: r, when: ago(daysBetween(r.date, today)) } : null
}

const JOURNEY_MIN_DAYS = 60

// From your journey: words from two months or more ago, the start of a
// thread first, with how many times the person has come back to it since.
export function journeyFor(today: string): { reflection: Reflection; when: string; since: number } | null {
  const old = reflections().filter((r) => daysBetween(r.date, today) >= JOURNEY_MIN_DAYS && !r.thread)
  if (old.length === 0) return null
  const withThread = old.map((r) => ({ r, since: threadOf(r.id).length - 1 })).sort((a, b) => b.since - a.since || a.r.date.localeCompare(b.r.date))[0]
  return { reflection: withThread.r, when: ago(daysBetween(withThread.r.date, today)), since: withThread.since }
}

// A gentle reminder: one line a day, never a nudge to do more.
const REMINDERS = [
  'You don’t need to have everything figured out to make progress.',
  'A few honest words are enough. There is no right length.',
  'Missing a day undoes nothing. Come back whenever you like.',
  'Noticing is already a kind of change.',
  'You can write about a small thing. Small things count.',
]

export const reminderFor = (today: string) => REMINDERS[Number(today.replace(/-/g, '')) % REMINDERS.length]
