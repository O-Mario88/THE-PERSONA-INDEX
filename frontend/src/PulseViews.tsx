import { useCallback, useEffect, useState } from 'react'
import { recalledChoice, SKIPPED, type Question } from './api'
import { inOrder } from './order'
import { count, getPulse, hasPulse, noteCount, PULSE_MIN, sameAs, shareOf, showsSplit, type Pulse } from './pulse'
import { themeName } from './themes'

// The Human Pulse on screen: a quiet pill under an answered card, and the
// afternoon window's page. Off until the person says yes once; "Not for me"
// hides every number for good (Account, "Show me the Human Pulse").

// PulseAsk is the one-time offer.
export function PulseAsk({ onAnswer }: { onAnswer: (on: boolean) => void }) {
  return (
    <div className="pulse-ask" role="group" aria-label="The Human Pulse">
      <p>
        <strong>See how others answered?</strong> Anonymous totals only. Never who, and never a score.
      </p>
      <div className="row-gap">
        <button type="button" className="btn small" onClick={() => onAnswer(true)}>
          Show me
        </button>
        <button type="button" className="btn small ghost" onClick={() => onAnswer(false)}>
          Not for me
        </button>
      </div>
    </div>
  )
}

function usePulse(questionId: string, live: boolean) {
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const [grew, setGrew] = useState<number | null>(null)
  useEffect(() => {
    let on = true
    const load = () =>
      getPulse(questionId).then((p) => {
        if (!on || !p) return
        setPulse(p)
        const g = noteCount(questionId, p.total)
        if (g !== null) setGrew(g)
      })
    load()
    if (!live) return () => void (on = false)
    const id = setInterval(load, 60_000)
    return () => {
      on = false
      clearInterval(id)
    }
  }, [questionId, live])
  return { pulse, grew }
}

function Bars({ question, pulse, mine }: { question: Question; pulse: Pulse; mine: string | null }) {
  const options = [...inOrder(question)].sort(
    (a, b) => (pulse.options.find((o) => o.optionId === b.id)?.count ?? 0) - (pulse.options.find((o) => o.optionId === a.id)?.count ?? 0),
  )
  return (
    <ul className="bars">
      {options.map((o) => {
        const p = pulse.options.find((x) => x.optionId === o.id)?.percent ?? 0
        const me = o.id === mine
        return (
          <li key={o.id} className={me ? 'bar is-mine' : 'bar'}>
            <span className="bar-label">
              {o.label}
              {me && <span className="bar-you"> · you</span>}
            </span>
            <span className="bar-pct">{Math.round(p)}%</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${p}%` }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// PulsePill sits under an answered card.
export function PulsePill({ question, optionId }: { question: Question; optionId: string }) {
  const { pulse } = usePulse(question.id, false)
  const [open, setOpen] = useState(false)
  if (!hasPulse(question) || !pulse || pulse.total === 0) return null
  const share = shareOf(pulse, optionId)
  const people = pulse.total === 1 ? '1 person' : `${count(pulse.total)} people`
  return (
    <div className="pulse-pill">
      <button type="button" className="pill-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="dot" aria-hidden="true" />
        {share === null ? `${people} answered this so far` : `${people} answered this · ${Math.round(share)}% chose the same as you`}
      </button>
      {open &&
        (showsSplit(pulse) ? (
          <Bars question={question} pulse={pulse} mine={optionId} />
        ) : (
          <p className="muted small">The split shows once {PULSE_MIN} people have answered.</p>
        ))}
    </div>
  )
}

// One morning question on the afternoon page.
function PulseCard({ question, index, open, onToggle, onPulse }: { question: Question; index: number; open: boolean; onToggle: () => void; onPulse: (p: Pulse) => void }) {
  const { pulse, grew } = usePulse(question.id, true)
  const mine = recalledChoice(question.id)
  const chosen = mine && mine !== SKIPPED ? mine : null
  useEffect(() => {
    if (pulse) onPulse({ ...pulse, ...(grew !== null ? { grew } : {}) } as Pulse)
  }, [pulse, grew, onPulse])
  const share = pulse && chosen ? shareOf(pulse, chosen) : null
  const title = question.theme ? themeName(question.theme) : `Question ${index + 1}`
  if (!open) {
    return (
      <li className="pulse-row">
        <button type="button" className="pulse-row-button" aria-expanded={false} onClick={onToggle}>
          <span>
            <strong>{title}</strong>
            {pulse && share !== null && <span className="muted-ink"> · {Math.round(share)}% chose the same as you</span>}
            {pulse && share === null && <span className="muted-ink"> · {count(pulse.total)} answered</span>}
          </span>
          <span aria-hidden="true">⌄</span>
        </button>
      </li>
    )
  }
  return (
    <li className="card pulse-card">
      <div className="row-between">
        <button type="button" className="link-button strong" aria-expanded onClick={onToggle}>
          {title}
        </button>
        <span className="label muted-ink">Question {index + 1}</span>
      </div>
      <p className="pulse-prompt">{question.prompt}</p>
      {!pulse && <p className="muted small">Counting…</p>}
      {pulse && showsSplit(pulse) && <Bars question={question} pulse={pulse} mine={chosen} />}
      {pulse && !showsSplit(pulse) && (
        <p className="muted small">
          {pulse.total === 0 ? 'No answers counted yet.' : `${count(pulse.total)} so far. The split shows once ${PULSE_MIN} people have answered.`}
        </p>
      )}
      {share !== null && <p className="serif-line">{sameAs(share)}</p>}
    </li>
  )
}

// PulseScreen is the afternoon window: how everyone else answered the
// morning's questions. The big number is the most answers any one of them
// has, so "at least" is always true.
export function PulseScreen({ questions }: { questions: Question[] }) {
  const qs = questions.filter(hasPulse)
  const [open, setOpen] = useState(0)
  const [pulses, setPulses] = useState<Record<string, Pulse & { grew?: number }>>({})
  const onPulse = useCallback(
    (p: Pulse & { grew?: number }) =>
      setPulses((all) => (JSON.stringify(all[p.questionId]) === JSON.stringify(p) ? all : { ...all, [p.questionId]: p })),
    [],
  )
  const best = Object.values(pulses).sort((a, b) => b.total - a.total)[0]
  return (
    <section className="flow-body pulse-screen" aria-labelledby="pulse-title">
      <h2 id="pulse-title" className="sr-only">
        The afternoon pulse
      </h2>
      {best && best.total > 0 ? (
        <>
          <p className="pulse-big" aria-live="polite">
            {count(best.total)}
          </p>
          <p className="pulse-lead">
            {best.total === 1 ? 'person' : 'people'} sat with this morning's questions too, at least.
            {best.grew ? <strong className="pulse-grew"> +{count(best.grew)} in the last minute.</strong> : null}
          </p>
          <p className="muted small">Not a score. Just company. The number counts up as you watch.</p>
        </>
      ) : (
        <p className="pulse-lead">{qs.length ? 'Counting this morning’s answers…' : 'No morning questions to count today.'}</p>
      )}
      <ul className="pulse-list">
        {qs.map((q, i) => (
          <PulseCard key={q.id} question={q} index={i} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} onPulse={onPulse} />
        ))}
      </ul>
      <p className="muted small">Who chose what stays theirs. These are anonymous totals, and private answers are never in them.</p>
    </section>
  )
}
