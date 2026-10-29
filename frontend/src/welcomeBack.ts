// Welcome back (Edwin's brief, 2026-10-29): after a break, Today says
// "Welcome back. Start with today, or pick up what you were exploring." No
// backlog of missed days, nothing lost, no guilt: the week's answers simply
// carry on from today. Said once for each break, from five days away.
import { stepWords } from './growthJourney'
import type { Intention, Reflection } from './notebook'
import type { History } from './profile'
import { daysBetween, loadJSON, saveJSON } from './storage'

export const WELCOME_BACK = 'Welcome back.'
export const WELCOME_BACK_LINE = 'Start with today, or pick up what you were exploring.'
export const BREAK_DAYS = 5
const SAID = 'pi.welcomeback.v1' // the day it was last put away

export type PickUp = { label: string; text: string; prompt: string }
export type WelcomeBack = { since: string; pickUp: PickUp | null }

const latest = (dates: (string | undefined)[]): string | null =>
  dates
    .filter((d): d is string => !!d)
    .sort()
    .slice(-1)[0] ?? null

// The last day the person did something: answered, kept or wrote something,
// or said how a step went.
export function lastActive(h: History, written: Reflection[], intentions: Intention[]): string | null {
  return latest([...h.answers.map((a) => a.date), ...written.map((r) => r.date), ...intentions.map((i) => i.checkedOn)])
}

const pickUpOf = (written: Reflection[], intentions: Intention[]): PickUp | null => {
  const open = intentions.filter((i) => !i.check && i.text.trim()).sort((a, b) => b.date.localeCompare(a.date))[0]
  const kept = written.filter((r) => r.source === 'sense' && r.answer.trim()).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)[0]
  if (open && (!kept || open.date >= kept.date)) return { label: 'A step you wanted to try', text: open.text.trim(), prompt: `Where are you now with “${stepWords(open.text)}”?` }
  if (kept) return { label: kept.question.trim(), text: kept.answer.trim(), prompt: `Where are you now with “${kept.answer.trim()}”?` }
  return null
}

export function welcomeBack(today: string, h: History, written: Reflection[], intentions: Intention[]): WelcomeBack | null {
  const since = lastActive(h, written, intentions)
  if (!since || daysBetween(since, today) < BREAK_DAYS) return null
  const said = loadJSON(SAID)
  if (typeof said === 'string' && said > since) return null
  return { since, pickUp: pickUpOf(written, intentions) }
}

export function dismissWelcomeBack(today: string) {
  saveJSON(SAID, today)
}
