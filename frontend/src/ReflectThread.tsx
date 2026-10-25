import { rootOf, threadOf } from './journal'
import type { Reflection, ReflectionPeriod } from './notebook'
import { dayMonth } from './reflect'
import { ReflectWriting } from './ReflectWriting'
import type { Thought } from './thoughts'
import { Icon } from './ui/icons'

// A Reflection Thread (Reflect): one line of thought over time, its
// entries dated and in order, and a new question at the end. A single
// reflection opened here becomes a thread when the person writes on.

type Props = { from: Reflection; today: string; period: ReflectionPeriod; onBack: () => void; onSaved: () => void }

export function ReflectThread({ from, today, period, onBack, onSaved }: Props) {
  const root = rootOf(from)
  const entries = threadOf(root)
  const next: Thought = {
    id: `thread-${root}`,
    question: entries.length > 1 ? 'Looking at all of this, what feels different now?' : 'Coming back to this, what would you add now?',
    lead: 'Your thread so far is above. Write on whenever it feels right.',
    why: `From your thread, begun on ${dayMonth(entries[0]?.date ?? from.date)}`,
    source: 'reflections',
    area: from.area,
  }
  return (
    <section className="reflect-thread" aria-labelledby="thread-title">
      <button type="button" className="text-button" onClick={onBack}>
        <Icon name="back" size={16} /> Back to Reflect
      </button>
      <h2 id="thread-title" className="title">
        {entries.length > 1 ? 'Your thread' : 'Your reflection'}
      </h2>
      <ol className="thread-entries" aria-label="Entries, oldest first">
        {entries.map((r) => (
          <li key={r.id} className="thread-entry">
            <p className="nb-meta">{dayMonth(r.date)}</p>
            {!r.free && <p className="muted small">{r.question}</p>}
            <p className="nb-line">“{r.answer}”</p>
          </li>
        ))}
      </ol>
      <ReflectWriting key={root} today={today} period={period} free={false} thought={next} thread={root} onSaved={onSaved} />
    </section>
  )
}
