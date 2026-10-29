// The privacy curtain on the phone apps (Edwin's brief, 2026-10-29). No
// account is needed to start, so anyone who picks up an unlocked phone could
// open the app; the lock asks for the phone's own check (face, fingerprint or
// passcode) when the app opens and after 30 seconds away. The cover hides the
// app's last page in the app switcher. A quiet icon says less on the home
// screen. A guest PIN opens an empty, new-looking space instead of the
// person's own, for when someone insists on seeing the app.
//
// All of it stays on this phone and in no backup. A PIN is kept sealed (a
// salted hash), never as typed; four digits keep out a curious hand, not a
// determined attacker, and the words on You say so.

import { loadJSON, saveJSON } from './storage'

export const APPLOCK_KEY = 'pi.applock.v1'
export const RELOCK_AFTER_MS = 30_000

export const QUIET_ICONS = ['usual', 'pebble', 'horizon'] as const
export type QuietIcon = (typeof QUIET_ICONS)[number]

// pin: the person's own PIN, another way into their space; guest: the PIN
// that opens the empty guest space. Both sealed, or null.
export type AppLock = { on: boolean; cover: boolean; icon: QuietIcon; pin: string | null; guest: string | null }
export const NO_LOCK: AppLock = { on: false, cover: false, icon: 'usual', pin: null, guest: null }

const sealedOrNull = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f]+\.[0-9a-f]{64}$/.test(v) ? v : null)

export function parseAppLock(raw: unknown): AppLock {
  if (!raw || typeof raw !== 'object') return NO_LOCK
  const v = raw as Record<string, unknown>
  return {
    on: v.on === true,
    cover: v.cover === true,
    icon: (QUIET_ICONS as readonly unknown[]).includes(v.icon) ? (v.icon as QuietIcon) : 'usual',
    pin: sealedOrNull(v.pin),
    guest: sealedOrNull(v.guest),
  }
}

export const appLock = (): AppLock => parseAppLock(loadJSON(APPLOCK_KEY))
export const saveAppLock = (l: AppLock): void => saveJSON(APPLOCK_KEY, parseAppLock(l))

// awayMs: how long the app was away, or null when it has just opened.
export const needsUnlock = (l: AppLock, awayMs: number | null): boolean => l.on && (awayMs === null || awayMs >= RELOCK_AFTER_MS)

export const validPin = (pin: string): boolean => /^\d{4}$/.test(pin)

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

async function digest(salt: string, pin: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}

export async function sealPin(pin: string): Promise<string> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return `${salt}.${await digest(salt, pin)}`
}

async function matches(pin: string, sealed: string | null): Promise<boolean> {
  if (!sealed) return false
  const [salt, hash] = sealed.split('.')
  return (await digest(salt, pin)) === hash
}

export async function pinOpens(pin: string, l: AppLock): Promise<'real' | 'guest' | null> {
  if (!validPin(pin)) return null
  if (await matches(pin, l.pin)) return 'real'
  if (await matches(pin, l.guest)) return 'guest'
  return null
}
