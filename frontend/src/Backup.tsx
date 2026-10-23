import { useEffect, useState, type FormEvent } from 'react'
import { keepStorage } from './pwa/install'
import { onChange } from './storage'
import {
  newPhrase,
  normalisePhrase,
  phraseProblem,
  restore,
  setWords,
  turnOff,
  turnOn,
  vaultState,
  type PhraseProblem,
  type VaultState,
} from './vault'

// The backup in Settings (Phase 3 of the review of 2026-10-15): off until
// the person turns it on, with a 12-word phrase they write down. The phrase
// is the only way back in; there is no email and no account (vault.ts).

type Mode =
  | { kind: 'idle' }
  | { kind: 'new'; phrase: string; words: boolean; step: 'show' | 'check'; ask: [number, number] }
  | { kind: 'show' }
  | { kind: 'confirm-off' }
  | { kind: 'restore' }

function useVault(): VaultState | null {
  const [st, setSt] = useState(vaultState)
  useEffect(() => onChange((k) => k === 'pi.vault.v1' && setSt(vaultState())), [])
  return st
}

// Two different word positions to check, 1 to 12.
function twoPositions(): [number, number] {
  const a = 1 + Math.floor(Math.random() * 12)
  let b = 1 + Math.floor(Math.random() * 11)
  if (b >= a) b++
  return a < b ? [a, b] : [b, a]
}

const ordinal = (n: number) => `word ${n}`

export function BackupSettings() {
  const st = useVault()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function start() {
    setError(null)
    setMode({ kind: 'new', phrase: newPhrase(), words: false, step: 'show', ask: twoPositions() })
  }

  async function off() {
    setBusy(true)
    setError(null)
    try {
      await turnOff()
      setMode({ kind: 'idle' })
    } catch {
      setError("I couldn't reach the server, so your backup is still there. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="notice backup" aria-busy={busy}>
      <legend className="eyebrow">Your backup</legend>

      {mode.kind === 'new' && mode.step === 'show' && (
        <>
          <p>
            Write these 12 words down, in order, on paper. They are the only way back to your backup: there is no email
            and no account, and I can't recover them for you. Anyone who has them can open it, so keep them somewhere
            private.
          </p>
          <Phrase phrase={mode.phrase} />
          <label className="switch">
            <input type="checkbox" checked={mode.words} onChange={(e) => setMode({ ...mode, words: e.target.checked })} />
            Include your own words
          </label>
          <p className="muted">
            Otherwise your own words never leave this phone. In the backup they are sealed like everything else.
          </p>
          <div className="confirm">
            <button type="button" className="option" onClick={() => setMode({ ...mode, step: 'check' })}>
              I've written them down
            </button>
            <button type="button" className="text-button" onClick={() => setMode({ kind: 'idle' })}>
              Not now
            </button>
          </div>
        </>
      )}

      {mode.kind === 'new' && mode.step === 'check' && (
        <CheckPhrase
          phrase={mode.phrase}
          ask={mode.ask}
          busy={busy}
          onBack={() => setMode({ ...mode, step: 'show' })}
          onChecked={async () => {
            setBusy(true)
            try {
              await turnOn(mode.phrase, mode.words)
              keepStorage()
              setMode({ kind: 'idle' })
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {mode.kind === 'restore' && <Restore onCancel={() => setMode({ kind: 'idle' })} />}

      {mode.kind !== 'new' && mode.kind !== 'restore' && !st && (
        <>
          <p className="muted">
            Off. Everything stays on this phone, so a lost or new phone starts empty. Turn it on and your notebook,
            history and settings are sealed on this phone and kept on the server, where I can't open them.
          </p>
          <div className="confirm">
            <button type="button" className="option" onClick={start}>
              Back up with a 12-word phrase
            </button>
            <button type="button" className="text-button" onClick={() => setMode({ kind: 'restore' })}>
              I have a phrase: restore
            </button>
          </div>
        </>
      )}

      {mode.kind !== 'new' && mode.kind !== 'restore' && st && (
        <>
          <p className="muted">
            On. Sealed on this phone before it's sent, so I can't open it or tell whose it is.{' '}
            <span role="status">{backupStatus(st)}</span>
          </p>
          <label className="switch">
            <input type="checkbox" checked={st.words} onChange={(e) => setWords(e.target.checked)} />
            Include your own words
          </label>
          {mode.kind === 'show' ? (
            <>
              <Phrase phrase={st.phrase} />
              <button type="button" className="text-button" onClick={() => setMode({ kind: 'idle' })}>
                Hide my phrase
              </button>
            </>
          ) : mode.kind === 'confirm-off' ? (
            <div className="notice" role="group" aria-label="Turn off backup">
              <p>
                This deletes your backup from the server, and your phrase will open nothing. Everything stays on this
                phone.
              </p>
              <div className="confirm">
                <button type="button" className="option danger" onClick={off} disabled={busy}>
                  Yes, turn it off
                </button>
                <button type="button" className="text-button" onClick={() => setMode({ kind: 'idle' })}>
                  Keep it on
                </button>
              </div>
            </div>
          ) : (
            <div className="confirm">
              <button type="button" className="option" onClick={() => setMode({ kind: 'show' })}>
                Show my phrase
              </button>
              <button type="button" className="text-button" onClick={() => setMode({ kind: 'confirm-off' })}>
                Turn off backup
              </button>
            </div>
          )}
        </>
      )}

      {error && <p role="alert">{error}</p>}
    </fieldset>
  )
}

function backupStatus(st: VaultState): string {
  if (st.dirty && !st.savedAt) return 'Waiting for a connection to make the first backup.'
  if (st.dirty) return 'Some changes are waiting to be backed up.'
  if (!st.savedAt) return 'Backed up.'
  const at = new Date(st.savedAt)
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay
    ? `Last backed up today at ${time}.`
    : `Last backed up on ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
}

function Phrase({ phrase }: { phrase: string }) {
  return (
    <ol className="phrase" aria-label="Your 12-word phrase">
      {phrase.split(' ').map((w, i) => (
        <li key={i}>
          <span className="phrase-n" aria-hidden="true">
            {i + 1}
          </span>
          <span className="phrase-word">{w}</span>
        </li>
      ))}
    </ol>
  )
}

function CheckPhrase({
  phrase,
  ask,
  busy,
  onBack,
  onChecked,
}: {
  phrase: string
  ask: [number, number]
  busy: boolean
  onBack: () => void
  onChecked: () => Promise<void>
}) {
  const words = phrase.split(' ')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [wrong, setWrong] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const bad = [ask[0], ask[1]].find((n, i) => normalisePhrase([a, b][i]) !== words[n - 1])
    setWrong(bad ?? null)
    if (bad) return
    setFailed(false)
    try {
      await onChecked()
    } catch {
      setFailed(true)
    }
  }

  return (
    <form onSubmit={submit}>
      <p>To be sure your note is right, type two of the words from it.</p>
      <label className="field">
        <span>What is {ordinal(ask[0])}?</span>
        <input value={a} onChange={(e) => setA(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </label>
      <label className="field">
        <span>And {ordinal(ask[1])}?</span>
        <input value={b} onChange={(e) => setB(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </label>
      {wrong && <p role="alert">That isn't {ordinal(wrong)}. Have another look at your note.</p>}
      {failed && <p role="alert">Something went wrong turning the backup on. Please try again.</p>}
      <div className="confirm">
        <button type="submit" className="option" disabled={busy}>
          Turn on backup
        </button>
        <button type="button" className="text-button" onClick={onBack}>
          Show the words again
        </button>
      </div>
    </form>
  )
}

function problemText(p: PhraseProblem): string {
  switch (p.kind) {
    case 'count':
      return p.words === 0 ? 'Type your 12 words, in order.' : `That's ${p.words} ${p.words === 1 ? 'word' : 'words'}. A phrase has 12.`
    case 'word':
      return `Word ${p.at}, “${p.word}”, isn't one of the phrase words. Check its spelling against your note.`
    case 'checksum':
      return "Those words don't fit together as a phrase. Check their order against your note."
  }
}

function Restore({ onCancel }: { onCancel: () => void }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const p = phraseProblem(text)
    if (p) {
      setProblem(problemText(p))
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const r = await restore(text)
      if (r === 'restored') setDone(true)
      else if (r === 'none')
        setProblem("There's no backup for this phrase. Check it against your note; if the backup was turned off, there's nothing to restore.")
      else setProblem("That backup couldn't be opened. Nothing on this phone was changed.")
    } catch {
      setProblem("I couldn't reach the server, so nothing was changed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div role="status">
        <p>Everything from your backup is back on this phone, and it carries on backing up under the same phrase.</p>
        <button type="button" className="option" onClick={() => window.location.reload()}>
          Carry on
        </button>
      </div>
    )
  }
  return (
    <form onSubmit={submit}>
      <p>
        Restoring brings back the answers, notebook and settings in your backup, and joins them with anything already
        on this phone.
      </p>
      <label className="field">
        <span>Your 12 words</span>
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      {problem && <p role="alert">{problem}</p>}
      <div className="confirm">
        <button type="submit" className="option" disabled={busy}>
          {busy ? 'Restoring…' : 'Restore'}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
