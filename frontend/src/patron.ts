// The Persona Index Patron (Edwin's brief, 2026-10-29). Patron is what the
// server last said this account or phone holds: a plan, the Founding Member
// place, a prepaid pass, or Patron through the one person someone walks
// alongside. The phone keeps that answer to read without waiting; a copy it
// cannot read counts as no Patron, never as Patron.
//
// A few Patron features can be tried first for free (a longer conversation
// sheet, Speak instead). Those tries are counted here, on the phone.

import { loadJSON, saveJSON } from './storage'

export const PATRON_KEY = 'pi.patron.v1'
export const FREE_KEY = 'pi.free.v1'

export const PLANS = ['monthly', 'yearly', 'duo_monthly', 'duo_yearly', 'founding', 'pass_90', 'pass_365'] as const
export type PatronPlan = (typeof PLANS)[number]
// until: the last day it holds (YYYY-MM-DD), or null for one that doesn't end.
export type PatronStatus = { plan: PatronPlan | null; until: string | null }

const NOBODY: PatronStatus = { plan: null, until: null }
const isPlan = (v: unknown): v is PatronPlan => typeof v === 'string' && (PLANS as readonly string[]).includes(v)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function patronStatus(): PatronStatus {
  const v = loadJSON(PATRON_KEY) as { plan?: unknown; until?: unknown } | null
  if (!v || !isPlan(v.plan)) return NOBODY
  return { plan: v.plan, until: isDate(v.until) ? v.until : null }
}

export function savePatron(s: PatronStatus): void {
  saveJSON(PATRON_KEY, isPlan(s.plan) ? { plan: s.plan, until: isDate(s.until) ? s.until : null } : NOBODY)
}

export const isPatron = (today: string, s: PatronStatus = patronStatus()): boolean => s.plan !== null && (s.until === null || s.until >= today)

// ---- free tries ----

export type FreeKind = 'sheet' | 'voice'
// sheet: one conversation sheet across 14 or 30 days; voice: three times speaking instead of typing.
export const FREE_TRIES: Record<FreeKind, number> = { sheet: 1, voice: 3 }

function used(): Record<FreeKind, number> {
  const v = loadJSON(FREE_KEY) as Partial<Record<FreeKind, unknown>> | null
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0)
  return { sheet: n(v?.sheet), voice: n(v?.voice) }
}

export const freeLeft = (kind: FreeKind): number => Math.max(0, FREE_TRIES[kind] - used()[kind])

export function noteFreeTry(kind: FreeKind): void {
  const u = used()
  saveJSON(FREE_KEY, { ...u, [kind]: u[kind] + 1 })
}
