import { useEffect, useState } from 'react'
import {
  ApiError,
  castVote,
  rememberChoice,
  rememberSkip,
  rateCard,
  rememberRated,
  wasRated,
  recalledChoice,
  recordPlayed,
  SKIPPED,
  voteKey,
  type Insight,
  type Option,
  type Question,
} from './api'
import { awardInsight } from './game'
import { recordAnswer, recordSkip, TRAIT_WORDS } from './profile'
import { themeName, themeStyle, themeVars } from './themes'

export type Done = 'answered' | 'skipped'

type Props = {
  question: Question
  index: number
  total: number
  date: string
  onDone?: (questionId: string, done: Done) => void
}

// Stored when the server says this device already voted but we don't know which option.
export const UNKNOWN_CHOICE = '?'

// One question: tap an answer, and its insight card opens in place. The vote
// still goes to the server for the real community counts, but nothing about
// the crowd is shown here.
export function QuestionCard({ question, index, total, date, onDone }: Props) {
  const [choice, setChoice] = useState<string | null>(() => recalledChoice(question.id))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [earned, setEarned] = useState(0)
  const theme = themeStyle(question.theme)

  // Report a finished card, including one restored from storage.
  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  async function vote(optionId: string) {
    setSending(true)
    setError(null)
    try {
      await castVote(question.id, optionId, voteKey(question.id))
      rememberChoice(question.id, optionId)
      recordAnswer(question, optionId, date)
      recordPlayed(date)
      setEarned(awardInsight(question.id, question.theme))
      setChoice(optionId)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_vote') {
        // This device already answered, but not necessarily with this option.
        rememberChoice(question.id, UNKNOWN_CHOICE)
        setChoice(UNKNOWN_CHOICE)
      } else {
        setError('Your answer did not go through. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  function skip() {
    rememberSkip(question.id)
    recordSkip(question, date)
    setChoice(SKIPPED)
  }

  const headingId = `q-${question.id}`
  const chosen = question.options.find((o) => o.id === choice)

  return (
    <section className="card question" style={themeVars(question.theme)} aria-labelledby={headingId}>
      <div className="question-top">
        <span className="theme-pill">
          <span aria-hidden="true">{theme.icon}</span> {question.theme ? themeName(question.theme) : 'Today'}
        </span>
        <span className="eyebrow">
          Question {index + 1} of {total}
        </span>
      </div>
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
      {choice === UNKNOWN_CHOICE && <p className="muted">You already answered this one on this phone.</p>}

      {chosen?.insight && (
        <InsightCard
          option={chosen}
          insight={chosen.insight}
          icon={theme.icon}
          earned={earned}
          rate={(learned) => rateCard(question.id, chosen.id, learned)}
          questionId={question.id}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

const STRENGTH_LABEL: Record<NonNullable<Insight['strength']>, string> = {
  strong: 'Strong evidence',
  moderate: 'Some evidence',
  early: 'Early evidence',
}

function InsightCard({
  option,
  insight,
  icon,
  earned,
  rate,
  questionId,
}: {
  option: Option
  insight: Insight
  icon: string
  earned: number
  rate: (learned: boolean) => Promise<unknown>
  questionId: string
}) {
  const [rated, setRated] = useState(() => wasRated(questionId))
  function tap(learned: boolean) {
    setRated(true)
    rememberRated(questionId)
    rate(learned).catch(() => {
      // a lost rating is not worth bothering anyone about
    })
  }
  const traits = Object.entries(option.traits ?? {}).filter(([t]) => TRAIT_WORDS[t])
  return (
    <div className="insight" role="note" aria-label="What your answer may say">
      <div className="insight-head">
        <span className="insight-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="insight-title">Insight unlocked</span>
        {earned > 0 && <span className="points-pill">+{earned} pts</span>}
      </div>
      <p className="insight-answer">
        <span className="muted">Your answer:</span> {option.label}
      </p>
      <p className="insight-reveal">{insight.reveal}</p>

      {traits.length > 0 && (
        <ul className="trait-meters" aria-label="Traits this answer touches">
          {traits.map(([t, w]) => (
            <li key={t}>
              <span className="trait-meter-name">{TRAIT_WORDS[t].name}</span>
              <span className="meter" aria-hidden="true">
                <span className="meter-mid" />
                <span className="meter-dot" style={{ left: `${50 + (Math.max(-2, Math.min(2, w)) * 50) / 2.4}%` }} />
              </span>
              <span className="meter-word">{w > 0 ? 'more' : 'less'}</span>
            </li>
          ))}
        </ul>
      )}

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
      {rated ? (
        <p className="muted">Thanks. This helps us keep the good cards.</p>
      ) : (
        <div className="rate">
          <button type="button" className="chip" onClick={() => tap(true)}>
            <span aria-hidden="true">🤯 </span>I learned something
          </button>
          <button type="button" className="chip" onClick={() => tap(false)}>
            <span aria-hidden="true">🤷 </span>Not really
          </button>
        </div>
      )}
      <p className="muted insight-note">For self-reflection, not a diagnosis.</p>
    </div>
  )
}
