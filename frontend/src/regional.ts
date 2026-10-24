import type { Question } from './api'
import type { History } from './profile'
import { REGIONS, type Region } from './regions'
import { loadJSON, saveJSON } from './storage'

// Questions about everyday moments where the person lives (Edwin,
// 2026-10-24: "I want the app to speak to any ethnicity in the world"; the
// plan in docs/research/regions/report.md). The server sends everyone the
// same pack (GET /api/regional); this phone keeps a copy for offline use,
// maps the country the person gave to a region (regions.ts) and picks here.
//
// A regional question is local: nothing about it is ever sent, not the vote,
// the card tap or a step, because even its id would say which part of the
// world someone lives in. Its answer stays in this phone's history, where the
// phone's own picks and the mirror's look at what changed still see it.
//
// How often: at most one in REGIONAL_GAP_DAYS, never the same one within
// REGIONAL_REPEAT_DAYS, and the person's taps take over: after two in a row
// skipped or tapped "Not me", none for REGIONAL_PAUSE_DAYS. Settings has a
// switch to turn them off.

export type RegionalQuestion = Question & { region: Region }

export const REGIONAL_GAP_DAYS = 3
export const REGIONAL_REPEAT_DAYS = 21
export const REGIONAL_PAUSE_DAYS = 28

const packKey = 'pi.regional.v1'

function isRegional(x: unknown): x is RegionalQuestion {
  if (!x || typeof x !== 'object') return false
  const q = x as Partial<RegionalQuestion>
  return (
    typeof q.id === 'string' &&
    typeof q.prompt === 'string' &&
    typeof q.theme === 'string' &&
    Array.isArray(q.options) &&
    q.options.length >= 3 &&
    REGIONS.includes(q.region as Region)
  )
}

const questionsOf = (v: unknown): RegionalQuestion[] => {
  const qs = v && typeof v === 'object' ? (v as { questions?: unknown }).questions : null
  return Array.isArray(qs) ? qs.filter(isRegional) : []
}

// cachedPack is the copy this phone kept, or nothing.
export function cachedPack(): RegionalQuestion[] {
  return questionsOf(loadJSON(packKey))
}

// fetchPack gets the pack and keeps it. The request carries nothing about
// the phone: it is the same from everyone.
export async function fetchPack(): Promise<RegionalQuestion[]> {
  const res = await fetch('/api/regional')
  if (!res.ok) throw new Error(`regional pack: ${res.status}`)
  const questions = questionsOf(await res.json())
  saveJSON(packKey, { questions })
  return questions
}

const DAY = 86400_000
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY
const bankId = (id: string) => (/^\d{4}-\d{2}-\d{2}-/.test(id) ? id.slice(11) : id)

// fnv1a is a small, stable string hash, so a day's pick is the same all day.
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

type Seen = { date: string; id: string; declined: boolean }

// seenBefore lists the regional questions answered or skipped before today,
// oldest first. Today is left out, so the day's offer holds all day.
function seenBefore(h: History, today: string): Seen[] {
  const seen: Seen[] = [
    ...h.answers
      .filter((a) => a.regional && a.date < today)
      .map((a) => ({ date: a.date, id: bankId(a.questionId), declined: a.verdict === 'not_me' })),
    ...h.skips
      .filter((s) => s.regional && s.date < today)
      .map((s) => ({ date: s.date, id: bankId(s.questionId ?? ''), declined: true })),
  ]
  return seen.sort((a, b) => a.date.localeCompare(b.date))
}

// regionalFor is the regional question this phone offers today, if one is
// due: the one of the region's it has gone longest without, as the day's
// question with today's date in its id. The pick for each sitting decides
// whether it is shown (profile.ts pickThree).
export function regionalFor(pack: RegionalQuestion[], region: Region | null, today: string, h: History): Question | null {
  if (!region) return null
  const seen = seenBefore(h, today)
  const last = seen.at(-1)
  if (last && days(last.date, today) < REGIONAL_GAP_DAYS) return null
  const lastTwo = seen.slice(-2)
  if (lastTwo.length === 2 && lastTwo.every((s) => s.declined) && days(lastTwo[1].date, today) < REGIONAL_PAUSE_DAYS) {
    return null
  }
  const lastSeen = new Map(seen.map((s) => [s.id, s.date]))
  const fresh = pack.filter((q) => {
    const at = lastSeen.get(q.id)
    return q.region === region && (!at || days(at, today) >= REGIONAL_REPEAT_DAYS)
  })
  if (fresh.length === 0) return null
  const order = (q: RegionalQuestion) => lastSeen.get(q.id) ?? ''
  const [pick] = [...fresh].sort(
    (a, b) => order(a).localeCompare(order(b)) || fnv1a(today + a.id) - fnv1a(today + b.id) || a.id.localeCompare(b.id),
  )
  return asToday(pick, today)
}

// asToday is a pack question as one of today's questions.
function asToday(q: RegionalQuestion, today: string): Question {
  return {
    id: `${today}-${q.id}`,
    theme: q.theme,
    ...(q.care ? { care: q.care } : {}),
    prompt: q.prompt,
    options: q.options,
    local: true,
  }
}

// regionalToday is every question in the pack as one of today's, so a
// sitting that already shows one keeps it when the country or the switch
// changes, as a sitting never changes under someone (App changePrefs).
export const regionalToday = (pack: RegionalQuestion[], today: string): Question[] => pack.map((q) => asToday(q, today))
