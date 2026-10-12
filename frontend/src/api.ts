// Client for the backend API. Shapes mirror backend/api.go.

export type Option = { id: string; label: string }
export type Question = { id: string; prompt: string; options: Option[] }
export type DailySet = { date: string; questions: Question[] }
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

export function castVote(
  questionId: string,
  optionId: string,
  idempotencyKey: string,
): Promise<{ status: string; eventId: string }> {
  return request('/api/votes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ questionId, optionId, voterId: deviceId() }),
  })
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

// The anonymous device id that the one-vote-per-question rule is keyed on.
// It is random and holds no personal data.
export function deviceId(): string {
  let id = load('pi.device')
  if (!id) {
    id = randomId()
    save('pi.device', id)
  }
  return id
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
