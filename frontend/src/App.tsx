import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, getToday, recalledChoice, type DailySet } from './api'
import { QuestionCard } from './QuestionCard'
import { EditionSummary } from './EditionSummary'
import { MyWeek } from './MyWeek'
import type { Outcome } from './crowd'
import { forgetPick, todaysPick } from './profile'
import { intimacyOn, loadPrefs, savePrefs, type Prefs } from './prefs'
import './App.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; set: DailySet }
  | { kind: 'empty' }
  | { kind: 'error' }

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const onOutcome = useCallback((id: string, o: Outcome) => {
    setOutcomes((prev) => (prev[id] === o ? prev : { ...prev, [id]: o }))
  }, [])

  useEffect(() => {
    let live = true
    getToday().then(
      (set) => live && setState({ kind: 'ready', set }),
      (e) => {
        if (!live) return
        const empty = e instanceof ApiError && e.code === 'no_questions_today'
        setState({ kind: empty ? 'empty' : 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [attempt])

  const set = state.kind === 'ready' ? state.set : null
  const questions = useMemo(
    () => (set ? todaysPick(set.pool ?? [], set.questions, set.date, intimacyOn(prefs)) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs, pickVersion],
  )
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    // Re-pick only while nothing of today's three is answered yet, so the
    // questions never change under someone mid-edition.
    if (set && !questions.some((q) => recalledChoice(q.id))) {
      forgetPick(set.date)
      setPickVersion((v) => v + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <main className="page">
      <header className="masthead">
        <h1>The Persona Index</h1>
        {set && (
          <p className="muted">
            {set.edition ? `Edition #${set.edition} · ` : "Today's questions · "}
            {formatDate(set.date)}
          </p>
        )}
        {set && (
          <nav className="tabs" aria-label="Sections">
            <button type="button" aria-pressed={tab === 'today'} onClick={() => setTab('today')}>
              Today
            </button>
            <button type="button" aria-pressed={tab === 'week'} onClick={() => setTab('week')}>
              My week
            </button>
          </nav>
        )}
      </header>

      {state.kind === 'loading' && <p className="muted">Loading today's questions…</p>}

      {state.kind === 'empty' && (
        <p className="notice">No questions today yet. Check back soon.</p>
      )}

      {state.kind === 'error' && (
        <div className="notice" role="alert">
          <p>We couldn't load today's questions.</p>
          <button type="button" className="option" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {set && tab === 'week' && <MyWeek today={set.date} />}

      {set && tab === 'today' && hasIntimate && prefs.adult === null && (
        <section className="notice gate" aria-labelledby="gate-title">
          <h2 id="gate-title">Are you 18 or older?</h2>
          <p className="muted">Some questions are about intimacy and sex. They are frank, never graphic, and your answers stay on this phone.</p>
          <div className="confirm">
            <button type="button" className="option" onClick={() => changePrefs({ ...prefs, adult: true })}>
              Yes, I'm 18 or older
            </button>
            <button type="button" className="option" onClick={() => changePrefs({ ...prefs, adult: false })}>
              No
            </button>
          </div>
        </section>
      )}

      {set &&
        tab === 'today' &&
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={questions.length}
            date={set.date}
            onOutcome={onOutcome}
          />
        ))}

      {set &&
        tab === 'today' &&
        set.edition !== undefined &&
        questions.every((q) => outcomes[q.id]) && (
          <EditionSummary
            date={set.date}
            edition={set.edition}
            outcomes={questions.map((q) => outcomes[q.id])}
            tomorrowThemes={set.tomorrowThemes ?? []}
          />
        )}

      {set && tab === 'today' && prefs.adult === true && (
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.mild}
            onChange={(e) => changePrefs({ ...prefs, mild: e.target.checked })}
          />
          Keep it mild (no intimacy questions)
        </label>
      )}
    </main>
  )
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default App
