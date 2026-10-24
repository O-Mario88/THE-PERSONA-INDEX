// Your people (the proposal of 2026-10-24, "Heavy answers point to
// people"): up to three people the person would want to hear from on a hard
// day, and what helps when things are heavy, in their own words. It is shown
// on the card of a heavy answer, so that card points to people they know
// instead of an insight. Kept on this phone only; the backup carries it only
// when own words go in the backup too (registry.ts).

import { loadJSON, remove, saveJSON } from './storage'

const KEY = 'pi.people'
export const MAX_PEOPLE = 3
export const MAX_NAME = 40
export const MAX_HELPS = 140

export type People = { at: number; names: string[]; helps?: string }

export function loadPeople(): People | null {
  const v = loadJSON(KEY) as People | null
  if (!v || typeof v !== 'object' || !Array.isArray(v.names) || typeof v.at !== 'number') return null
  const names = v.names.filter((n): n is string => typeof n === 'string' && n.trim() !== '').slice(0, MAX_PEOPLE)
  const helps = typeof v.helps === 'string' && v.helps.trim() ? v.helps : undefined
  return names.length || helps ? { at: v.at, names, ...(helps ? { helps } : {}) } : null
}

// savePeople keeps the names and the line, or clears the key when both are empty.
export function savePeople(names: string[], helps: string) {
  const kept = names.map((n) => n.trim().slice(0, MAX_NAME)).filter(Boolean).slice(0, MAX_PEOPLE)
  const line = helps.trim().slice(0, MAX_HELPS)
  if (!kept.length && !line) {
    remove(KEY)
    return
  }
  const was = loadPeople()
  saveJSON(KEY, { at: Math.max(Date.now(), (was?.at ?? 0) + 1), names: kept, ...(line ? { helps: line } : {}) } satisfies People)
}

// "Ama", "Ama or Kofi", "Ama, Kofi or Esi".
export function namesLine(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}
