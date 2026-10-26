import { useEffect, useMemo, useState } from 'react'
import {
  getWhatHelped,
  HELPED_CHOICES,
  helpedLines,
  reportedOutcome,
  sendReport,
  stepsToAsk,
  type HelpedOutcome,
  type SavedStep,
  type WhatHelpedStep,
} from './stepReports'

// Insights' What Helped (Release 2): the steps the person saved, each with a
// voluntary "how did it go?", and what others who tried it and reported back
// found, once the server has enough reports. Counts only, and always said
// with who is counted.

// A few at a time keeps the section short.
const STEPS_SHOWN = 3

export function WhatHelpedSection({ today }: { today: string }) {
  const steps = useMemo(() => stepsToAsk(today).slice(0, STEPS_SHOWN), [today])
  // undefined while loading, null when the totals cannot be reached
  const [totals, setTotals] = useState<WhatHelpedStep[] | null | undefined>(undefined)
  useEffect(() => {
    if (steps.length === 0) return
    let live = true
    getWhatHelped().then((t) => {
      if (live) setTotals(t)
    })
    return () => {
      live = false
    }
  }, [steps.length])
  const totalsFor = (s: SavedStep) => totals?.find((t) => t.questionId === s.questionId && t.optionId === s.optionId) ?? null
  const anyShown = steps.some((s) => totalsFor(s) !== null)

  return (
    <section className="insights-helped" aria-labelledby="helped-title">
      <h3 id="helped-title" className="section-title">
        What Helped
      </h3>
      {steps.length === 0 ? (
        <p className="muted empty-note">This fills in as you and others report back on the small steps you try.</p>
      ) : (
        <>
          <p className="muted small">Steps you saved. Saying how one went is up to you: it’s anonymous and never includes your words.</p>
          {steps.map((s) => (
            <StepReport
              key={`${s.questionId}.${s.optionId}`}
              step={s}
              today={today}
              others={totals === undefined ? 'loading' : totals === null ? 'unreachable' : totalsFor(s)}
            />
          ))}
          {anyShown && (
            <p className="muted small">
              Only people who chose to report back are counted, so this leans towards those who stuck with a step. It isn’t proof that a
              step works.
            </p>
          )}
        </>
      )}
    </section>
  )
}

type Others = WhatHelpedStep | null | 'loading' | 'unreachable'

function StepReport({ step, today, others }: { step: SavedStep; today: string; others: Others }) {
  const [reported, setReported] = useState<HelpedOutcome | null>(() => reportedOutcome(step.questionId, step.optionId))
  const [asking, setAsking] = useState(reported === null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'thanks' | 'failed' | null>(null)

  async function tell(outcome: HelpedOutcome) {
    setBusy(true)
    const ok = await sendReport(step, outcome, today)
    setBusy(false)
    if (!ok) {
      setNote('failed')
      return
    }
    setReported(outcome)
    setAsking(false)
    setNote('thanks')
  }

  const said = HELPED_CHOICES.find((c) => c.outcome === reported)?.label
  return (
    <article className="helped-step" aria-label={step.text}>
      <p className="label">A step you saved</p>
      <p className="helped-text">{step.text}</p>
      {asking ? (
        <div className="helped-ask" role="group" aria-label="How did it go?">
          <p className="helped-question">How did it go?</p>
          <div className="chips">
            {HELPED_CHOICES.map((c) => (
              <button
                key={c.outcome}
                type="button"
                className="chip"
                aria-pressed={reported === c.outcome}
                disabled={busy}
                onClick={() => tell(c.outcome)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="helped-said">
          <span>You said: {said}.</span>{' '}
          <button type="button" className="text-button" onClick={() => setAsking(true)}>
            Change
          </button>
        </p>
      )}
      {note && (
        <p className="muted small" role="status">
          {note === 'thanks'
            ? 'Thanks. Counted anonymously, with others who reported back.'
            : 'That didn’t go through, so nothing was counted. Try again later.'}
        </p>
      )}
      <OthersFound others={others} />
    </article>
  )
}

function OthersFound({ others }: { others: Others }) {
  if (others === 'loading') return null
  if (others === 'unreachable') return <p className="muted small">What others found can’t be reached just now.</p>
  if (others === null) return <p className="muted small">Not enough people have reported back on this step yet.</p>
  const { tried, notTried } = helpedLines(others)
  return (
    <div className="helped-others">
      {tried && <p>{tried}</p>}
      {notTried && <p className="muted small">{notTried}</p>}
    </div>
  )
}
