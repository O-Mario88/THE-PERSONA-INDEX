import { useEffect, useState } from 'react'
import { ApiError, getToday, type DailySet } from './api'
import { QuestionCard } from './QuestionCard'
import './App.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; set: DailySet }
  | { kind: 'empty' }
  | { kind: 'error' }

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

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

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <main className="page">
      <header className="masthead">
        <h1>The Persona Index</h1>
        {state.kind === 'ready' && (
          <p className="muted">
            Today's questions · {formatDate(state.set.date)}
          </p>
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

      {state.kind === 'ready' &&
        state.set.questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={state.set.questions.length}
          />
        ))}
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
