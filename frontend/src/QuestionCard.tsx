import { useEffect, useState } from 'react'
import {
  ApiError,
  castVote,
  MAX_WORDS,
  OWN_WORDS,
  rateCard,
  recalledChoice,
  recalledWords,
  rememberChoice,
  rememberRated,
  rememberSkip,
  rememberWords,
  saveStep,
  SKIPPED,
  voteKey,
  wasRated,
  type Insight,
  type Option,
  type OwnWords,
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

// How the card is being answered: by tapping an option, by writing in one's
// own words, or by picking the option closest to those words.
type Mode = 'options' | 'writing' | 'closest'

// One question on its own screen. Tap an answer, or put it in your own
// words, and the same screen turns into what it says about you: the
// insight, one small step to try and a way to say whether it landed. Never
// what anyone else answered, and no score.
export function QuestionCard({ question, date, onDone, onNext }: Props) {
  const [choice, setChoice] = useState<string | null>(() => recalledChoice(question.id))
  const [words, setWords] = useState<OwnWords | null>(() => recalledWords(question.id))
  const [mode, setMode] = useState<Mode>('options')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const theme = themeStyle(question.theme)

  // Report a finished card, including one restored from storage.
  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  // keep saves someone's own words on this phone, with the option that came
  // closest, if one did. Nothing here is sent.
  function keep(text: string, closest?: string) {
    const w: OwnWords = { questionId: question.id, date, prompt: question.prompt, words: text }
    if (question.theme) w.theme = question.theme
    if (question.care === 'intimate') w.private = true
    if (closest) w.closest = closest
    rememberWords(w)
    setWords(w)
  }

  // vote sends the tapped option. typed carries the person's own words when
  // they picked it as the closest; the words stay here.
  async function vote(o: Option, typed?: string) {
    setSending(true)
    setError(null)
    try {
      await castVote(question.id, o.id, voteKey(question.id))
      rememberChoice(question.id, o.id)
      recordAnswer(question, o.id, date)
      if (typed) keep(typed, o.label)
      setChoice(o.id)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'duplicate_vote') {
        // This device already answered, but not necessarily with this option.
        if (typed) keep(typed)
        rememberChoice(question.id, UNKNOWN_CHOICE)
        setChoice(UNKNOWN_CHOICE)
      } else {
        setError('Your answer did not go through. Please try again.')
      }
    } finally {
      setSending(false)
    }
  }

  // noneClose keeps the words with no option: no vote, no card.
  function noneClose() {
    keep(draft.trim())
    rememberChoice(question.id, OWN_WORDS)
    setChoice(OWN_WORDS)
  }

  function skip() {
    rememberSkip(question.id)
    recordSkip(question, date)
    setChoice(SKIPPED)
    onDone?.(question.id, 'skipped')
    onNext()
  }

  const headingId = `q-${question.id}`
  const closestId = `c-${question.id}`
  const wordsId = `w-${question.id}`
  const chosen = question.options.find((o) => o.id === choice)
  const answered = !!choice && choice !== SKIPPED
  const typed = draft.trim()

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

      {!choice && mode === 'options' && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {question.options.map((o) => (
            <button key={o.id} type="button" className="option" disabled={sending} onClick={() => vote(o)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="option own-button" disabled={sending} onClick={() => setMode('writing')}>
            <span aria-hidden="true">✎</span> In my own words
          </button>
          <button type="button" className="text-button skip" disabled={sending} onClick={skip}>
            Skip this one
          </button>
        </div>
      )}

      {!choice && mode === 'writing' && (
        <form
          className="own"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed) setMode('closest')
          }}
        >
          <label htmlFor={wordsId} className="eyebrow">
            In your own words
          </label>
          <textarea
            id={wordsId}
            className="own-box"
            value={draft}
            maxLength={MAX_WORDS}
            rows={4}
            autoFocus
            placeholder="Say it the way it really is for you."
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="own-meta">
            <span>
              <span aria-hidden="true">🔒 </span>Only on this phone. Never sent.
            </span>
            <span>{MAX_WORDS - draft.length} left</span>
          </p>
          <div className="own-buttons">
            <button type="submit" className="pill-button" disabled={!typed}>
              Keep my words
            </button>
            <button type="button" className="text-button" onClick={() => setMode('options')}>
              Back to the options
            </button>
          </div>
        </form>
      )}

      {!choice && mode === 'closest' && (
        <div className="own">
          <blockquote className="own-quote">“{typed}”</blockquote>
          <p id={closestId} className="own-ask">
            Which of these comes closest? Your insight comes from that one.
          </p>
          <div className="options" role="group" aria-labelledby={closestId}>
            {question.options.map((o) => (
              <button key={o.id} type="button" className="option" disabled={sending} onClick={() => vote(o, typed)}>
                {o.label}
              </button>
            ))}
            <div className="own-buttons">
              <button type="button" className="text-button" disabled={sending} onClick={noneClose}>
                None of these
              </button>
              <button type="button" className="text-button" disabled={sending} onClick={() => setMode('writing')}>
                Change my words
              </button>
            </div>
          </div>
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
          {words && <YourWords words={words} />}
          <p className="muted">You already answered this one on this phone.</p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </>
      )}

      {choice === OWN_WORDS && (
        <div className="answer">
          {words ? <YourWords words={words} /> : <p className="muted">You answered this one in your own words.</p>}
          <p className="own-none">
            None of the options matched what you meant, so there is no card for this one. I'd rather say nothing than
            guess about you. Your words are kept in your mirror, on this phone only.
          </p>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </div>
      )}

      {chosen && <Answer question={question} option={chosen} words={words} date={date} onNext={onNext} />}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

// What someone wrote, quoted back to them, and the option they said came closest.
function YourWords({ words }: { words: OwnWords }) {
  return (
    <figure className="you-wrote">
      <figcaption className="eyebrow">In your words</figcaption>
      <blockquote className="own-quote">“{words.words}”</blockquote>
      {words.closest && (
        <p className="muted">
          Closest to: <span className="own-closest">{words.closest}</span>
        </p>
      )}
    </figure>
  )
}

function Answer({
  question,
  option,
  words,
  date,
  onNext,
}: {
  question: Question
  option: Option
  words: OwnWords | null
  date: string
  onNext: () => void
}) {
  const insight = option.insight
  return (
    <div className="answer">
      {words ? (
        <YourWords words={words} />
      ) : (
        <p className="you-chose">
          <span className="eyebrow">You chose</span>
          <span className="chosen">{option.label}</span>
        </p>
      )}
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
            : "Added to today's moves. I'll ask how it went this evening."}
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
