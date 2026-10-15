// Client for the backend API. Shapes mirror backend/api.go.

// The card shown right after an option is chosen. The server also sends the
// research behind a card and its source; the app keeps them out of sight
// (Edwin, 2026-10-15: citing is not needed "as long as the source is accurate").
export type Insight = {
  reveal: string
  research?: string
  sourceTitle?: string
  sourceUrl?: string
  strength?: 'strong' | 'moderate' | 'early'
  step: string
}
export type Option = {
  id: string
  label: string
  depth?: number
  traits?: Record<string, number>
  insight?: Insight
}
// The evening question that goes back to a morning one. Its answers stay on
// the phone and are never sent.
export type FollowUpOption = {
  id: string
  label: string
  traits?: Record<string, number>
  reflection: string
}
export type FollowUp = { prompt: string; options: FollowUpOption[] }
export type Question = {
  id: string
  theme?: string
  care?: 'everyday' | 'personal' | 'intimate'
  prompt: string
  options: Option[]
  followUp?: FollowUp
}
export type DailySet = {
  date: string
  edition?: number
  questions: Question[] // the morning's default three
  evening?: Question[] // the evening's default three, opened at 4 pm on the phone
  pool?: Question[]
  review?: boolean // Sunday: no new questions, the day for the weekly mirror
  tomorrowThemes?: string[]
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // fall through with a generic error below
  }
  if (!res.ok) {
    const code =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'unavailable'
    throw new ApiError(res.status, code)
  }
  return body as T
}

export function getToday(): Promise<DailySet> {
  return request('/api/questions/today')
}

// getDay loads the edition for the phone's own date. When that date is not
// open (a clock far off, or an older server), it falls back to the shared
// UTC edition.
export async function getDay(date: string): Promise<DailySet> {
  try {
    return await request<DailySet>(`/api/editions/${date}`)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return getToday()
    throw e
  }
}

export async function castVote(
  questionId: string,
  optionId: string,
  idempotencyKey: string,
): Promise<{ status: string; eventId: string }> {
  return withDevice((voterId) =>
    request<{ status: string; eventId: string }>('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ questionId, optionId, voterId }),
    }),
  )
}

// withDevice runs a request with this phone's token. When the server stops
// accepting the token (its secret was rotated), it gets a new one and sends
// the same request, with the same idempotency key, once more.
async function withDevice<T>(send: (token: string) => Promise<T>): Promise<T> {
  try {
    return await send(await deviceToken())
  } catch (e) {
    if (e instanceof ApiError && e.code === 'invalid_device') {
      remove(deviceKey)
      return send(await deviceToken())
    }
    throw e
  }
}

// The weekly mirror, built by the server from this phone's kept answers and
// only ever set against this phone's own past. Shapes mirror backend/mirror.go.
export type Depth = 'light' | 'deeper' | 'deep' | 'private'
export type StepStatus = 'started' | 'helped' | 'no_change' | 'not_tried'
export type WeekScore = { week: number; score?: number; solid: boolean }
export type TraitRead = {
  trait: string
  answers: number
  solid: boolean
  score: number // 0..100: where the answers sit among their questions' options
  change?: number
  history: WeekScore[]
  evidence: string[]
  theme?: string
  edition?: number
}
export type Mirror = {
  date: string
  week: number
  from: string
  to: string
  editions: [number, number]
  weeksActive: number
  stats: {
    daysActive: number
    daysActiveLastWeek: number
    daysSoFar: number // question days so far, 1 to 6
    answers: number
    private: number
    deepest: number
    learned: number
    rated: number
    stepsStarted: number
    stepsTried: number
    stepsHelped: number
  }
  days: { date: string; edition: number; answers: { theme: string; depth: Depth }[] }[]
  traits: TraitRead[]
  themes: { theme: string; area: string; answers: number; depth: Depth }[]
  steps: {
    questionId: string
    optionId: string
    theme: string
    step: string
    started: string
    status: StepStatus
    edition: number
  }[]
  stepRecord: { started: number; tried: number; helped: number }
  nextSteps: { questionId: string; optionId: string; theme: string; step: string; edition: number }[]
  comingUp: string[]
  lowMood: boolean
}

const deviceHeader = (token: string) => ({ Authorization: `Device ${token}` })

export function getMirror(date: string): Promise<Mirror> {
  return withDevice((token) => request<Mirror>(`/api/mirror?date=${date}`, { headers: deviceHeader(token) }))
}

// forgetMirror deletes everything the server keeps for this phone.
export async function forgetMirror(): Promise<void> {
  await withDevice(async (token) => {
    const res = await fetch('/api/mirror', { method: 'DELETE', headers: deviceHeader(token) })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new ApiError(res.status, body?.error ?? 'unavailable')
    }
  })
}

// saveStep starts the small step on an answered card, or says how it went.
export function saveStep(questionId: string, optionId: string, status: StepStatus, date: string): Promise<unknown> {
  return withDevice((voterId) =>
    request('/api/steps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, optionId, status, date, voterId }),
    }),
  )
}

// The one-tap "I learned something" on an insight card. Kept with the
// phone's answers for its mirror, and counted to retire weak cards.
export function rateCard(questionId: string, optionId: string, learned: boolean): Promise<unknown> {
  return withDevice((voterId) =>
    request('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomId() },
      body: JSON.stringify({ questionId, optionId, learned, voterId }),
    }),
  )
}

export function rememberRated(questionId: string) {
  save(`pi.rated.${questionId}`, '1')
}

export function wasRated(questionId: string): boolean {
  return load(`pi.rated.${questionId}`) === '1'
}

// Local storage can be missing or blocked (private mode); fall back to memory.
const memory = new Map<string, string>()
function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}
function save(key: string, value: string) {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // memory copy is enough for this visit
  }
}
function remove(key: string) {
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // nothing to do
  }
}

// forgetLocal deletes everything this app keeps on the phone except the
// device token: it holds nothing personal, and dropping it would let this
// phone vote twice on today's questions.
export function forgetLocal() {
  for (const k of [...memory.keys()]) if (k.startsWith('pi.') && k !== deviceKey) memory.delete(k)
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('pi.') && k !== deviceKey) localStorage.removeItem(k)
    }
  } catch {
    // nothing stored
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// The anonymous device token that the one-vote-per-question rule is keyed on.
// The server signs it, so it cannot be made up; it holds no personal data.
const deviceKey = 'pi.device.v1'
let pendingToken: Promise<string> | null = null

export function deviceToken(): Promise<string> {
  const saved = load(deviceKey)
  if (saved) return Promise.resolve(saved)
  pendingToken ??= request<{ token: string }>('/api/device', { method: 'POST' })
    .then(({ token }) => {
      save(deviceKey, token)
      return token
    })
    .finally(() => {
      pendingToken = null
    })
  return pendingToken
}

// A vote keeps the same idempotency key until it is accepted, so a retry after
// a dropped connection can never count twice.
export function voteKey(questionId: string): string {
  const k = `pi.pending.${questionId}`
  let key = load(k)
  if (!key) {
    key = randomId()
    save(k, key)
  }
  return key
}

export function rememberChoice(questionId: string, optionId: string) {
  remove(`pi.pending.${questionId}`)
  save(`pi.choice.${questionId}`, optionId)
  save(`pi.at.${questionId}`, String(Date.now()))
}

// When this phone answered a question, in ms, or null if it was before times were kept.
export function answeredAt(questionId: string): number | null {
  const v = Number(load(`pi.at.${questionId}`))
  return v > 0 ? v : null
}

// Evening answers: the follow-up option chosen (or SKIPPED). Never sent anywhere.
export function rememberEvening(questionId: string, optionId: string) {
  save(`pi.evening.${questionId}`, optionId)
}

export function recalledEvening(questionId: string): string | null {
  return load(`pi.evening.${questionId}`)
}

export function recalledChoice(questionId: string): string | null {
  return load(`pi.choice.${questionId}`)
}

export function rememberSkip(questionId: string) {
  save(`pi.choice.${questionId}`, SKIPPED)
}
export const SKIPPED = '-'

