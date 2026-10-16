import { useEffect, useState } from 'react'
import {
  deleteEverywhere,
  forgetLocal,
  getKept,
  insteadCount,
  wordsBetween,
  type Deleted,
  type Kept as ServerKept,
} from './api'
import { loadMoves } from './moves'
import { loadPrefs } from './prefs'
import { loadHistory } from './profile'

// "What I keep" (review of 2026-10-15): everything the app holds about this
// person, on this phone and on the server, how long each is kept, and the
// two ways to delete it. Every number is counted live; nothing is estimated.

type Server = { kind: 'loading' } | { kind: 'none' } | { kind: 'ready'; k: ServerKept } | { kind: 'error' }
type Step = 'idle' | 'confirm-here' | 'confirm-everywhere' | 'deleting' | 'failed'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const weeks = (days: number) => (days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day'))

function onPhone() {
  return {
    words: wordsBetween('0000-01-01', '9999-12-31').length,
    instead: insteadCount(),
    answers: loadHistory().answers.length,
    steps: loadMoves().length,
    wordsDays: loadPrefs().wordsDays,
  }
}

export function KeptScreen({ today, onBack }: { today: string; onBack: () => void }) {
  const [phone, setPhone] = useState(onPhone)
  const [server, setServer] = useState<Server>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState<Step>('idle')
  const [done, setDone] = useState<{ where: 'here' | 'everywhere'; deleted?: Deleted } | null>(null)

  useEffect(() => {
    let live = true
    getKept().then(
      (k) => live && setServer(k ? { kind: 'ready', k } : { kind: 'none' }),
      () => live && setServer({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [attempt])

  function deleteHere() {
    forgetLocal(today)
    setPhone(onPhone())
    setStep('idle')
    setDone({ where: 'here' })
  }

  async function deleteAll() {
    setStep('deleting')
    try {
      const deleted = await deleteEverywhere(today)
      setPhone(onPhone())
      setServer({ kind: 'none' })
      setStep('idle')
      setDone({ where: 'everywhere', deleted })
    } catch {
      setStep('failed')
    }
  }

  return (
    <section className="screen kept" aria-labelledby="kept-title">
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      <h2 id="kept-title" className="done-title">
        What I keep
      </h2>
      <p className="muted">
        No name, no email, no account. Here is everything I hold about you, where it is, and how long it stays.
      </p>

      <div className="notice" role="group" aria-label="On this phone">
        <p className="eyebrow">On this phone</p>
        <ul className="kept-list">
          <li>
            <strong>{plural(phone.words, 'answer')} in your own words.</strong>{' '}
            {`Never sent. Kept ${weeks(phone.wordsDays)}; you can change that in Settings.`}
          </li>
          {phone.instead > 0 && (
            <li>
              <strong>{plural(phone.instead, 'line')} on cards that weren't you.</strong>{' '}
              {`What you wrote after "Not me". Never sent. Kept as long as your own words.`}
            </li>
          )}
          <li>
            <strong>{plural(phone.answers, 'answer')} in your history.</strong> Which answer you chose, its theme and
            depth, and whether its card was you, so I can choose questions that interest you and tie new answers to earlier
            ones. Kept 60 days.
          </li>
          <li>
            <strong>{plural(phone.steps, 'small step')}.</strong> The ones you said you'd try, and how they went.
          </li>
        </ul>
      </div>

      <div className="notice" role="group" aria-label="On the server">
        <p className="eyebrow">On the server</p>
        {server.kind === 'loading' && <p className="muted">Checking…</p>}
        {server.kind === 'none' && <p>Nothing. This phone has no answers on the server.</p>}
        {server.kind === 'error' && (
          <p role="alert">
            I couldn't reach the server to count what it keeps.{' '}
            <button type="button" className="text-button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </p>
        )}
        {server.kind === 'ready' && <ServerList k={server.k} />}
      </div>

      {done?.where === 'here' && (
        <p role="status">Deleted from this phone. What the server keeps for your mirror is still there.</p>
      )}
      {done?.where === 'everywhere' && done.deleted && (
        <p role="status">
          Everything is deleted, here and on the server: {plural(done.deleted.answers, 'answer')},{' '}
          {plural(done.deleted.steps, 'small step')}, {plural(done.deleted.weeklyNotes, 'weekly note')} and{' '}
          {plural(done.deleted.votes, 'vote')}. Totals already counted stay, with nothing to link them to you.
        </p>
      )}

      {step === 'idle' && (
        <div className="kept-actions">
          <button type="button" className="option" onClick={() => setStep('confirm-here')}>
            Delete from this phone
          </button>
          <button type="button" className="option danger" onClick={() => setStep('confirm-everywhere')}>
            Delete everywhere
          </button>
        </div>
      )}
      {step === 'confirm-here' && (
        <div className="notice" role="group" aria-label="Delete from this phone">
          <p>
            This clears your own words, your history, your small steps and your settings from this phone. Your mirror on
            the server stays.
          </p>
          <div className="confirm">
            <button type="button" className="option danger" onClick={deleteHere}>
              Yes, clear this phone
            </button>
            <button type="button" className="text-button" onClick={() => setStep('idle')}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {step === 'confirm-everywhere' && (
        <div className="notice" role="group" aria-label="Delete everywhere">
          <p>
            This deletes your answers, your own words, your small steps and weekly notes, here and on the server, and
            gives this phone a fresh start. It can't be undone.
          </p>
          <div className="confirm">
            <button type="button" className="option danger" onClick={deleteAll}>
              Yes, delete it all
            </button>
            <button type="button" className="text-button" onClick={() => setStep('idle')}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {step === 'deleting' && <p role="status">Deleting…</p>}
      {step === 'failed' && (
        <p role="alert">
          I couldn't reach the server, so nothing was deleted.{' '}
          <button type="button" className="text-button" onClick={deleteAll}>
            Try again
          </button>
        </p>
      )}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

function ServerList({ k }: { k: ServerKept }) {
  const { kept, keptFor } = k
  if (kept.answers + kept.steps + kept.weeklyNotes + kept.votes === 0) {
    return <p>Nothing. This phone has no answers on the server.</p>
  }
  return (
    <ul className="kept-list">
      <li>
        <strong>{plural(kept.answers, 'answer')}</strong>
        {kept.privateAnswers > 0 && `, ${kept.privateAnswers} of them private`}, under an anonymous key, for your mirror.
        For a private one I keep only that you answered. Kept {weeks(keptFor.answersDays)}.
      </li>
      <li>
        <strong>{plural(kept.steps, 'small step')}</strong> you started. Kept {weeks(keptFor.answersDays)}.
      </li>
      <li>
        <strong>{plural(kept.weeklyNotes, 'weekly note')}</strong> for your month, quarter and year: counts and your
        clearest answers, never your words. Kept {plural(Math.round(keptFor.weeklyNotesDays / 30), 'month')}.
      </li>
      <li>
        <strong>{plural(kept.votes, 'vote')}</strong> with no key that links them to each other, only there so you
        can't be counted twice. Kept {weeks(keptFor.votesDays)}, to the hour they came in.
      </li>
    </ul>
  )
}
