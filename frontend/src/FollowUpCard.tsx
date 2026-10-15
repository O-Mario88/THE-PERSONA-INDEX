import { useEffect, useState } from 'react'
import { recalledEvening, rememberEvening, SKIPPED, type Option, type Question } from './api'
import { awardReflection } from './game'
import { recordEvening } from './profile'
import type { Done } from './QuestionCard'
import { themeName, themeStyle, themeVars } from './themes'

type Props = {
  question: Question
  said: Option // the morning answer this follows up on
  index: number
  total: number
  date: string
  onDone?: (questionId: string, done: Done) => void
}

// One evening follow-up: a quiet line with this morning's answer, the
// question, tap-only options, then a short reflection. Lighter than the
// morning card, and nothing here is sent to the server.
export function FollowUpCard({ question, said, index, total, date, onDone }: Props) {
  const followUp = question.followUp!
  const [choice, setChoice] = useState<string | null>(() => recalledEvening(question.id))
  const [earned, setEarned] = useState(0)
  const theme = themeStyle(question.theme)

  useEffect(() => {
    if (choice) onDone?.(question.id, choice === SKIPPED ? 'skipped' : 'answered')
  }, [choice, question.id, onDone])

  function pick(optionId: string) {
    const o = followUp.options.find((x) => x.id === optionId)
    if (!o) return
    rememberEvening(question.id, optionId)
    recordEvening(question, o, date)
    setEarned(awardReflection(question.id))
    setChoice(optionId)
  }

  function skip() {
    rememberEvening(question.id, SKIPPED)
    setChoice(SKIPPED)
  }

  const headingId = `f-${question.id}`
  const chosen = followUp.options.find((o) => o.id === choice)

  return (
    <section className="card question followup" style={themeVars(question.theme)} aria-labelledby={headingId}>
      <div className="question-top">
        <span className="theme-pill">
          <span aria-hidden="true">{theme.icon}</span> {question.theme ? themeName(question.theme) : 'Today'}
        </span>
        <span className="eyebrow">
          Evening · {index + 1} of {total}
        </span>
      </div>
      <p className="said">
        <span className="muted">This morning you said:</span> {said.label}
      </p>
      <h2 id={headingId}>{followUp.prompt}</h2>

      {!choice && (
        <div className="options" role="group" aria-labelledby={headingId}>
          {followUp.options.map((o) => (
            <button key={o.id} type="button" className="option" onClick={() => pick(o.id)}>
              {o.label}
            </button>
          ))}
          <button type="button" className="link-button" onClick={skip}>
            Skip
          </button>
        </div>
      )}

      {choice === SKIPPED && <p className="muted">Skipped</p>}

      {chosen && (
        <div className="insight reflection" role="note" aria-label="Tonight's reflection">
          <div className="insight-head">
            <span className="insight-icon" aria-hidden="true">
              🌙
            </span>
            <span className="insight-title">Reflection</span>
            {earned > 0 && <span className="points-pill">+{earned} pts</span>}
          </div>
          <p className="insight-answer">
            <span className="muted">Tonight:</span> {chosen.label}
          </p>
          <p className="insight-reveal">{chosen.reflection}</p>
          <p className="muted insight-note">For self-reflection, not a diagnosis. Evening answers stay on this phone.</p>
        </div>
      )}
    </section>
  )
}
