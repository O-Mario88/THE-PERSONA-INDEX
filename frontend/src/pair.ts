// Walk alongside one person (Edwin's brief, 2026-10-29: Paired Mirrors), the
// app's side. Two people in each other's circle agree to walk alongside each
// other; neither ever sees the other's answers or words. On Sunday each sees
// where their weeks rhymed and differed, from what their answers reached for
// (backend/pair.go works that out from needs alone), and one question to
// talk about together, over tea or dinner.

import { ApiError } from './api'
import { isNeed, NEED_PHRASES, type Need } from './needs'
import { load } from './storage'

export type PairState = 'none' | 'asked' | 'invited' | 'walking'
export type PairPerson = { id: string; name: string; handle: string }
export type PairInfo = { state: PairState; with?: PairPerson; since?: string }
export type PairWeek = { with: string; unlocked: boolean; forming?: boolean; rhymes?: Need[]; mine?: Need; theirs?: Need }

const STATES: PairState[] = ['none', 'asked', 'invited', 'walking']

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers: Record<string, string> = {}
  const token = load('pi.account.v1')
  if (token) headers.Authorization = `Account ${token}`
  if (init.body) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { ...init, headers })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // an empty or broken body
  }
  if (!res.ok) throw new ApiError(res.status, body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : 'unavailable')
  return body
}

function pairOf(v: unknown): PairInfo {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (!STATES.includes(o.state as PairState) || o.state === 'none') return { state: 'none' }
  const w = (o.with && typeof o.with === 'object' ? o.with : null) as Record<string, unknown> | null
  if (!w || typeof w.id !== 'string' || typeof w.name !== 'string') return { state: 'none' }
  return {
    state: o.state as PairState,
    with: { id: w.id, name: w.name, handle: typeof w.handle === 'string' ? w.handle : '' },
    ...(typeof o.since === 'string' && o.since ? { since: o.since } : {}),
  }
}

function weekOf(v: unknown): PairWeek {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const rhymes = Array.isArray(o.rhymes) ? o.rhymes.filter(isNeed) : []
  return {
    with: typeof o.with === 'string' ? o.with : '',
    unlocked: o.unlocked === true,
    ...(o.forming === true ? { forming: true } : {}),
    ...(rhymes.length ? { rhymes } : {}),
    ...(isNeed(o.mine) ? { mine: o.mine } : {}),
    ...(isNeed(o.theirs) ? { theirs: o.theirs } : {}),
  }
}

export const getPair = async (): Promise<PairInfo> => pairOf(await call('/api/pair'))
export const askPair = async (friendId: string): Promise<PairInfo> => pairOf(await call('/api/pair', { method: 'POST', body: JSON.stringify({ friendId }) }))
export const acceptPair = async (): Promise<PairInfo> => pairOf(await call('/api/pair/accept', { method: 'POST' }))
export const endPair = async (): Promise<PairInfo> => pairOf(await call('/api/pair', { method: 'DELETE' }))
export const getPairWeek = async (monday: string): Promise<PairWeek> => weekOf(await call(`/api/pair/week?monday=${encodeURIComponent(monday)}`))

// ---- words ----

// The needs as they read about two people: "choosing for yourself" can't be
// said of someone else, so that one is said plainly.
const PHRASES: Record<Need, string> = { ...NEED_PHRASES, freedom: 'freedom to choose' }

// One question for the two of them, from a need they shared, or else what the
// other person reached for.
const QUESTIONS: Record<Need, string> = {
  calm: 'What would help each of us feel a little more settled this coming week?',
  belonging: 'When did each of us feel closest to someone this week?',
  respect: 'Where would each of us like to be heard a little more?',
  competence: 'What did each of us do well this week that went unseen?',
  security: 'What would help each of us feel a little steadier next week?',
  freedom: 'Where would each of us like a little more room to choose?',
  understood: 'What is one thing each of us wishes the other knew about this week?',
}
const ANY_WEEK = 'What is one small thing that would make this coming week feel lighter for each of us?'

const listOf = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function pairWeekWords(w: PairWeek): { title: string; lines: string[]; question: string } | null {
  if (!w.unlocked || w.forming || (!w.rhymes?.length && !w.mine)) return null
  const lines: string[] = []
  if (w.rhymes?.length) lines.push(`Where your weeks rhymed: you both reached for ${listOf(w.rhymes.map((n) => PHRASES[n]))}.`)
  if (w.mine && w.theirs)
    lines.push(`${w.rhymes?.length ? 'Where they differed' : 'Where your weeks differed'}: your answers leaned towards ${PHRASES[w.mine]}, and ${w.with}’s towards ${PHRASES[w.theirs]}.`)
  const ask = w.rhymes?.[0] ?? w.theirs
  return { title: `Alongside ${w.with} this week`, lines, question: ask ? QUESTIONS[ask] : ANY_WEEK }
}
