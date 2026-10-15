import { useEffect, useState } from 'react'
import {
  ApiError,
  castVote,
  rateCard,
  recalledChoice,
  rememberChoice,
  rememberRated,
  rememberSkip,
  saveStep,
  SKIPPED,
  voteKey,
  wasRated,
  type Insight,
  type Option,
  type Question,
} from './api'
import { isEvening } from './day'
import { moveFor, startMove } from './moves'
import { recordAnswer, recordSkip } from './profile'
import { splitReveal } from './reveal'
import { themeName, themeStyle, themeVars } from './themes'

export type Done = 'answered' | 'skipped'

type Props = {
  question: Question
  date: string
  onDone?: (questionId: string, done: Done) => void
  onNext: () => void
}

// Stored when the server says this device already voted but we don't know which option.
export const UNKNOWN_CHOICE = '?'

// One question on its own screen. Tap an answer and the same screen turns
// into what it says about you: the insight, one small step to try and a way
// to say whether it landed. Never what anyone else answered, and no score.
export function QuestionCard({ question, date, onDone, onNext }: Props) {
  const [choice, setChoice] = useState<string | null>(() => recalledChoice(question.id))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    onDone?.(question.id, 'skipped')
    onNext()
  }

  const headingId = `q-${question.id}`
  const chosen = question.options.find((o) => o.id === choice)
  const answered = !!choice && choice !== SKIPPED

  return (
    <section
      className={answered ? 'screen question answered' : 'screen question'}
      style={themeVars(question.theme)}
      aria-labelledby={headingId}
    >
      <span className="theme-chip">
        <span aria-hidden="true">{theme.icon}</span> {question.theme ? themeName(question.theme) : 'Today'}
      </span>
      <h2 id={headingId} className="prompt">
        {question.prompt}
      </h2>

      {!choice && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {question.options.map((o) => (
            <button key={o.id} type="button" className="option" disabled={sending} onClick={() => vote(o.id)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="text-button skip" disabled={sending} onClick={skip}>
            Skip this one
          </button>
        </div>
      )}

      {choice === SKIPPED && (
        <>
          <p className="muted">You skipped this one. That's fine.</p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {choice === UNKNOWN_CHOICE && (
        <>
          <p className="muted">You already answered this one on this phone.</p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {chosen && <Answer question={question} option={chosen} date={date} onNext={onNext} />}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function Answer({ question, option, date, onNext }: { question: Question; option: Option; date: string; onNext: () => void }) {
  const insight = option.insight
  return (
    <div className="answer">
      <p className="you-chose">
        <span className="eyebrow">You chose</span>
        <span className="chosen">{option.label}</span>
      </p>
      {insight && <InsightPanel insight={insight} />}
      {insight?.step && <TryThis question={question} option={option} step={insight.step} date={date} />}
      {insight && <Rate questionId={question.id} optionId={option.id} />}
      <button type="button" className="next" onClick={onNext}>
        Next
      </button>
    </div>
  )
}

function InsightPanel({ insight }: { insight: Insight }) {
  const { headline, body } = splitReveal(insight.reveal)
  return (
    <div className="insight" role="note" aria-label="What your answer may say">
      <p className="insight-headline">{headline}</p>
      {body && <p className="insight-body">{body}</p>}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </div>
  )
}

// One small step from the card. "I'll try it" keeps it as one of today's
// moves: the evening asks how a morning move went, and the mirror keeps them all.
function TryThis({ question, option, step, date }: { question: Question; option: Option; step: string; date: string }) {
  const [state, setState] = useState<'open' | 'started' | 'later'>(() => (moveFor(question.id) ? 'started' : 'open'))
  const [evening] = useState(() => isEvening())
  function start() {
    startMove(date, question.id, option.id, step)
    setState('started')
    saveStep(question.id, option.id, 'started', date).catch(() => {
      // kept on the phone; the mirror just won't count it
    })
  }
  return (
    <div className="try" role="group" aria-label="Try this">
      <p>
        <strong>Try this:</strong> {step}
      </p>
      {state === 'open' && (
        <div className="try-buttons">
          <button type="button" className="pill-button" onClick={start}>
            I'll try it
          </button>
          <button type="button" className="text-button" onClick={() => setState('later')}>
            Not now
          </button>
        </div>
      )}
      {state === 'started' && (
        <p className="muted">
          {evening
            ? 'Added to your moves. Give it a go tomorrow; your mirror will ask how it went.'
            : "Added to today's moves. I'll ask how it went at 4 pm."}
        </p>
      )}
    </div>
  )
}

function Rate({ questionId, optionId }: { questionId: string; optionId: string }) {
  const [rated, setRated] = useState(() => wasRated(questionId))
  function tap(learned: boolean) {
    setRated(true)
    rememberRated(questionId)
    rateCard(questionId, optionId, learned).catch(() => {
      // a lost rating is not worth bothering anyone about
    })
  }
  return rated ? (
    <p className="muted rate-thanks">Thanks for telling me. It helps keep the good cards.</p>
  ) : (
    <div className="rate" role="group" aria-label="Did this land?">
      <button type="button" className="text-button" onClick={() => tap(true)}>
        I learned something
      </button>
      <button type="button" className="text-button" onClick={() => tap(false)}>
        Not me
      </button>
    </div>
  )
}
