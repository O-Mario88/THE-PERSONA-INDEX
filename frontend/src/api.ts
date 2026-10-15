// Client for the backend API. Shapes mirror backend/api.go.

// The card shown right after an option is chosen. Research fields appear only
// when the card cites a study.
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
  afternoon?: Question[] // the afternoon's default three, opened at noon on the phone
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

export type OptionResult = { optionId: string; count: number; percent: number }
export type QuestionResults = { questionId: string; totalVotes: number; options: OptionResult[] }

// The crowd's split on a question. Shown only from CROWD_MIN_VOTES votes, as
// the server's mirror does; below that a split says more about chance than people.
export const CROWD_MIN_VOTES = 100

// An answer goes with the crowd when at least an even share of players picked
// it (a third, on a three-option question), the same rule as the server's
// mirror (backend/mirror.go verdicts). "At least half" would put nearly every
// answer to a three- or four-option question against the crowd.
export function withCrowd(count: number, total: number, options: number): boolean {
  return count * options >= total
}

export function getResults(questionId: string): Promise<QuestionResults> {
  return request(`/api/questions/${encodeURIComponent(questionId)}/results`)
}

// The weekly mirror, built by the server from this phone's kept answers.
// Shapes mirror backend/mirror.go.
export type Crowd = 'with' | 'against' | 'early' | 'private'
export type StepStatus = 'started' | 'helped' | 'no_change' | 'not_tried'
export type SplitOption = { label: string; count: number; percent: number; yours?: boolean }
export type AnswerSplit = {
  questionId: string
  prompt: string
  theme: string
  edition: number
  total: number
  final: boolean
  options: SplitOption[]
}
export type WeekScore = { week: number; score?: number; ranked: boolean; solid: boolean }
export type TraitRead = {
  trait: string
  answers: number
  solid: boolean
  score: number
  ranked: boolean
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
  weeksPlayed: number
  stats: {
    daysActive: number
    daysActiveLastWeek: number
    daysSoFar: number // question days so far, 1 to 6
    answers: number
    private: number
    deepest: number
    minority: number
    judged: number
    learned: number
    rated: number
    stepsStarted: number
    stepsTried: number
    stepsHelped: number
  }
  days: { date: string; edition: number; answers: { theme: string; crowd: Crowd }[] }[]
  areas: { area: string; minority: number; judged: number; lastMinority: number; lastJudged: number }[]
  rarest?: AnswerSplit
  minority: AnswerSplit[]
  divisive?: AnswerSplit
  traits: TraitRead[]
  ranked: boolean
  themes: { theme: string; area: string; answers: number; depth: 'light' | 'deeper' | 'deep' | 'private' }[]
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
  strengths: { kind: 'days' | 'deepest' | 'minority' | 'learned' | 'steps'; you: number; median: number; players: number }[]
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

// Days this phone answered at least one question, newest last. Kept on the
// phone only; the server never learns who plays when.
const daysKey = 'pi.days'

export function playedDays(): string[] {
  try {
    const v = JSON.parse(load(daysKey) ?? '[]')
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

export function recordPlayed(date: string) {
  const days = playedDays()
  if (days.includes(date)) return
  save(daysKey, JSON.stringify([...days, date].sort().slice(-60)))
}
