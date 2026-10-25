import { useState } from 'react'
import { dismissMemory, journeyFor, memoryFor, reminderFor } from './journal'
import { reflections, type Reflection } from './notebook'
import { dayMonth } from './reflect'
import type { Noticed } from './noticed'
import { Icon } from './ui/icons'

// The side of Reflect (below the writing on a phone): earlier words
// brought back, a gentle line, a longer look back, recent reflections and
// one thing to consider. Each offers to write; none asks for more.

type Props = {
  today: string
  consider: Noticed | null
  onFollowUp: (r: Reflection) => void
  onOpenThread: (r: Reflection) => void
  onReflect: (n: Noticed) => void
}

const firstWords = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function ReflectSide({ today, consider, onFollowUp, onOpenThread, onReflect }: Props) {
  const [, setVersion] = useState(0)
  const [revisit, setRevisit] = useState(false)
  const memory = memoryFor(today)
  const journey = journeyFor(today)
  const recent = reflections().slice(0, 4)
  return (
    <aside className="reflect-side" aria-label="Looking back">
      {memory && (
        <section className="reflect-card is-memory" aria-labelledby="memory-title">
          <h3 id="memory-title" className="card-title">
            <Icon name="mirror" size={18} /> Reflection memory
          </h3>
          <p>
            {memory.when} you wrote: “{revisit ? memory.reflection.answer : firstWords(memory.reflection.answer, 120)}”
          </p>
          {revisit && <p className="muted small">{dayMonth(memory.reflection.date)} · {memory.reflection.question}</p>}
          <p className="muted">Have you noticed anything changing?</p>
          <div className="closer-actions">
            <button type="button" className="btn small outline" onClick={() => onFollowUp(memory.reflection)}>
              Write a follow-up <Icon name="arrow" size={14} />
            </button>
            {!revisit && (
              <button type="button" className="text-button" onClick={() => setRevisit(true)}>
                Revisit
              </button>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                dismissMemory(memory.reflection.id)
                setVersion((v) => v + 1)
              }}
            >
              Put away
            </button>
          </div>
        </section>
      )}

      <section className="reflect-card is-reminder" aria-labelledby="reminder-title">
        <h3 id="reminder-title" className="card-title">
          A gentle reminder
        </h3>
        <p className="muted">{reminderFor(today)}</p>
      </section>

      {journey && (
        <section className="reflect-card is-journey" aria-labelledby="journey-title">
          <h3 id="journey-title" className="card-title">
            From your journey
          </h3>
          <p>
            {journey.when}, you wrote: <strong>“{firstWords(journey.reflection.answer, 120)}”</strong>
          </p>
          <p className="muted">
            {journey.since > 0
              ? `You’ve come back to it ${journey.since === 1 ? 'once' : `${journey.since} times`} since. What feels different now?`
              : 'What feels different now?'}
          </p>
          <button type="button" className="btn small outline" onClick={() => onOpenThread(journey.reflection)}>
            {journey.since > 0 ? 'Explore this thread' : 'Start a thread from it'} <Icon name="arrow" size={14} />
          </button>
        </section>
      )}

      {recent.length > 0 && (
        <section className="reflect-card" aria-labelledby="recent-title">
          <h3 id="recent-title" className="card-title">
            Your recent reflections
          </h3>
          <ul className="reflect-recent">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="row-button" onClick={() => onOpenThread(r)}>
                  <span>
                    <span className="muted small">{weekday(r.date)}</span>
                    <span>{firstWords(r.answer, 44)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {consider && (
        <section className="reflect-card is-consider" aria-labelledby="consider-title">
          <h3 id="consider-title" className="card-title">
            Something to consider
          </h3>
          <p className="muted">{consider.text}</p>
          <button type="button" className="btn small outline" onClick={() => onReflect(consider)}>
            Reflect on this <Icon name="arrow" size={14} />
          </button>
        </section>
      )}
    </aside>
  )
}
