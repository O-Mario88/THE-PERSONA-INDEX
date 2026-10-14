import { useEffect, useState } from 'react'
import {
  ApiError,
  castVote,
  getResults,
  recalledGuess,
  rememberChoice,
  rememberGuess,
  rememberSkip,
  recalledChoice,
  recordPlayed,
  SKIPPED,
  voteKey,
  type Insight,
  type Question,
  type QuestionResults,
} from './api'
import { GUESSES, guessFeedback, outcomeFor, type Outcome } from './crowd'

type Props = {
  question: Question
  index: number
  total: number
  date: string
  onOutcome?: (questionId: string, outcome: Outcome) => void
}

// Stored when the player skips the guess-the-crowd step.
const NO_GUESS = 'none'

// Results are published by a worker, so a fresh vote may take a moment to show.
const REFRESH_DELAYS_MS = [1500, 3000, 6000]

// Stored when the server says this device already voted but we don't know which option.
const UNKNOWN_CHOICE = '?'

export function QuestionCard({ question, index, total, date, onOutcome }: Props) {
  const [choice, setChoice] = useState<string | null>(() =>
    recalledChoice(question.id),
  )
  const [guess, setGuess] = useState<string | null>(() => recalledGuess(question.id))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<QuestionResults | null>(null)

  const answered = choice !== null && choice !== SKIPPED
  // Results and the insight wait until the player has guessed the crowd.
  const revealed = answered && (guess !== null || choice === UNKNOWN_CHOICE)

  useEffect(() => {
    if (choice === SKIPPED || choice === UNKNOWN_CHOICE) onOutcome?.(question.id, 'skipped')
    else if (choice && results && revealed) onOutcome?.(question.id, outcomeFor(choice, results.options))
  }, [choice, results, revealed, question.id, onOutcome])

  // Once revealed, fetch results and refresh a few times while the count catches up.
  useEffect(() => {
    if (!revealed) return
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
  }, [revealed, question.id])

  async function vote(optionId: string) {
    setSending(true)
    setError(null)
    try {
      await castVote(question.id, optionId, voteKey(question.id))
      rememberChoice(question.id, optionId)
      recordPlayed(date)
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

  function skip() {
    rememberSkip(question.id)
    setChoice(SKIPPED)
  }

  function chooseGuess(g: string) {
    rememberGuess(question.id, g)
    setGuess(g)
  }

  const headingId = `q-${question.id}`
  const guessId = `g-${question.id}`

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
          <button type="button" className="link-button" disabled={sending} onClick={skip}>
            Skip
          </button>
        </div>
      )}

      {choice === SKIPPED && <p className="muted">Skipped</p>}

      {answered && !revealed && (
        <div className="guess">
          <p id={guessId} className="guess-prompt">
            How many people do you think chose what you chose?
          </p>
          <div className="guess-options" role="group" aria-labelledby={guessId}>
            {GUESSES.map((g) => (
              <button key={g.id} type="button" className="option" onClick={() => chooseGuess(g.id)}>
                {g.label}
              </button>
            ))}
          </div>
          <button type="button" className="link-button" onClick={() => chooseGuess(NO_GUESS)}>
            Skip the guess
          </button>
        </div>
      )}

      {revealed && <InsightCard insight={chosenInsight(question, choice)} />}

      {revealed && (
        <Results question={question} choice={choice} results={results} guess={guess} />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function chosenInsight(question: Question, choice: string): Insight | undefined {
  return question.options.find((o) => o.id === choice)?.insight
}

const STRENGTH_LABEL: Record<NonNullable<Insight['strength']>, string> = {
  strong: 'Strong evidence',
  moderate: 'Some evidence',
  early: 'Early evidence',
}

function InsightCard({ insight }: { insight: Insight | undefined }) {
  if (!insight) return null
  return (
    <div className="insight" role="note" aria-label="What your answer may say">
      <p className="insight-reveal">{insight.reveal}</p>
      {insight.research && (
        <p className="insight-research">
          {insight.research}{' '}
          <span className="muted">
            {insight.strength && `${STRENGTH_LABEL[insight.strength]} · `}
            {insight.sourceUrl ? (
              <a href={insight.sourceUrl} target="_blank" rel="noreferrer">
                {insight.sourceTitle}
              </a>
            ) : (
              insight.sourceTitle
            )}
          </span>
        </p>
      )}
      <p className="insight-step">
        <strong>Try this:</strong> {insight.step}
      </p>
      <p className="muted insight-note">For self-reflection, not a diagnosis.</p>
    </div>
  )
}

function Results({
  question,
  choice,
  results,
  guess,
}: {
  question: Question
  choice: string
  results: QuestionResults | null
  guess: string | null
}) {
  if (!results) {
    return <p className="muted">Loading results…</p>
  }
  const byId = new Map(results.options.map((r) => [r.optionId, r]))
  const feedback =
    guess && choice !== UNKNOWN_CHOICE
      ? guessFeedback(guess, byId.get(choice)?.percent ?? 0, results.totalVotes)
      : null
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
      {feedback && <p className="guess-feedback">{feedback}</p>}
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
