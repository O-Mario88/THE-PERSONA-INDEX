import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetLocal } from '../api'
import { save, saveJSON } from '../storage'
import { canPrompt, inviteDue, noteInstall, promptInstall, watchInstall } from './install'
import { lockAvailable, locked, removeLock, setUpLock, unlock } from './lock'
import { precacheList, serviceWorker } from './serviceWorker'

// Install, offline and the optional lock (Phase 3 of the review of
// 2026-10-15).

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the service worker', () => {
  const files = [
    'index.html',
    'assets/index-AbC123.js',
    'assets/index-xYz-9.css',
    'assets/reads-Q1w2.js',
    'assets/ibm-plex-sans-latin-wght-normal-IvpU.woff2',
    'assets/ibm-plex-sans-cyrillic-wght-normal-BAAh.woff2',
    'read/index.html',
    'read/some-read/index.html',
    'manifest.webmanifest',
    'favicon.svg',
    'icon-192.png',
    'icon-512.png',
    'apple-touch-icon.png',
  ]

  it('keeps the page, its script and styles, the Latin fonts and the icons', () => {
    expect(precacheList(files)).toEqual([
      '/',
      '/apple-touch-icon.png',
      '/assets/ibm-plex-sans-latin-wght-normal-IvpU.woff2',
      '/assets/index-AbC123.js',
      '/assets/index-xYz-9.css',
      '/favicon.svg',
      '/icon-192.png',
      '/manifest.webmanifest',
    ])
  })

  it('keeps the React Native web build: its script, the Geist faces the app draws with, and the icons', () => {
    const expo = [
      'index.html',
      'app.css',
      '_expo/static/js/web/index-9bdcdbe5f9584522a138355c67028d4f.js',
      'assets/node_modules/@expo-google-fonts/geist/400Regular/Geist_400Regular.fde4a0ff.ttf',
      'assets/node_modules/@expo-google-fonts/geist/800ExtraBold/Geist_800ExtraBold.2960d6e0.ttf',
      'assets/node_modules/@expo-google-fonts/geist/900Black/Geist_900Black.cb929048.ttf',
      'assets/node_modules/@expo-google-fonts/geist/400Regular_Italic/Geist_400Regular_Italic.9d65a509.ttf',
      'manifest.webmanifest',
      'favicon.svg',
      'sw.js',
    ]
    expect(precacheList(expo)).toEqual([
      '/',
      '/_expo/static/js/web/index-9bdcdbe5f9584522a138355c67028d4f.js',
      '/app.css',
      '/assets/node_modules/@expo-google-fonts/geist/400Regular/Geist_400Regular.fde4a0ff.ttf',
      '/favicon.svg',
      '/manifest.webmanifest',
    ])
  })

  // Runs the worker's code against a stand-in for its global scope, with
  // caches held in a map and the network on or off.
  function worker(online = false) {
    const handlers: Record<string, (e: unknown) => void> = {}
    const kept = new Map<string, string>([['/', 'the app page'], ['/assets/index-AbC123.js', 'the script'], ['/_expo/static/js/web/index-abc.js', 'the expo script']])
    const path = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, 'https://personaindex.com').pathname
    const caches = {
      match: async (r: string | { url: string }) => kept.get(path(r)),
      open: async () => ({ put: async (r: { url: string }) => void kept.set(path(r), 'from the network') }),
    }
    const net = vi.fn(async () => {
      if (!online) throw new TypeError('offline')
      return { ok: true, type: 'basic', clone: () => ({}), body: 'from the network' }
    })
    const scope = { addEventListener: (t: string, fn: (e: unknown) => void) => (handlers[t] = fn), location: { origin: 'https://personaindex.com' } }
    new Function('self', 'caches', 'fetch', serviceWorker('v1', ['/']))(scope, caches, net)
    const fetchEvent = (url: string, init: { method?: string; mode?: string } = {}) => {
      const respondWith = vi.fn()
      handlers.fetch({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith })
      return respondWith
    }
    const answer = (url: string, init: { mode?: string } = {}) => fetchEvent(url, init).mock.calls[0][0] as Promise<unknown>
    return { handlers, fetchEvent, answer, net }
  }

  it('never answers for the API, other sites or anything but reading', () => {
    const { handlers, fetchEvent } = worker()
    expect(Object.keys(handlers).sort()).toEqual(['activate', 'fetch', 'install'])
    expect(fetchEvent('https://personaindex.com/api/questions/today')).not.toHaveBeenCalled()
    expect(fetchEvent('https://personaindex.com/api/vault', { method: 'PUT' })).not.toHaveBeenCalled()
    expect(fetchEvent('https://personaindex.com/', { method: 'POST' })).not.toHaveBeenCalled()
    expect(fetchEvent('https://example.org/x.js')).not.toHaveBeenCalled()
    expect(fetchEvent('https://personaindex.com/sw.js')).not.toHaveBeenCalled()
  })

  it('opens the app without a connection, and goes to the network first when there is one', async () => {
    const offline = worker(false)
    expect(await offline.answer('https://personaindex.com/', { mode: 'navigate' })).toBe('the app page')
    expect(await offline.answer('https://personaindex.com/?from=home', { mode: 'navigate' })).toBe('the app page')
    expect(await offline.answer('https://personaindex.com/assets/index-AbC123.js')).toBe('the script')
    // A read never opened before is not there to show; it is not the app page either.
    await expect(offline.answer('https://personaindex.com/read/some-read/', { mode: 'navigate' })).rejects.toThrow('offline')

    const online = worker(true)
    expect(await online.answer('https://personaindex.com/', { mode: 'navigate' })).toMatchObject({ body: 'from the network' })
    expect(await online.answer('https://personaindex.com/assets/index-AbC123.js')).toBe('the script')
    expect(online.net).toHaveBeenCalledTimes(1)
    // The React Native web build's script carries its hash too, so the kept copy comes first.
    expect(await online.answer('https://personaindex.com/_expo/static/js/web/index-abc.js')).toBe('the expo script')
    expect(online.net).toHaveBeenCalledTimes(1)
  })

  it('names a new cache for each version', () => {
    expect(serviceWorker('abc', ['/'])).toContain('const VERSION = "abc"')
    expect(serviceWorker('abc', ['/', '/x.js'])).toContain('const PRECACHE = ["/","/x.js"]')
  })
})

describe('the home screen invite', () => {
  it('waits a week, and asks again only once, four weeks after "not now"', () => {
    expect(inviteDue('2026-10-23', null)).toBe(false)
    expect(inviteDue('2026-10-23', '2026-10-17')).toBe(false)
    expect(inviteDue('2026-10-23', '2026-10-16')).toBe(true)
    noteInstall('2026-10-23', 'later')
    expect(inviteDue('2026-10-24', '2026-10-16')).toBe(false)
    expect(inviteDue('2026-11-20', '2026-10-16')).toBe(true)
    noteInstall('2026-11-20', 'later')
    expect(inviteDue('2027-01-20', '2026-10-16')).toBe(false)
    localStorage.clear()
    noteInstall('2026-10-23', 'added')
    expect(inviteDue('2027-01-20', '2026-10-16')).toBe(false)
  })

  // The app's InstallInvite (mobile/src/screens/Browser.tsx) draws these.
  it("keeps the browser's own offer and uses it once", async () => {
    const stop = watchInstall()
    expect(canPrompt()).toBe(false) // no offer from the browser yet
    const prompt = vi.fn(async () => {})
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    window.dispatchEvent(offer)
    expect(offer.defaultPrevented).toBe(true)
    expect(canPrompt()).toBe(true)
    expect(await promptInstall()).toBe('added')
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(canPrompt()).toBe(false)
    stop()
  })
})

describe('the lock', () => {
  // A phone that can check its owner: the passkey calls, with the
  // user-verified flag set or not.
  function phone({ verified = true, available = true } = {}) {
    const rawId = new Uint8Array([1, 2, 3, 4]).buffer
    const authenticatorData = new Uint8Array(37)
    authenticatorData[32] = verified ? 0x05 : 0x01
    const create = vi.fn(async () => ({ rawId }))
    const get = vi.fn(async () => ({ rawId, response: { authenticatorData: authenticatorData.buffer } }))
    vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: async () => available })
    Object.defineProperty(navigator, 'credentials', { value: { create, get }, configurable: true })
    return { create, get }
  }

  // The app's WebLockGate and WebLockSettings (mobile/src/screens/Browser.tsx) draw these.
  it('is offered only on a phone that can check its owner', async () => {
    phone({ available: false })
    expect(await lockAvailable()).toBe(false)
    phone()
    expect(await lockAvailable()).toBe(true)
  })

  it('turns on with a platform passkey that must check the owner', async () => {
    const { create } = phone()
    expect(await setUpLock()).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    const opts = (create.mock.calls[0] as unknown as [CredentialCreationOptions])[0].publicKey!
    expect(opts.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' })
    expect(opts.attestation).toBe('none')
    expect(locked()).toBe(true)
  })

  it('opens only for the phone’s owner, with its own passkey', async () => {
    saveJSON('pi.lock.v1', { id: 'AQIDBA', made: 1 })
    const { get } = phone({ verified: false })
    expect(await unlock()).toBe(false)
    const allowed = (get.mock.calls[0] as unknown as [CredentialRequestOptions])[0].publicKey!.allowCredentials![0]
    expect([...new Uint8Array(allowed.id as ArrayBuffer)]).toEqual([1, 2, 3, 4])
    phone({ verified: true })
    expect(await unlock()).toBe(true)
  })

  it('can be cleared by someone who cannot unlock it, taking everything on the phone with it', () => {
    saveJSON('pi.lock.v1', { id: 'AQIDBA', made: 1 })
    save('pi.device.v1', 'v1.pass')
    saveJSON('pi.history.v1', { answers: [], skips: [] })
    forgetLocal('2026-10-27', true)
    removeLock()
    expect(locked()).toBe(false)
    expect(localStorage.getItem('pi.device.v1')).toBeNull()
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
  })
})
