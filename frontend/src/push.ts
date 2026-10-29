// Notices when someone you trust reaches out (Edwin, 2026-10-29: "tackle that
// now"). The phone keeps whether its owner turned them on, its push address
// while on, and the day it asked; the server holds the address only while on
// (backend/notify.go). A notice names the person and what happened, never
// their words. Asked once, when there is someone to hear from.
import { loadJSON, saveJSON } from './storage'

export const PUSH_KEY = 'pi.push.v1'

export type PushState = { on?: boolean; token?: string; askedOn?: string }

export const PUSH_ASK = 'Get a quiet notice when someone you trust shares with you or replies? It names them, never their words.'
export const PUSH_ROW = 'Tell me when someone I trust shares or replies'
export const PUSH_NOTE = 'A short notice on this phone, such as “Ama replied to you.” It names them, never their words. Nothing about people you muted.'

export function pushState(): PushState {
  const v = loadJSON(PUSH_KEY)
  if (!v || typeof v !== 'object') return {}
  const s = v as Record<string, unknown>
  if ('on' in s && typeof s.on !== 'boolean') return {}
  const out: PushState = {}
  if (typeof s.on === 'boolean') out.on = s.on
  if (typeof s.token === 'string' && s.token) out.token = s.token
  if (typeof s.askedOn === 'string') out.askedOn = s.askedOn
  return out
}

export function savePush(s: PushState): void {
  saveJSON(PUSH_KEY, s)
}

export function markPushAsked(today: string): void {
  savePush({ ...pushState(), askedOn: today })
}

// Offered once, to someone with at least one person to hear from, who has not
// turned it on or off, and has not been asked before.
export function shouldAskPush(s: PushState, people: number): boolean {
  return people > 0 && s.on === undefined && !s.askedOn
}
