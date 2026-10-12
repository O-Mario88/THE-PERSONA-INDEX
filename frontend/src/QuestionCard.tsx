import { useEffect, useState } from 'react'
import {
  ApiError,
  castVote,
  getResults,
  rememberChoice,
  recalledChoice,
  voteKey,
  type Question,
  type QuestionResults,
} from './api'

type Props = { question: Question; index: number; total: number }

// Results are published by a worker, so a fresh vote may take a moment to show.
const REFRESH_DELAYS_MS = [1500, 3000, 6000]

// Stored when the server says this device already voted but we don't know which option.
const UNKNOWN_CHOICE = '?'

export function QuestionCard({ question, index, total }: Props) {
  const [choice, setChoice] = useState<string | null>(() =>
    recalledChoice(question.id),
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<QuestionResults | null>(null)

  // Once answered, fetch results and refresh a few times while the count catches up.
  useEffect(() => {
    if (!choice) return
    let live = true
    const load = () =>
      getResults(question.id).then(
        (r) => live && setResults(r),
        () => live && setError('Results are not available right now.'),
      )
    load()
    const timers = REFRESH_DELAYS_MS.map((ms) => setTimeout(load, ms))
    return () => {
      live = false
      timers.forEach(clearTimeout)
    }
  }, [choice, question.id])

  async function vote(optionId: string) {
    setSending(true)
    setError(null)
    try {
      await castVote(question.id, optionId, voteKey(question.id))
      rememberChoice(question.id, optionId)
      setChoice(optionId)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_vote') {
        // This device already answered, but not necessarily with this option.
        rememberChoice(question.id, UNKNOWN_CHOICE)
        setChoice(UNKNOWN_CHOICE)
      } else {
        setError('Your vote did not go through. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  const headingId = `q-${question.id}`

  return (
    <section className="card" aria-labelledby={headingId}>
      <p className="eyebrow">
        Question {index + 1} of {total}
      </p>
      <h2 id={headingId}>{question.prompt}</h2>

      {!choice && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {question.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="option"
              disabled={sending}
              onClick={() => vote(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {choice && (
        <Results question={question} choice={choice} results={results} />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function Results({
  question,
  choice,
  results,
}: {
  question: Question
  choice: string
  results: QuestionResults | null
}) {
  if (!results) {
    return <p className="muted">Loading results…</p>
  }
  const byId = new Map(results.options.map((r) => [r.optionId, r]))
  return (
    <div className="results">
      <ul aria-label="Community results">
        {question.options.map((o) => {
          const r = byId.get(o.id) ?? { count: 0, percent: 0 }
          const mine = o.id === choice
          return (
            <li key={o.id} className={mine ? 'result mine' : 'result'}>
              <div className="result-row">
                <span>
                  {o.label}
                  {mine && <span className="badge">Your answer</span>}
                </span>
                <span className="pct">{formatPercent(r.percent)}</span>
              </div>
              <div className="bar" aria-hidden="true">
                <div className="fill" style={{ width: `${r.percent}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
      {choice === UNKNOWN_CHOICE && (
        <p className="muted">You already answered this one on this device.</p>
      )}
      <p className="muted">
        {results.totalVotes === 0
          ? 'Your vote is in. Results update in a few seconds.'
          : `${results.totalVotes.toLocaleString()} ${results.totalVotes === 1 ? 'vote' : 'votes'} so far`}
      </p>
    </div>
  )
}

function formatPercent(p: number): string {
  return `${Number.isInteger(p) ? p : p.toFixed(1)}%`
}
