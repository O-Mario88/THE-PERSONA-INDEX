// Client for the backend API. Shapes mirror backend/api.go.

import { addDays, dateOf, daysBetween, keys, load, loadJSON, remove, save, saveJSON } from './storage'

// The card shown right after an option is chosen. The server also sends the
// research behind a card and its source; the app keeps them out of sight
// (Edwin, 2026-10-15: citing is not needed "as long as the source is accurate").
export type Insight = {
  reveal: string
  otherSide?: string // one kind sentence on what this answer can cost
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
  questions: Question[] // the morning's default three
  evening?: Question[] // the evening's default three, opened at 5 pm on the phone
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

// Option id sent for an intimacy question: the server learns that one was
// answered, never which option (review of 2026-10-15). The choice stays here.
export const PRIVATE_OPTION = '~private'

export type Sitting = 'morning' | 'evening'

export async function castVote(
  questionId: string,
  optionId: string,
  idempotencyKey: string,
  sitting?: Sitting,
): Promise<{ status: string; eventId: string }> {
  return withDevice((voterId) =>
    request<{ status: string; eventId: string }>('/api/votes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ questionId, optionId, voterId, ...(sitting ? { sitting } : {}) }),
    }),
  )
}

// withDevice runs a request with this phone's pass. When the server stops
// accepting the pass (its key was rotated away, or another tab deleted
// everything), it gets a new one and sends the same request, with the same
// idempotency key, once more.
async function withDevice<T>(send: (token: string) => Promise<T>): Promise<T> {
  try {
    return await send(await deviceToken())
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'invalid_device' || e.code === 'device_forgotten')) {
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
// How far a read has been earned (backend/mirror.go): a hint is one or two
// answers or one day; a pattern three or more answers on two or more days;
// steady seven or more across three or more weeks; changing a pattern whose
// newest answers point the other way.
export type Level = 'hint' | 'pattern' | 'steady' | 'changing'
export type TraitRead = {
  trait: string
  answers: number
  days: number
  weeks: number
  level: Level
  solid: boolean
  score: number // 0..100: where the answers sit among their questions' options
  change?: number
  history: WeekScore[]
  evidence: string[]
  theme?: string
  edition?: number
}
export type ThemeRead = { theme: string; area: string; answers: number; depth: Depth }
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
    me: number // cards tapped "That's me"
    partly: number
    notMe: number
    rated: number
    stepsStarted: number
    stepsTried: number
    stepsHelped: number
  }
  days: { date: string; edition: number; answers: { theme: string; depth: Depth }[] }[]
  traits: TraitRead[]
  themes: ThemeRead[]
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

// The monthly, quarterly and yearly mirrors: this phone's weeks added up,
// from its kept answers and the small note kept of each finished week. Like
// the weekly mirror, only ever set against this phone's own past. Shapes
// mirror backend/period.go.
export type Period = 'month' | 'quarter' | 'year'
export type PeriodStats = {
  weeksActive: number
  weeksSoFar: number // weeks on record so far
  daysActive: number
  daysSoFar: number // question days in them so far
  answers: number
  private: number
  deepest: number
  me: number
  partly: number
  notMe: number
  rated: number
  stepsStarted: number
  stepsTried: number
  stepsHelped: number
}
export type PeriodWeek = {
  monday: string
  week: number // ISO week number
  kept: boolean // false: nothing on record for this week
  daysActive: number
  daysSoFar: number
  answers: number
  deepest: number
  stepsTried: number
}
export type PeriodTrait = {
  trait: string
  answers: number
  days: number
  weeks: number
  level: Level
  solid: boolean
  score: number
  weekly: WeekScore[]
  change?: number // the later weeks with a read against the earlier ones
}
// One of the answers that said the most: deep, and clearly leaning on a
// trait, with the first sentence of the card it showed.
export type Moment = {
  prompt: string
  label: string
  headline: string
  theme: string
  lean: number
  depth: number
  date: string
  edition: number
}
export type PeriodMirror = {
  period: Period
  label: string // 2026-10, 2026-Q4 or 2026
  date: string
  from: string
  to: string
  weeksTotal: number
  weeks: PeriodWeek[] // up to this week, oldest first
  stats: PeriodStats
  previous?: PeriodStats // the month or quarter before, when every week of it is on record
  previousLabel?: string
  traits: PeriodTrait[]
  themes: ThemeRead[]
  moments: Moment[]
  helped: { theme: string; step: string; started: string }[]
}

export function getPeriodMirror(period: Period, date: string): Promise<PeriodMirror> {
  return withDevice((token) =>
    request<PeriodMirror>(`/api/mirror/${period}?date=${date}`, { headers: deviceHeader(token) }),
  )
}

// What the server keeps for this phone, for the "What I keep" screen.
// Shapes mirror backend/mirror.go.
export type Kept = {
  kept: { answers: number; privateAnswers: number; steps: number; weeklyNotes: number; votes: number; firstAnswer?: string }
  keptFor: { answersDays: number; weeklyNotesDays: number; votesDays: number }
}
export type Deleted = { answers: number; steps: number; weeklyNotes: number; votes: number }

// getKept asks the server what it holds for this phone. A phone with no pass
// yet has nothing there, so it asks nothing.
export async function getKept(): Promise<Kept | null> {
  if (!load(deviceKey)) return null
  return withDevice((token) => request<Kept>('/api/device/data', { headers: deviceHeader(token) }))
}

// deleteEverywhere deletes everything the server keeps for this phone, then
// everything on the phone, its pass included, so nothing new joins what was
// deleted. It never retries with a new pass: that would delete nothing and
// say it had. Today's answered questions stay closed (see forgetLocal).
export async function deleteEverywhere(today: string): Promise<Deleted> {
  const token = load(deviceKey)
  let deleted: Deleted = { answers: 0, steps: 0, weeklyNotes: 0, votes: 0 }
  if (token) {
    const res = await request<{ deleted?: Deleted } | null>('/api/device/data', {
      method: 'DELETE',
      headers: deviceHeader(token),
    })
    if (res?.deleted) deleted = res.deleted
  }
  forgetLocal(today, true)
  return deleted
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

// The one tap under an insight card: does it fit? "That's me", "Partly" or
// "Not me". Kept with the phone's answers for its mirror, and counted to
// retire vague cards. Never sent with words. For an intimacy question
// optionId is PRIVATE_OPTION.
export type Verdict = 'me' | 'partly' | 'not_me'
const VERDICTS: Verdict[] = ['me', 'partly', 'not_me']

export function rateCard(questionId: string, optionId: string, verdict: Verdict): Promise<unknown> {
  return withDevice((voterId) =>
    request('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomId() },
      body: JSON.stringify({ questionId, optionId, verdict, voterId }),
    }),
  )
}

export function rememberRated(questionId: string, verdict: Verdict) {
  save(`pi.rated.${questionId}`, verdict)
}

// recalledVerdict is the tap kept for a card: a verdict, "rated" for a tap
// from before verdicts (2026-10-16), or null.
export function recalledVerdict(questionId: string): Verdict | 'rated' | null {
  const v = load(`pi.rated.${questionId}`)
  if (v === null) return null
  return VERDICTS.includes(v as Verdict) ? (v as Verdict) : 'rated'
}

// forgetLocal deletes everything this app keeps on the phone. The pass goes
// too when everywhere is set, after the server deleted its copy. Today's and
// yesterday's answered questions stay closed, with nothing kept of the
// answer, so a question answered before the delete is not asked and counted
// a second time.
export function forgetLocal(today: string, everywhere = false) {
  const open = addDays(today, -1)
  for (const k of keys()) {
    if (k === deviceKey && !everywhere) continue
    if (k.startsWith(choicePrefix) && load(k) !== SKIPPED) {
      const d = dateOf(k.slice(choicePrefix.length))
      if (d && d >= open) {
        save(k, CLOSED)
        continue
      }
    }
    remove(k)
  }
}

// pruneLocal clears what has outlived its use, each time the app opens: own
// words past the chosen time, drafts and per-question notes past their
// questions' days, and editions kept for offline starts other than the
// latest two days.
export function pruneLocal(today: string, wordsDays: number) {
  pruneWords(today, wordsDays)
  for (const k of keys()) {
    const qid = perQuestion.map((p) => (k.startsWith(p) ? k.slice(p.length) : '')).find(Boolean)
    const d = qid ? dateOf(qid) : null
    if (d && daysBetween(d, today) > (k.startsWith(draftPrefix) ? 1 : NOTES_KEPT_DAYS)) remove(k)
    if (k.startsWith(editionPrefix)) {
      const date = k.slice(editionPrefix.length)
      if (date < addDays(today, -1) || date > addDays(today, 1)) remove(k)
    }
    // Which three questions each sitting showed (profile.ts), only needed on their day.
    if (k.startsWith(pickPrefix) && k.slice(pickPrefix.length, pickPrefix.length + 10) < addDays(today, -1)) remove(k)
    // A verdict on a mirror leaning (profile.ts), after its five weeks.
    if (k.startsWith(leaningPrefix)) {
      const v = loadJSON(k) as { date?: unknown } | null
      if (typeof v?.date !== 'string' || daysBetween(v.date, today) > 35) remove(k)
    }
  }
}

// Per-question notes are kept a week past their day, longer than any
// question takes votes, so nothing can be answered twice.
const NOTES_KEPT_DAYS = 8
const choicePrefix = 'pi.choice.'
const pendingPrefix = 'pi.pending.'
const draftPrefix = 'pi.draft.'
const editionPrefix = 'pi.edition.'
const pickPrefix = 'pi.pick.'
const leaningPrefix = 'pi.leaning.'
const perQuestion = [choicePrefix, pendingPrefix, draftPrefix, 'pi.at.', 'pi.rated.']

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
// a dropped connection can never count twice. The key belongs to one answer:
// tapping a different one after a failure takes a new key (the server refuses
// one key for two answers), and the earlier answer is noted, since it may
// have been counted before the connection dropped.
type Pending = { key: string; option: string; earlier?: string[] }

function loadPending(questionId: string): Pending | null {
  const raw = load(pendingPrefix + questionId)
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (p && typeof p.key === 'string' && typeof p.option === 'string') return p
  } catch {
    // an older plain key: its answer is unknown
  }
  return { key: raw, option: '' }
}

export function voteKey(questionId: string, optionId: string): string {
  const p = loadPending(questionId)
  if (p && p.option === optionId) return p.key
  const earlier = [...(p?.earlier ?? []), ...(p?.option ? [p.option] : [])].filter((o) => o !== optionId)
  const next: Pending = { key: randomId(), option: optionId, ...(earlier.length ? { earlier } : {}) }
  save(pendingPrefix + questionId, JSON.stringify(next))
  return next.key
}

// dropVoteKey forgets the key, so the next try of this answer takes a new one.
export function dropVoteKey(questionId: string) {
  const p = loadPending(questionId)
  if (p) save(pendingPrefix + questionId, JSON.stringify({ ...p, key: randomId() }))
}

// earlierAnswer is the one other answer this phone tried to send for the
// question, when there was exactly one: the answer the server already
// counted when it says this phone answered.
export function earlierAnswer(questionId: string): string | null {
  const earlier = loadPending(questionId)?.earlier ?? []
  return earlier.length === 1 ? earlier[0] : null
}

export function rememberChoice(questionId: string, optionId: string) {
  remove(pendingPrefix + questionId)
  remove(draftPrefix + questionId)
  save(choicePrefix + questionId, optionId)
  save(`pi.at.${questionId}`, String(Date.now()))
}

// rememberAnswered notes that the server already has an answer from this
// phone, without knowing which. It never replaces an answer this phone knows,
// say one another tab just saved.
export function rememberAnswered(questionId: string) {
  const known = recalledChoice(questionId)
  if (known && known !== UNKNOWN && known !== SKIPPED) return
  rememberChoice(questionId, UNKNOWN)
}

// When this phone answered a question, in ms, or null if it was before times were kept.
export function answeredAt(questionId: string): number | null {
  const v = Number(load(`pi.at.${questionId}`))
  return v > 0 ? v : null
}

export function recalledChoice(questionId: string): string | null {
  return load(choicePrefix + questionId)
}

export function rememberSkip(questionId: string) {
  save(choicePrefix + questionId, SKIPPED)
}
export const SKIPPED = '-'
// The server has an answer from this phone, but not which.
export const UNKNOWN = '?'
// Answered before "Delete everything": closed for the day, nothing kept of it.
export const CLOSED = 'x'

// A half-written answer in one's own words, kept so a closed app or a
// dropped call does not lose it. Cleared once the answer is kept.
export function saveDraft(questionId: string, text: string) {
  if (text) save(draftPrefix + questionId, text)
  else remove(draftPrefix + questionId)
}

export function recalledDraft(questionId: string): string {
  return load(draftPrefix + questionId) ?? ''
}

// The day's edition, kept so the app can open without a connection.
export function cacheEdition(set: DailySet, date: string) {
  saveJSON(editionPrefix + date, set)
}

export function cachedEdition(date: string): DailySet | null {
  const set = loadJSON(editionPrefix + date) as DailySet | null
  return set && typeof set.date === 'string' && Array.isArray(set.questions) ? set : null
}

// Own words: an answer typed instead of tapped (Edwin, 2026-10-15: "room for
// the users to type their own answers"). The words stay on this phone and
// are never sent. When an option comes close, that tap is the vote and its
// card is the insight; when none does, nothing is sent at all.
export type OwnWords = {
  questionId: string
  date: string
  prompt: string
  theme?: string
  private?: boolean // an intimacy question: the mirror shows only that it was answered
  words: string
  closest?: string // the label of the option that came closest
}

// After "Not me", the line the person wrote about what is closer to them.
// Own words too: kept on this phone for as long as own words are, never sent.
export type Instead = { questionId: string; date: string; words: string }
const insteadPrefix = 'pi.instead.'

export function rememberInstead(w: Instead, keepDays: number) {
  save(insteadPrefix + w.questionId, JSON.stringify(w))
  pruneWords(w.date, keepDays)
}

export const insteadCount = () => keys(insteadPrefix).length

export function recalledInstead(questionId: string): Instead | null {
  try {
    const w = JSON.parse(load(insteadPrefix + questionId) ?? 'null')
    return w && typeof w.words === 'string' && typeof w.date === 'string' ? w : null
  } catch {
    return null
  }
}

// The choice kept when no option came close to someone's own words.
export const OWN_WORDS = '~'
export const MAX_WORDS = 280

const wordsPrefix = 'pi.words.'

// Own words are kept as long as the phone's setting says: five weeks unless
// changed (prefs.ts).
export function rememberWords(w: OwnWords, keepDays: number) {
  save(wordsPrefix + w.questionId, JSON.stringify(w))
  pruneWords(w.date, keepDays)
}

export function pruneWords(today: string, keepDays: number) {
  const cutoff = addDays(today, -keepDays)
  for (const k of keys(wordsPrefix)) {
    const old = parseWords(load(k))
    if (!old || old.date < cutoff) remove(k)
  }
  for (const k of keys(insteadPrefix)) {
    const old = recalledInstead(k.slice(insteadPrefix.length))
    if (!old || old.date < cutoff) remove(k)
  }
}

function parseWords(v: string | null): OwnWords | null {
  try {
    const w = JSON.parse(v ?? 'null')
    return w && typeof w.words === 'string' && typeof w.date === 'string' && typeof w.prompt === 'string' ? w : null
  } catch {
    return null
  }
}

export function recalledWords(questionId: string): OwnWords | null {
  return parseWords(load(wordsPrefix + questionId))
}

// wordsBetween lists the own words kept for dates from..to (YYYY-MM-DD), oldest first.
export function wordsBetween(from: string, to: string): OwnWords[] {
  return keys(wordsPrefix)
    .flatMap((k) => {
      const w = parseWords(load(k))
      return w && w.date >= from && w.date <= to ? [w] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

