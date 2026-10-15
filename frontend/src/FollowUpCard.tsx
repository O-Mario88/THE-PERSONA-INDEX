import { useEffect, useState } from 'react'
import { recalledEvening, rememberEvening, SKIPPED, type Option, type Question } from './api'
import { recordEvening } from './profile'
import type { Done } from './QuestionCard'
import { splitReveal } from './reveal'
import { themeName, themeStyle, themeVars } from './themes'

type Props = {
  question: Question
  said: Option // the morning answer this follows up on
  date: string
  onDone?: (questionId: string, done: Done) => void
  onNext: () => void
}

// One check-in on its own screen, at the start of the evening: a quiet line
// with this morning's answer, the question, tap-only options, then a short
// reflection. Lighter than a question, and nothing here is sent to the server.
export function FollowUpCard({ question, said, date, onDone, onNext }: Props) {
  const followUp = question.followUp!
  const [choice, setChoice] = useState<string | null>(() => recalledEvening(question.id))
  const theme = themeStyle(question.theme)

  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  function pick(optionId: string) {
    const o = followUp.options.find((x) => x.id === optionId)
    if (!o) return
    rememberEvening(question.id, optionId)
    recordEvening(question, o, date)
    setChoice(optionId)
  }

  function skip() {
    rememberEvening(question.id, SKIPPED)
    setChoice(SKIPPED)
    onDone?.(question.id, 'skipped')
    onNext()
  }

  const headingId = `f-${question.id}`
  const chosen = followUp.options.find((o) => o.id === choice)

  return (
    <section
      className={chosen ? 'screen question followup answered' : 'screen question followup'}
      style={themeVars(question.theme)}
      aria-labelledby={headingId}
    >
      <span className="theme-chip">
        <span aria-hidden="true">{theme.icon}</span> {question.theme ? themeName(question.theme) : 'Today'}
      </span>
      <p className="said">
        <span className="eyebrow">This morning you said</span> {said.label}
      </p>
      <h2 id={headingId} className="prompt">
        {followUp.prompt}
      </h2>

      {!choice && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {followUp.options.map((o) => (
            <button key={o.id} type="button" className="option" onClick={() => pick(o.id)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="text-button skip" onClick={skip}>
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

      {chosen && (
        <div className="answer">
          <p className="you-chose">
            <span className="eyebrow">This evening</span>
            <span className="chosen">{chosen.label}</span>
          </p>
          <div className="insight reflection" role="note" aria-label="Your reflection">
            <p className="insight-headline">{splitReveal(chosen.reflection).headline}</p>
            {splitReveal(chosen.reflection).body && (
              <p className="insight-body">{splitReveal(chosen.reflection).body}</p>
            )}
            <p className="insight-note">For self-reflection, not a diagnosis. Check-in answers stay on this phone.</p>
          </div>
          <button type="button" className="next" onClick={onNext}>
            Next
          </button>
        </div>
      )}
    </section>
  )
}
