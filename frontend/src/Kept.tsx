import { useEffect, useRef, useState } from 'react'
import {
  deleteEverywhere,
  forgetLocal,
  getKept,
  insteadCount,
  wordsBetween,
  type Deleted,
  type Kept as ServerKept,
} from './api'
import { DownloadButtons } from './BookDownloads'
import { loadMoves } from './moves'
import { notebookCount } from './notebook'
import { loadPrefs } from './prefs'
import { loadHistory } from './profile'
import { deleteBackup, vaultState } from './vault'
import { useAccount } from './useAccount'

// "What I keep" (review of 2026-10-15): everything the app holds about this
// person, on this phone and on the server, how long each is kept, and the
// two ways to delete it, and a copy to take away. Every number is counted
// live; nothing is estimated.

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
    notebook: notebookCount(),
    wordsDays: loadPrefs().wordsDays,
    backup: vaultState(),
  }
}

export function KeptScreen({ today, mild, onBack }: { today: string; mild: boolean; onBack: () => void }) {
  const [phone, setPhone] = useState(onPhone)
  const signedIn = !!useAccount()
  const [server, setServer] = useState<Server>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [step, setStep] = useState<Step>('idle')
  // Set once the backup is deleted, so a second try after a failure still says so.
  const backupGone = useRef(false)
  const [done, setDone] = useState<{ where: 'here' | 'everywhere'; deleted?: Deleted; backup?: boolean } | null>(
    null,
  )

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
    const backup = !!phone.backup
    forgetLocal(today)
    setPhone(onPhone())
    setStep('idle')
    setDone({ where: 'here', backup })
  }

  // The backup goes first: it is the one copy that is not tied to this
  // phone's pass, so once the pass is gone nothing could find it again but
  // the 12 words. If the server can't be reached, nothing is deleted.
  async function deleteAll() {
    setStep('deleting')
    try {
      if (vaultState()) {
        await deleteBackup()
        backupGone.current = true
      }
      const deleted = await deleteEverywhere(today)
      setPhone(onPhone())
      setServer({ kind: 'none' })
      setStep('idle')
      setDone({ where: 'everywhere', deleted, backup: backupGone.current })
    } catch {
      setStep('failed')
    }
  }

  const backupDays = server.kind === 'ready' ? server.k.keptFor.backupDays : undefined

  return (
    <section className="screen kept" aria-labelledby="kept-title">
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      <h2 id="kept-title" className="done-title">
        What I keep
      </h2>
      <p className="muted">
        {signedIn
          ? 'You’re signed in: your account keeps a name, a handle and how you sign in (Account lists it all). Here is everything else I hold about you, where it is, and how long it stays.'
          : 'No name, no email, no account. Here is everything I hold about you, where it is, and how long it stays.'}
      </p>

      <div className="notice" role="group" aria-label="On this phone">
        <p className="eyebrow">On this phone</p>
        <ul className="kept-list">
          <li>
            <strong>{plural(phone.words, 'answer')} in your own words.</strong>{' '}
            {phone.backup?.words ? 'Only sealed in your backup, never sent as they are.' : 'Never sent.'}{' '}
            {`Kept ${weeks(phone.wordsDays)}; you can change that in Settings.`}
          </li>
          {phone.instead > 0 && (
            <li>
              <strong>{plural(phone.instead, 'line')} on cards that weren't you.</strong>{' '}
              {`What you wrote after "Not me". Kept like your own words.`}
            </li>
          )}
          <li>
            <strong>{plural(phone.notebook, 'entry', 'entries')} in your notebook.</strong> The cards you kept, your
            good things, Sunday sentences, plans and names, until you remove them. The words of a plan never leave this
            phone; only whether you did it goes to your mirror.
          </li>
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
        {phone.backup && (
          <p>
            <strong>Your backup</strong>, sealed on this phone before it was sent. Only your 12 words open it: I can't,
            and I can't tell whose it is.
            {backupDays ? ` Kept until no phone has opened or changed it for ${plural(Math.round(backupDays / 30), 'month')}.` : ''}
          </p>
        )}
      </div>

      <div className="notice" role="group" aria-label="Take a copy">
        <p className="eyebrow">Take a copy</p>
        <p className="muted">
          Your book is a page with your notebook, answers and steps, to read or print. The data file holds everything
          above, as it is kept.
        </p>
        <DownloadButtons today={today} mild={mild} data />
      </div>

      {done?.where === 'here' && (
        <p role="status">
          Deleted from this phone. What the server keeps for your mirror is still there
          {done.backup ? ', and so is your backup: your 12 words can bring it back' : ''}.
        </p>
      )}
      {done?.where === 'everywhere' && done.deleted && (
        <p role="status">
          Everything is deleted, here and on the server: {deletedList(done.deleted)}
          {done.backup ? ', and your backup' : ''}. Totals already counted stay, with nothing to link them to you.
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
            This clears your own words, your history, your notebook, your small steps and your settings from this phone.
            Your mirror on the server stays
            {phone.backup
              ? ', and so does your backup. Your 12 words can bring it all back, so keep them safe or turn backup off first.'
              : '.'}
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
            This deletes your answers, your own words, your notebook, your small steps, plan checks and weekly notes
            {phone.backup ? ', and your backup' : ''}, here and on the server, and gives this phone a fresh start. It
            can't be undone, so take a copy first if you want one.
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

// "12 answers, 2 small steps, 1 weekly note and 12 votes": plan checks and
// What Helped reports only when there were some.
function deletedList(d: Deleted): string {
  const parts = [
    plural(d.answers, 'answer'),
    plural(d.steps, 'small step'),
    ...(d.planChecks ? [plural(d.planChecks, 'plan check')] : []),
    plural(d.weeklyNotes, 'weekly note'),
    ...(d.reports ? [`${plural(d.reports, 'report')} on steps`] : []),
    plural(d.votes, 'vote'),
  ]
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

function ServerList({ k }: { k: ServerKept }) {
  const { kept, keptFor } = k
  if (kept.answers + kept.steps + (kept.planChecks ?? 0) + kept.weeklyNotes + kept.votes + (kept.reports ?? 0) === 0) {
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
      {(kept.planChecks ?? 0) > 0 && (
        <li>
          <strong>{plural(kept.planChecks ?? 0, 'plan check')}</strong>: the day, and whether you did it or not yet.
          Never the plan's words. Kept {weeks(keptFor.answersDays)}.
        </li>
      )}
      <li>
        <strong>{plural(kept.weeklyNotes, 'weekly note')}</strong> for your month, quarter and year: counts and your
        clearest answers, never your words. Kept {plural(Math.round(keptFor.weeklyNotesDays / 30), 'month')}.
      </li>
      {(kept.reports ?? 0) > 0 && (
        <li>
          <strong>{plural(kept.reports ?? 0, 'report')}</strong> on how a saved step went: the step, how it went and the
          week, under a key of their own. Counted only in totals of 50 or more. Kept until you delete everything.
        </li>
      )}
      <li>
        <strong>{plural(kept.votes, 'vote')}</strong> with no key that links them to each other, only there so you
        can't be counted twice. Kept {weeks(keptFor.votesDays)}, to the hour they came in.
      </li>
    </ul>
  )
}
