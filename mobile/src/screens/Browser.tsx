// What only the website has, drawn in React Native for when this app is the
// website: the optional lock (a passkey asks for the fingerprint, face or
// phone PIN, shared pwa/lock.ts) and the invite to add it to the home screen
// (shared pwa/install.ts). On a phone or a Mac build each renders nothing:
// there the phone's own lock and the app icon already do these jobs.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { forgetLocal } from '@shared/api'
import { loadHistory } from '@shared/profile'
import { canPrompt, inviteDue, iosSafari, noteInstall, onInstallChange, promptInstall } from '@shared/pwa/install'
import { lockAvailable, locked, RELOCK_MS, removeLock, setUpLock, unlock } from '@shared/pwa/lock'
import { useTheme } from '../theme'
import { Button, Page, T, Tinted } from '../ui/kit'
import { Logo } from '../ui/Logo'

const web = Platform.OS === 'web'

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The lock screen in front of the app, again after five minutes away.
export function WebLockGate({ children, onLocked }: { children: ReactNode; onLocked?: () => void }) {
  const [open, setOpen] = useState(() => !web || !locked())
  const hiddenAt = useRef<number | null>(null)
  // The launch shouldn't wait for today when the lock screen is what shows.
  useEffect(() => {
    if (!open) onLocked?.()
  }, [open, onLocked])
  useEffect(() => {
    if (!web) return
    const seen = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= RELOCK_MS && locked()) setOpen(false)
    }
    document.addEventListener('visibilitychange', seen)
    return () => document.removeEventListener('visibilitychange', seen)
  }, [])
  return open ? <>{children}</> : <LockScreen onOpen={() => setOpen(true)} />
}

function LockScreen({ onOpen }: { onOpen: () => void }) {
  const p = useTheme()
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stuck, setStuck] = useState<'no' | 'help' | 'confirm'>('no')

  async function tryUnlock() {
    setBusy(true)
    setFailed(false)
    const ok = await unlock()
    setBusy(false)
    if (ok) onOpen()
    else setFailed(true)
  }

  function clearPhone() {
    forgetLocal(todayIso(), true)
    removeLock()
    onOpen()
  }

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Page>
        <Logo size={36} />
        <T v="display">Locked</T>
        <T tone="muted">Use your fingerprint, face or phone PIN to open it.</T>
        <Button wide label="Unlock" busy={busy} onPress={tryUnlock} />
        {failed && <T tone="danger">That didn't open it. Please try again.</T>}
        {stuck === 'no' && <Button kind="text" label="Can't unlock?" onPress={() => setStuck('help')} />}
        {stuck === 'help' && (
          <Tinted tone="plain">
            <T>
              If this phone no longer recognises you, you can clear the app from it and start fresh. That deletes everything it keeps here, its pass included. If your
              backup is on, your 12 words bring it all back.
            </T>
            <Button kind="danger" label="Clear this phone" onPress={() => setStuck('confirm')} />
            <Button kind="text" label="Cancel" onPress={() => setStuck('no')} />
          </Tinted>
        )}
        {stuck === 'confirm' && (
          <Tinted tone="rose">
            <T>Everything the app keeps on this phone will be deleted. It can't be undone without your backup.</T>
            <Button kind="danger" label="Yes, clear it" onPress={clearPhone} />
            <Button kind="text" label="Cancel" onPress={() => setStuck('no')} />
          </Tinted>
        )}
      </Page>
    </View>
  )
}

// The lock's switch, in Settings, where the browser can make a passkey.
export function WebLockSettings() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [on, setOn] = useState(() => web && locked())
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!web) return
    let live = true
    lockAvailable().then((a) => live && setAvailable(a))
    return () => {
      live = false
    }
  }, [])
  if (!web || (!available && !on)) return null

  async function turnOn() {
    setBusy(true)
    setNote(null)
    const ok = await setUpLock()
    setBusy(false)
    setOn(locked())
    if (!ok) setNote("The lock wasn't set up. Nothing changed.")
  }

  async function turnOff() {
    setBusy(true)
    setNote(null)
    const ok = await unlock()
    setBusy(false)
    if (!ok) return setNote("That didn't match, so the lock stays on.")
    removeLock()
    setOn(false)
  }

  return (
    <View style={{ gap: 10 }}>
      <T v="eyebrow">Lock</T>
      <T v="small" tone="muted">
        {on
          ? 'On. I ask for your fingerprint, face or phone PIN when the app opens, and when you come back after five minutes away.'
          : 'Ask for your fingerprint, face or phone PIN before the app opens.'}{' '}
        It keeps out someone who picks up your phone while it's unlocked. It doesn't scramble what's stored here; your phone's own lock protects that.
      </T>
      {on ? <Button kind="text" label="Turn off the lock" busy={busy} onPress={turnOff} /> : <Button small kind="soft" label="Turn on the lock" busy={busy} onPress={turnOn} />}
      {note && <T v="small">{note}</T>}
    </View>
  )
}

const firstUse = () =>
  loadHistory()
    .answers.map((a) => a.date)
    .sort()[0] ?? null

// The invite to add the site to the home screen, once a week of answers is
// behind someone.
export function InstallInvite({ today }: { today: string }) {
  const [, setVersion] = useState(0)
  const [hidden, setHidden] = useState(false)
  useEffect(() => (web ? onInstallChange(() => setVersion((v) => v + 1)) : undefined), [])
  if (!web || hidden || !inviteDue(today, firstUse())) return null
  const ios = iosSafari()
  if (!ios && !canPrompt()) return null

  const answer = (a: 'added' | 'later') => {
    noteInstall(today, a)
    setHidden(true)
  }

  return (
    <Tinted>
      <T v="h3">Keep me on your home screen</T>
      <T v="small" tone="muted">
        You've been coming back for a week. On your home screen I open like an app, work without a connection, and your phone is far less likely to clear what you've kept
        here.
      </T>
      {ios && <T v="small">In Safari, tap the Share button, then “Add to Home Screen”.</T>}
      {ios ? (
        <Button small label="I've added it" onPress={() => answer('added')} />
      ) : (
        <Button small label="Add to home screen" onPress={async () => answer((await promptInstall()) === 'added' ? 'added' : 'later')} />
      )}
      <Button kind="text" label="Not now" onPress={() => answer('later')} />
    </Tinted>
  )
}
