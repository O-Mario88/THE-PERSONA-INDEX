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
export type Question = {
  id: string
  theme?: string
  care?: 'everyday' | 'personal' | 'intimate'
  prompt: string
  options: Option[]
}
export type DailySet = {
  date: string
  edition?: number
  questions: Question[]
  pool?: Question[]
  tomorrowThemes?: string[]
}
export type OptionResult = { optionId: string; count: number; percent: number }
export type QuestionResults = {
  questionId: string
  totalVotes: number
  options: OptionResult[]
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

export function getResults(questionId: string): Promise<QuestionResults> {
  return request(`/api/questions/${encodeURIComponent(questionId)}/results`)
}

export async function castVote(
  questionId: string,
  optionId: string,
  idempotencyKey: string,
): Promise<{ status: string; eventId: string }> {
  const send = async () =>
    request<{ status: string; eventId: string }>('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ questionId, optionId, voterId: await deviceToken() }),
    })
  try {
    return await send()
  } catch (e) {
    // The server stopped accepting this token (its secret was rotated): get a
    // new one and send the same vote, with the same key, once more.
    if (e instanceof ApiError && e.code === 'invalid_device') {
      remove(deviceKey)
      return send()
    }
    throw e
  }
}

// The one-tap "I learned something" on an insight card. Anonymous, like votes.
export function rateCard(questionId: string, optionId: string, learned: boolean): Promise<unknown> {
  return deviceToken().then((voterId) =>
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
}

export function recalledChoice(questionId: string): string | null {
  return load(`pi.choice.${questionId}`)
}

export function rememberSkip(questionId: string) {
  save(`pi.choice.${questionId}`, SKIPPED)
}
export const SKIPPED = '-'

export function rememberGuess(questionId: string, guess: string) {
  save(`pi.guess.${questionId}`, guess)
}

export function recalledGuess(questionId: string): string | null {
  return load(`pi.guess.${questionId}`)
}

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
