// Adding the app to the home screen (Phase 3 of the review of 2026-10-15):
// offered once, after a week of use, never on the first day. It opens like
// an app, works without a connection (the service worker), and the phone is
// far less likely to clear what is kept: Safari can clear a website's
// storage after seven days without a visit, but not a home screen app's.

import { addDays, loadJSON, saveJSON } from '../storage'

const KEY = 'pi.install.v1'
const AGAIN_AFTER_DAYS = 28

export type InstallRecord = { date: string; answer: 'added' | 'later' | 'no'; times: number }

// The browser's own install prompt, where it offers one (Chrome, Edge,
// Samsung Internet). Safari has none: there the invite says how instead.
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: PromptEvent | null = null
const listeners = new Set<() => void>()

export function watchInstall(): () => void {
  if (typeof window === 'undefined') return () => {}
  const offer = (e: Event) => {
    e.preventDefault()
    deferred = e as PromptEvent
    listeners.forEach((fn) => fn())
  }
  const installed = () => {
    deferred = null
    keepStorage()
    listeners.forEach((fn) => fn())
  }
  window.addEventListener('beforeinstallprompt', offer)
  window.addEventListener('appinstalled', installed)
  return () => {
    window.removeEventListener('beforeinstallprompt', offer)
    window.removeEventListener('appinstalled', installed)
  }
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const canPrompt = () => deferred !== null

export function standalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

// Safari on an iPhone or iPad, where "Add to Home Screen" is in the Share menu.
export function iosSafari(): boolean {
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export const installRecord = () => loadJSON(KEY) as InstallRecord | null

// inviteDue says whether to offer it today: never once added or declined
// twice, never in the first week, and a "not now" waits four weeks.
export function inviteDue(today: string, firstUse: string | null): boolean {
  if (standalone() || !firstUse || firstUse > addDays(today, -7)) return false
  const r = installRecord()
  if (!r) return true
  if (r.answer !== 'later' || r.times >= 2) return false
  return r.date <= addDays(today, -AGAIN_AFTER_DAYS)
}

export function noteInstall(today: string, answer: InstallRecord['answer']) {
  saveJSON(KEY, { date: today, answer, times: (installRecord()?.times ?? 0) + 1 } satisfies InstallRecord)
}

// promptInstall shows the browser's own prompt and says what the person chose.
export async function promptInstall(): Promise<'added' | 'later' | 'unavailable'> {
  const e = deferred
  if (!e) return 'unavailable'
  deferred = null
  await e.prompt()
  const { outcome } = await e.userChoice
  if (outcome === 'accepted') keepStorage()
  return outcome === 'accepted' ? 'added' : 'later'
}

// keepStorage asks the browser not to clear the app's storage when the phone
// runs low on space. Asked when someone keeps something of their own, turns
// the backup on or adds the app; the browser decides, and may say nothing.
export function keepStorage() {
  try {
    const s = navigator.storage
    if (!s?.persist) return
    void s.persisted().then((yes) => (yes ? true : s.persist())).catch(() => {})
  } catch {
    // not offered here
  }
}
