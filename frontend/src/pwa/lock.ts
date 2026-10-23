// The optional lock (Phase 3 of the review of 2026-10-15): the phone's own
// fingerprint, face or PIN check before the app opens, through the browser's
// passkey support (WebAuthn) on this phone only. Nothing goes to the server
// and no account is made: the check happens between the browser and the
// phone. It keeps out someone who picks up an unlocked phone; it does not
// scramble what is stored, and the copy says so.

import { load, loadJSON, remove, saveJSON } from '../storage'

const KEY = 'pi.lock.v1'
// Hidden this long, the app asks again when it comes back.
export const RELOCK_MS = 5 * 60_000

export type LockRecord = { id: string; made: number }

const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function lockRecord(): LockRecord | null {
  const v = loadJSON(KEY) as LockRecord | null
  return v && typeof v.id === 'string' && v.id.length > 0 ? v : null
}

export const locked = () => load(KEY) !== null && lockRecord() !== null

// lockAvailable says whether this phone can check its owner for the app.
export async function lockAvailable(): Promise<boolean> {
  try {
    const P = window.PublicKeyCredential
    return !!P && typeof P.isUserVerifyingPlatformAuthenticatorAvailable === 'function' && (await P.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

// setUpLock asks the phone to check its owner once, and keeps the key it
// makes for the app. It resolves false if the person stops it.
export async function setUpLock(): Promise<boolean> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'The Persona Index' },
        user: { id: random(16), name: 'This phone', displayName: 'This phone' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null
    if (!cred) return false
    saveJSON(KEY, { id: b64(cred.rawId), made: Date.now() } satisfies LockRecord)
    return true
  } catch {
    return false
  }
}

// unlock asks the phone to check its owner again.
export async function unlock(): Promise<boolean> {
  const rec = lockRecord()
  if (!rec) return true
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: unb64(rec.id) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    if (!got) return false
    // The phone says whether it checked the person (fingerprint, face or
    // PIN), not just that someone tapped: the user-verified flag.
    const data = new Uint8Array((got as PublicKeyCredential & { response: AuthenticatorAssertionResponse }).response.authenticatorData)
    return data.length > 32 && (data[32] & 0x04) !== 0
  } catch {
    return false
  }
}

export function removeLock() {
  remove(KEY)
}
