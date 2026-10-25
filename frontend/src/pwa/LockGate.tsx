import { useEffect, useRef, useState, type ReactNode } from 'react'
import { forgetLocal } from '../api'
import { lockAvailable, locked, RELOCK_MS, removeLock, setUpLock, unlock } from './lock'

// The lock screen in front of the app, and its switch in Settings (lock.ts).

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LockGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() => !locked())
  const hiddenAt = useRef<number | null>(null)
  useEffect(() => {
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
    forgetLocal(today(), true)
    removeLock()
    onOpen()
  }

  return (
    <main className="page lock">
      <section className="lock-screen" aria-labelledby="lock-title">
        <p className="brand">The Persona Index</p>
        <h1 id="lock-title" className="done-title">
          Locked
        </h1>
        <p className="muted">Use your fingerprint, face or phone PIN to open it.</p>
        <button type="button" className="option" onClick={tryUnlock} disabled={busy}>
          Unlock
        </button>
        {failed && <p role="alert">That didn't open it. Please try again.</p>}
        {stuck === 'no' && (
          <button type="button" className="text-button" onClick={() => setStuck('help')}>
            Can't unlock?
          </button>
        )}
        {stuck === 'help' && (
          <div className="notice" role="group" aria-label="Can't unlock">
            <p>
              If this phone no longer recognises you, you can clear the app from it and start fresh. That deletes
              everything it keeps here, its pass included. If your backup is on, your 12 words bring it all back.
            </p>
            <div className="confirm">
              <button type="button" className="option danger" onClick={() => setStuck('confirm')}>
                Clear this phone
              </button>
              <button type="button" className="text-button" onClick={() => setStuck('no')}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {stuck === 'confirm' && (
          <div className="notice" role="group" aria-label="Clear this phone">
            <p>Everything the app keeps on this phone will be deleted. It can't be undone without your backup.</p>
            <div className="confirm">
              <button type="button" className="option danger" onClick={clearPhone}>
                Yes, clear it
              </button>
              <button type="button" className="text-button" onClick={() => setStuck('no')}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

export function LockSettings() {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [on, setOn] = useState(locked)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    lockAvailable().then((a) => live && setAvailable(a))
    return () => {
      live = false
    }
  }, [])
  if (!available && !on) return null

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
    <fieldset className="notice" aria-busy={busy}>
      <legend className="eyebrow">Lock</legend>
      <p className="muted">
        {on
          ? "On. I ask for your fingerprint, face or phone PIN when the app opens, and when you come back after five minutes away."
          : 'Ask for your fingerprint, face or phone PIN before the app opens.'}{' '}
        It keeps out someone who picks up your phone while it's unlocked. It doesn't scramble what's stored here; your
        phone's own lock protects that.
      </p>
      <div className="confirm">
        {on ? (
          <button type="button" className="text-button" onClick={turnOff} disabled={busy}>
            Turn off the lock
          </button>
        ) : (
          <button type="button" className="option" onClick={turnOn} disabled={busy}>
            Turn on the lock
          </button>
        )}
      </div>
      {note && <p role="status">{note}</p>}
    </fieldset>
  )
}
