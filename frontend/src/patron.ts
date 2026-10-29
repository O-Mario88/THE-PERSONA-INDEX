// The Persona Index Patron (Edwin's brief, 2026-10-29). Patron is what the
// server last said this account or phone holds: a plan, the Founding Member
// place, a prepaid pass, or Patron through the one person someone walks
// alongside. The phone keeps that answer to read without waiting; a copy it
// cannot read counts as no Patron, never as Patron.
//
// A few Patron features can be tried first for free (a longer conversation
// sheet, Speak instead). Those tries are counted here, on the phone.

import { ApiError, deviceToken } from './api'
import { dateOf } from './locale'
import { load, loadJSON, saveJSON } from './storage'

export const PATRON_KEY = 'pi.patron.v1'
export const FREE_KEY = 'pi.free.v1'

export const PLANS = ['monthly', 'yearly', 'duo_monthly', 'duo_yearly', 'founding', 'pass_90', 'pass_365'] as const
export type PatronPlan = (typeof PLANS)[number]
// until: the last day it holds (YYYY-MM-DD), or null for one that doesn't end;
// via 'duo': Patron through the person they walk alongside.
export type PatronStatus = { plan: PatronPlan | null; until: string | null; via?: 'duo' }

const NOBODY: PatronStatus = { plan: null, until: null }
const isPlan = (v: unknown): v is PatronPlan => typeof v === 'string' && (PLANS as readonly string[]).includes(v)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function patronStatus(): PatronStatus {
  const v = loadJSON(PATRON_KEY) as { plan?: unknown; until?: unknown; via?: unknown } | null
  if (!v || !isPlan(v.plan)) return NOBODY
  return { plan: v.plan, until: isDate(v.until) ? v.until : null, ...(v.via === 'duo' ? { via: 'duo' as const } : {}) }
}

export function savePatron(s: PatronStatus): void {
  saveJSON(PATRON_KEY, isPlan(s.plan) ? { plan: s.plan, until: isDate(s.until) ? s.until : null, ...(s.via === 'duo' ? { via: 'duo' } : {}) } : NOBODY)
}

// ---- the server ----

// What GET /api/patron says: Patron, the Founding places left, and whether
// test purchases are open there (a development server).
export type PatronInfo = { plan: PatronPlan | null; until: string; via?: 'duo'; foundingLeft: number; test: boolean }

async function authHeaders(): Promise<Record<string, string>> {
  const account = load('pi.account.v1')
  return { Authorization: account ? `Account ${account}` : `Device ${await deviceToken()}` }
}

function infoOf(v: unknown): PatronInfo {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    plan: isPlan(o.plan) ? o.plan : null,
    until: isDate(o.until) ? o.until : '',
    ...(o.via === 'duo' ? { via: 'duo' as const } : {}),
    foundingLeft: typeof o.foundingLeft === 'number' ? o.foundingLeft : 0,
    test: o.test === true,
  }
}

async function patronCall(path: string, init: RequestInit = {}): Promise<PatronInfo> {
  const headers = { ...(await authHeaders()), ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
  const res = await fetch(path, { ...init, headers })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // an empty or broken body
  }
  if (!res.ok) throw new ApiError(res.status, body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : 'unavailable')
  const info = infoOf(body)
  savePatron({ plan: info.plan, until: info.until || null, ...(info.via ? { via: info.via } : {}) })
  return info
}

// refreshPatron asks the server, keeps its answer, and gives null when it
// can't be reached (the last answer stays).
export async function refreshPatron(): Promise<PatronInfo | null> {
  try {
    return await patronCall('/api/patron')
  } catch {
    return null
  }
}

// A test purchase, where the server allows them (development).
export const testPurchase = (plan: PatronPlan): Promise<PatronInfo> => patronCall('/api/patron/test', { method: 'POST', body: JSON.stringify({ plan }) })

export async function clearTestPurchases(): Promise<PatronInfo | null> {
  await fetch('/api/patron/test', { method: 'DELETE', headers: await authHeaders() })
  savePatron(NOBODY)
  return refreshPatron()
}

// ---- words ----

export const PLAN_PRICES: Record<PatronPlan, string> = {
  monthly: '$1.99 a month',
  yearly: '$19 a year',
  duo_monthly: '$2.99 a month',
  duo_yearly: '$24 a year',
  founding: '$39, once',
  pass_90: '$5 for 90 days',
  pass_365: '$15 for a year',
}

// patronLine says what someone holds, in a sentence for You and the Patron page.
export function patronLine(s: PatronStatus): string | null {
  if (!s.plan) return null
  if (s.plan === 'founding') return 'You’re a Founding Member. Thank you for keeping this independent.'
  const until = s.until ? dateOf(s.until, { day: 'numeric', month: 'long', year: 'numeric' }) : null
  if (s.via === 'duo') return until ? `You’re a Patron through the person you walk alongside, until ${until}.` : 'You’re a Patron through the person you walk alongside.'
  if (s.plan === 'pass_90' || s.plan === 'pass_365') return until ? `Your pass holds until ${until}.` : 'Your pass is active.'
  return until ? `You’re a Patron until ${until}. Thank you.` : 'You’re a Patron. Thank you.'
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
