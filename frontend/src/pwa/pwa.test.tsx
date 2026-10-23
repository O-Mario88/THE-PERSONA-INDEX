import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { save, saveJSON } from '../storage'
import { inviteDue, noteInstall, watchInstall } from './install'
import { InstallInvite } from './InstallInvite'
import { LockGate, LockSettings } from './Lock'
import { locked, RELOCK_MS } from './lock'
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

  // Runs the worker's code against a stand-in for its global scope, with
  // caches held in a map and the network on or off.
  function worker(online = false) {
    const handlers: Record<string, (e: unknown) => void> = {}
    const kept = new Map<string, string>([['/', 'the app page'], ['/assets/index-AbC123.js', 'the script']])
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
  })

  it('names a new cache for each version', () => {
    expect(serviceWorker('abc', ['/'])).toContain('const VERSION = "abc"')
    expect(serviceWorker('abc', ['/', '/x.js'])).toContain('const PRECACHE = ["/","/x.js"]')
  })
})

describe('the home screen invite', () => {
  const history = (first: string) =>
    saveJSON('pi.history.v1', { answers: [{ date: first, questionId: 'q', theme: 'habits', depth: 2, traits: {} }], skips: [] })

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

  it("uses the browser's own prompt where there is one", async () => {
    history('2026-10-10')
    const stop = watchInstall()
    const { container } = render(<InstallInvite today="2026-10-23" />)
    expect(container).toBeEmptyDOMElement() // no offer from the browser yet

    const prompt = vi.fn(async () => {})
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    })
    act(() => {
      window.dispatchEvent(offer)
    })
    expect(offer.defaultPrevented).toBe(true)
    expect(screen.getByRole('heading', { name: 'Keep me on your home screen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add to home screen' }))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('pi.install.v1')!)).toMatchObject({ date: '2026-10-23', answer: 'added' })
    stop()
  })

  it('says how on an iPhone, where Safari has no prompt', () => {
    history('2026-10-10')
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    )
    render(<InstallInvite today="2026-10-23" />)
    expect(screen.getByText('In Safari, tap the Share button, then “Add to Home Screen”.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('heading', { name: 'Keep me on your home screen' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.install.v1')!)).toMatchObject({ answer: 'later', times: 1 })
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

  it('stays out of Settings on a phone that cannot check its owner', async () => {
    phone({ available: false })
    const { container } = render(<LockSettings />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })

  it('turns on in Settings, with copy that says what it does not do', async () => {
    const { create } = phone()
    render(<LockSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on the lock' }))
    await screen.findByRole('button', { name: 'Turn off the lock' })
    expect(create).toHaveBeenCalledTimes(1)
    const opts = (create.mock.calls[0] as unknown as [CredentialCreationOptions])[0].publicKey!
    expect(opts.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' })
    expect(opts.attestation).toBe('none')
    expect(locked()).toBe(true)
    expect(screen.getByRole('group')).toHaveTextContent("It doesn't scramble what's stored here")
  })

  it('opens only for the phone’s owner, and locks again after five minutes away', async () => {
    saveJSON('pi.lock.v1', { id: 'AQIDBA', made: 1 })
    const { get } = phone({ verified: false })
    render(
      <LockGate>
        <p>The app</p>
      </LockGate>,
    )
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't open it.")
    const allowed = (get.mock.calls[0] as unknown as [CredentialRequestOptions])[0].publicKey!.allowCredentials![0]
    expect([...new Uint8Array(allowed.id as ArrayBuffer)]).toEqual([1, 2, 3, 4])

    phone({ verified: true })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByText('The app')).toBeInTheDocument()

    vi.useFakeTimers({ toFake: ['Date'] })
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    vi.setSystemTime(Date.now() + RELOCK_MS - 1000)
    visibility.mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByText('The app')).toBeInTheDocument()

    visibility.mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    vi.setSystemTime(Date.now() + RELOCK_MS)
    visibility.mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.queryByText('The app')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Locked' })).toBeInTheDocument()
  })

  it('can be cleared by someone who cannot unlock it, taking everything on the phone with it', () => {
    saveJSON('pi.lock.v1', { id: 'AQIDBA', made: 1 })
    save('pi.device.v1', 'v1.pass')
    saveJSON('pi.history.v1', { answers: [], skips: [] })
    phone()
    render(
      <LockGate>
        <p>The app</p>
      </LockGate>,
    )
    fireEvent.click(screen.getByRole('button', { name: "Can't unlock?" }))
    expect(screen.getByRole('group', { name: "Can't unlock" })).toHaveTextContent('your 12 words bring it all back')
    fireEvent.click(screen.getByRole('button', { name: 'Clear this phone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear it' }))
    expect(screen.getByText('The app')).toBeInTheDocument()
    expect(localStorage.getItem('pi.device.v1')).toBeNull()
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
    expect(locked()).toBe(false)
  })
})
