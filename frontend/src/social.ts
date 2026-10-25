// Client for Stage 5: lazy accounts, the circle, friend questions, the
// Outside Mirror, quiet nods and Answer Together. Shapes mirror
// backend/accounts.go, circle.go, friends.go and connect.go.
//
// Nothing here runs until the person signs in. The account token stays on
// this phone (never in a backup); signing in swaps the phone's pass for the
// account's, so every phone on the account is counted as one.

import { ApiError } from './api'
import { load, loadJSON, remove, save, saveJSON } from './storage'

export const ACCOUNT_KEY = 'pi.account.v1'
const ME_KEY = 'pi.account.me'
const DEVICE_KEY = 'pi.device.v1'
export const INVITE_KEY = 'pi.invite'

export type AccountView = { id: string; name: string; handle: string; suggest: boolean; connect: boolean; sync: boolean }
export type SignInMethods = { email: boolean; phone: boolean; google: boolean; apple: boolean; googleClientId?: string; appleClientId?: string }
export type SignedIn = { account: AccountView; accountToken: string; deviceToken: string; created: boolean; merged: boolean }
export type LoginView = { kind: 'email' | 'phone' | 'google' | 'apple'; hint: string }
export type SessionView = { id: string; label: string; seenOn: string; current: boolean }
export type AccountDetails = { account: AccountView; logins: LoginView[]; sessions: SessionView[] }

export type Tag = 'work' | 'family' | 'school' | 'friends'
export const TAGS: Tag[] = ['work', 'family', 'school', 'friends']
export const TAG_NAMES: Record<Tag, string> = { work: 'Work', family: 'Family', school: 'School', friends: 'Friends' }

export type FriendView = { id: string; name: string; handle?: string; tag: Tag; since: string; muted?: boolean; active: boolean; connect: boolean }
export type RoomView = { code: string; tag: Tag; inside: number; expires: string; host?: string }
export type SuggestionView = { id: string; name: string; handle?: string; mutual?: string[]; room?: string; asked?: boolean }
export type CircleView = {
  me: AccountView
  friends: FriendView[]
  active: number
  need: number
  room?: RoomView
  joined: RoomView[]
  suggestions: SuggestionView[]
}
export type InvitePeek = { name: string; handle?: string; tag: Tag }

export type FriendToday = {
  open: boolean
  have: number
  need: number
  answered?: boolean
  friend?: FriendView
  question?: { id: string; prompt: string; options: { id: string; label: string }[] }
}
export type OutsideMirror = { open: boolean; friends: number; need: number; weeks: number; traits: { trait: string; position: number }[] }

export type NodView = { from: FriendView; card: number; text: string; date: string }
export type NodsView = { cards: string[]; received: NodView[]; sentTo: string[] }
export type TogetherView = {
  id: string
  with: FriendView
  asked: boolean
  questionId: string
  prompt: string
  theme?: string
  options: { id: string; label: string }[]
  mine?: string
  theirs?: string
  state: 'waiting' | 'yours' | 'revealed' | 'expired'
  expires: string
}

// ---- the session on this phone ----

const listeners = new Set<() => void>()
export function onAccountChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function tell() {
  for (const fn of listeners) fn()
}

export function accountToken(): string | null {
  return load(ACCOUNT_KEY)
}

export function cachedMe(): AccountView | null {
  const v = loadJSON(ME_KEY) as AccountView | null
  return v && typeof v === 'object' && typeof v.id === 'string' ? v : null
}

function keepMe(me: AccountView) {
  saveJSON(ME_KEY, me)
  tell()
}

function keepSession(s: SignedIn) {
  save(ACCOUNT_KEY, s.accountToken)
  save(DEVICE_KEY, s.deviceToken)
  keepMe(s.account)
}

// forgetSession signs this phone out locally: the account's pass goes, and
// the next vote takes a fresh anonymous one.
export function forgetSession() {
  remove(ACCOUNT_KEY)
  remove(ME_KEY)
  remove(DEVICE_KEY)
  tell()
}

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (init.body) headers['Content-Type'] = 'application/json'
  const token = accountToken()
  if (auth && token) headers.Authorization = `Account ${token}`
  const res = await fetch(path, { ...init, headers })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // an empty body (204) or a broken one
  }
  if (!res.ok) {
    const code = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : 'unavailable'
    // The server ended this session (signed out elsewhere, or deleted).
    if (auth && res.status === 401 && (code === 'signed_out' || code === 'no_account')) forgetSession()
    throw new ApiError(res.status, code)
  }
  return body as T
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

// ---- signing in ----

export function signInMethods(): Promise<SignInMethods> {
  return call('/api/auth/methods', {}, false)
}

export function sendCode(address: string): Promise<{ status: string; kind: 'email' | 'phone' }> {
  return call('/api/auth/code', json('POST', { address }), false)
}

function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'This phone'
  const ua = navigator.userAgent
  const what = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : 'This computer'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return browser ? `${what} · ${browser}` : what
}

export async function verifyCode(address: string, code: string): Promise<SignedIn> {
  const s = await call<SignedIn>('/api/auth/verify', json('POST', { address, code, voterId: load(DEVICE_KEY) ?? '', device: deviceLabel() }))
  keepSession(s)
  return s
}

export async function signInWithID(provider: 'google' | 'apple', idToken: string): Promise<SignedIn> {
  const s = await call<SignedIn>('/api/auth/id', json('POST', { provider, idToken, voterId: load(DEVICE_KEY) ?? '', device: deviceLabel() }))
  keepSession(s)
  return s
}

// ---- the account ----

export async function getAccount(): Promise<AccountDetails> {
  const d = await call<AccountDetails>('/api/account')
  keepMe(d.account)
  return d
}

export async function patchAccount(p: Partial<Pick<AccountView, 'name' | 'handle' | 'suggest' | 'connect'>>): Promise<AccountView> {
  const me = await call<AccountView>('/api/account', json('PATCH', p))
  keepMe(me)
  return me
}

export async function deleteAccount(): Promise<void> {
  await call('/api/account', json('DELETE'))
  forgetSession()
}

export async function signOut(id: string | 'current'): Promise<void> {
  await call(`/api/account/sessions/${encodeURIComponent(id)}`, json('DELETE'))
  if (id === 'current') forgetSession()
}

export function putSync(phrase: string): Promise<void> {
  return call('/api/account/sync', json('PUT', { phrase }))
}
export async function getSync(): Promise<string | null> {
  try {
    return (await call<{ phrase: string }>('/api/account/sync')).phrase
  } catch (e) {
    if (e instanceof ApiError && e.code === 'no_sync') return null
    throw e
  }
}
export function deleteSync(): Promise<void> {
  return call('/api/account/sync', json('DELETE'))
}

// ---- the circle ----

export const getCircle = () => call<CircleView>('/api/circle')
export const createInvite = (tag: Tag) => call<{ code: string; tag: Tag; expiresOn: string }>('/api/circle/invites', json('POST', { tag }))
export const peekInvite = (code: string) => call<InvitePeek>(`/api/circle/invites/${encodeURIComponent(code)}`, {}, false)
export const acceptInvite = (code: string, tag: Tag) => call<FriendView>(`/api/circle/invites/${encodeURIComponent(code)}`, json('POST', { tag }))
export const openRoom = (tag: Tag) => call<RoomView>('/api/circle/rooms', json('POST', { tag }))
export const joinRoom = (code: string) => call<RoomView>(`/api/circle/rooms/${encodeURIComponent(code)}`, json('POST'))
export const connectTo = (id: string, tag: Tag) => call<{ status: 'asked' | 'connected' }>(`/api/circle/connect/${encodeURIComponent(id)}`, json('POST', { tag }))
export const dismissSuggestion = (id: string) => call<void>(`/api/circle/dismiss/${encodeURIComponent(id)}`, json('POST'))
export const patchFriend = (id: string, p: { tag?: Tag; muted?: boolean }) => call<FriendView>(`/api/circle/friends/${encodeURIComponent(id)}`, json('PATCH', p))
export const disconnect = (id: string) => call<void>(`/api/circle/friends/${encodeURIComponent(id)}`, json('DELETE'))

// The invite link: personaindex.com/c/<code>. Opening it keeps the code
// until the person signs in and accepts.
export function inviteLink(code: string): string {
  const origin = typeof location === 'undefined' ? 'https://personaindex.com' : location.origin
  return `${origin}/c/${code}`
}

export function inviteFromURL(): string | null {
  if (typeof location === 'undefined') return null
  const m = location.pathname.match(/^\/c\/([a-z2-9]{10})$/) ?? location.search.match(/[?&]invite=([a-z2-9]{10})/)
  if (m) {
    save(INVITE_KEY, m[1])
    history.replaceState?.(null, '', '/')
  }
  return load(INVITE_KEY)
}

export function dropInvite() {
  remove(INVITE_KEY)
}

// ---- friend questions and the Outside Mirror ----

export const friendToday = (date: string) => call<FriendToday>(`/api/friends/today?date=${date}`)
export const friendVote = (date: string, friendId: string, questionId: string, optionId: string) =>
  call<{ status: string }>('/api/friends/votes', json('POST', { date, friendId, questionId, optionId }))
export const outsideMirror = () => call<OutsideMirror>('/api/friends/mirror')

// ---- quiet nods and Answer Together ----

export const getNods = (date: string) => call<NodsView>(`/api/nods?date=${date}`)
export const sendNod = (to: string, card: number, date: string) => call<{ status: string }>('/api/nods', json('POST', { to, card, date }))
export const getTogethers = () => call<TogetherView[]>('/api/together')
export const askTogether = (friendId: string, questionId: string, optionId: string) =>
  call<{ id: string }>('/api/together', json('POST', { friendId, questionId, optionId }))
export const answerTogether = (id: string, optionId: string) =>
  call<{ mine: string; theirs: string }>(`/api/together/${encodeURIComponent(id)}`, json('POST', { optionId }))
export const leaveTogether = (id: string) => call<void>(`/api/together/${encodeURIComponent(id)}`, json('DELETE'))

// ---- Closer Together (the new Connect, backend/closer.go) ----
// Three permissions, each asked for on its own: a shared insight goes only
// to the friends picked and can be withdrawn; Common Ground shows only what
// two friends share, once both opted in; a reach-out is one fixed phrase to
// one friend, and the sender is never told whether it was seen.

export type ShareKind = 'helped' | 'win'
export type ThemeOption = { id: string; label: string }
export type ShareView = { id: string; kind: ShareKind; theme: string; text: string; why?: string; try?: string; date: string }
export type SentShareView = { id: string; kind: ShareKind; theme: string; text: string; why?: string; try?: string; date: string; to: string[] }
export type SharesView = { themes: ThemeOption[]; received: ShareView[]; sent: SentShareView[] }
export type NewShare = { kind: ShareKind; theme: string; text: string; why?: string; try?: string; to: string[] }

export type CommonTag = { id: string; label: string; value: string; explore: string }
export type CommonPair = { friend: FriendView; shared: string[]; headline: string; explore: string }
export type CommonView = { tags: CommonTag[]; mine: string[]; nextChange?: string; optedIn: string[]; pairs: CommonPair[] }

export type ReachKind = 'support' | 'celebrate'
export type ReachOutView = { id: string; from: FriendView; kind: ReachKind; text: string; date: string }
export type ReachOutsView = { phrases: Record<ReachKind, ThemeOption[]>; received: ReachOutView[] }

export const SHARE_TEXT_MIN = 10
export const SHARE_TEXT_MAX = 280

export const getShares = () => call<SharesView>('/api/shares')
export const postShare = (s: NewShare) => call<{ id: string }>('/api/shares', json('POST', s))
export const withdrawShare = (id: string) => call<void>(`/api/shares/${encodeURIComponent(id)}`, json('DELETE'))
export const getCommon = () => call<CommonView>('/api/common')
export const putCommon = (tags: string[]) => call<void>('/api/common', json('PUT', { tags }))
export const setCommonFriend = (id: string, on: boolean) => call<void>(`/api/common/friends/${encodeURIComponent(id)}`, json('PUT', { on }))
export const getReachOuts = () => call<ReachOutsView>('/api/reachouts')
export const sendReachOut = (to: string, kind: ReachKind, phrase: string) => call<{ status: string }>('/api/reachouts', json('POST', { to, kind, phrase }))
export const putAwayReachOut = (id: string) => call<void>(`/api/reachouts/${encodeURIComponent(id)}`, json('DELETE'))

// "Ama", "@ama" from a name; initials for an avatar.
export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
