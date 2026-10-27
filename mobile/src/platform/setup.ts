// What the shared code expects from a browser, given to it on a phone or a
// Mac (the website has the real thing). Imported first, before any shared file.
//
// - localStorage: the shared code reads and writes it synchronously, so the
//   app keeps every "pi." value in memory and writes each change through to
//   AsyncStorage. hydrate() loads them all before the first screen.
// - fetch: the shared code calls "/api/...". Here those go to API_URL.
// - crypto.randomUUID and getRandomValues, from expo-crypto, and the bit of
//   crypto.subtle the backup uses (subtle.ts).
// - window.addEventListener: a quiet no-op, so "storage" and "online"
//   listeners in the shared code do nothing instead of failing.
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ExpoCrypto from 'expo-crypto'
import { Platform } from 'react-native'
import { installSubtle } from './subtle'
import { setLocale } from '@shared/locale'

// Times, dates and numbers in this phone's own style (shared locale.ts).
setLocale((typeof navigator !== 'undefined' && navigator.language) || Intl.DateTimeFormat().resolvedOptions().locale)

const PREFIX = 'pi.'
const values = new Map<string, string>()
let ready = false

const memoryStorage = {
  get length() {
    return values.size
  },
  key(i: number) {
    return [...values.keys()][i] ?? null
  },
  getItem(k: string) {
    return values.has(k) ? (values.get(k) as string) : null
  },
  setItem(k: string, v: string) {
    const s = String(v)
    values.set(k, s)
    if (ready) AsyncStorage.setItem(k, s).catch(() => {})
  },
  removeItem(k: string) {
    values.delete(k)
    if (ready) AsyncStorage.removeItem(k).catch(() => {})
  },
  clear() {
    const ks = [...values.keys()]
    values.clear()
    if (ready) AsyncStorage.multiRemove(ks).catch(() => {})
  },
}

const g = globalThis as Record<string, unknown>

// On the web build the browser's own localStorage is used as it is.
if (Platform.OS !== 'web') g.localStorage = memoryStorage

// hydrate loads what this device kept, once, before the app renders.
export async function hydrate(): Promise<void> {
  if (Platform.OS === 'web' || ready) {
    ready = true
    return
  }
  try {
    const ks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX))
    const pairs = await AsyncStorage.multiGet(ks)
    for (const [k, v] of pairs) if (v !== null && !values.has(k)) values.set(k, v)
    // Anything written before hydrate finished is sent on now.
    const early = [...values.entries()].filter(([k]) => !ks.includes(k))
    if (early.length) await AsyncStorage.multiSet(early)
  } catch {
    // storage unavailable: the app runs from memory for this visit
  }
  ready = true
}

// The server the app talks to. Set EXPO_PUBLIC_API_URL to point elsewhere;
// in development it is the Go server on this computer (Android's emulator
// reaches the computer at 10.0.2.2), and a release build talks to
// personaindex.com.
const devHost = Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080'
// The web build is served next to the API, so it keeps the paths as they are.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? '' : __DEV__ ? devHost : 'https://personaindex.com')).replace(/\/$/, '')

if (API_URL) {
  const platformFetch = globalThis.fetch.bind(globalThis)
  g.fetch = (input: RequestInfo | URL, init?: RequestInit) => platformFetch(typeof input === 'string' && input.startsWith('/') ? API_URL + input : input, init)
}

if (Platform.OS !== 'web') {
  const c = (g.crypto ?? {}) as Record<string, unknown>
  if (typeof c.randomUUID !== 'function') c.randomUUID = () => ExpoCrypto.randomUUID()
  if (typeof c.getRandomValues !== 'function') c.getRandomValues = <T extends ArrayBufferView | null>(a: T) => ExpoCrypto.getRandomValues(a as never) as T
  installSubtle(c)
  if (!g.crypto) g.crypto = c
}

// A UTF-8 TextDecoder where the engine has none (opening a backup reads one).
if (typeof g.TextDecoder !== 'function') {
  g.TextDecoder = class {
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return ''
      const b = input instanceof Uint8Array ? input : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input)
      let out = ''
      for (let i = 0; i < b.length; ) {
        const c = b[i++]
        let cp = c
        if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
        else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63)
        else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63)
        out += String.fromCodePoint(cp)
      }
      return out
    }
  }
}

const w = g.window as Record<string, unknown> | undefined
if (w && typeof w.addEventListener !== 'function') {
  w.addEventListener = () => {}
  w.removeEventListener = () => {}
}

// The shared code names the device from the user agent ("iPhone", "Android
// phone") when it signs in; the app gives it one to read.
const nav = g.navigator as Record<string, unknown> | undefined
if (nav && typeof nav.userAgent !== 'string') {
  try {
    nav.userAgent = Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : Platform.OS === 'android' ? 'Android' : 'App'
  } catch {
    // read-only: the server is told "This computer"
  }
}
