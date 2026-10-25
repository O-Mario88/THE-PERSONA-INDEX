import { useState, type ReactNode } from 'react'
import { isSaturday } from './day'
import { movesOn } from './moves'
import { goodThings, keepGoodThings } from './notebook'
import { PRACTICES, type Practice } from './practices'
import { Upcoming } from './Sittings'
import { Icon } from './ui/icons'
import { SUNDAY_LINE } from './words'

// The night wind-down (21:00 to midnight): three good things from the day,
// tapped rather than typed (small counts), an optional two-minute practice
// to savour one of them, a quiet nod to someone in the circle (Stage E), and
// tomorrow's themes. Then the day closes. All of it stays on this phone.

const MAX_LINE = 140
const CHIPS = ['A good meal', 'A kind word', 'Something finished', 'Time outside', 'A laugh', 'A moment of rest']

export function NightScreen({
  date,
  tomorrowThemes,
  nod,
  onPractice,
  onClose,
}: {
  date: string
  tomorrowThemes: string[]
  nod?: ReactNode
  onPractice?: (p: Practice) => void
  onClose: (lines: string[]) => void
}) {
  const kept = goodThings(date)
  // The day's own small steps that helped come first: they were good things too.
  const [chips] = useState(() => {
    const own = movesOn(date)
      .filter((m) => m.status === 'helped')
      .map((m) => m.step.replace(/\.$/, ''))
      .slice(0, 2)
    return [...own, ...CHIPS].slice(0, 7)
  })
  const [picked, setPicked] = useState<string[]>(() => kept?.lines.filter((l) => l.trim()) ?? [])
  const [other, setOther] = useState('')
  const [writing, setWriting] = useState(false)
  const [closed, setClosed] = useState(false)
  const all = [...chips, ...picked.filter((p) => !chips.includes(p))]

  function toggle(c: string) {
    setPicked(picked.includes(c) ? picked.filter((p) => p !== c) : picked.length < 3 ? [...picked, c] : picked)
  }
  function addOther() {
    const t = other.trim()
    if (!t || picked.length >= 3) return
    setPicked([...picked, t])
    setOther('')
    setWriting(false)
  }
  function close() {
    if (picked.length > 0) keepGoodThings(date, picked)
    setClosed(true)
    onClose(picked)
  }

  if (closed) {
    return (
      <section className="flow-body night-done" aria-labelledby="night-done-title">
        <h2 id="night-done-title" className="display">
          That's your day.
        </h2>
        {picked.length > 0 && <p className="muted">Kept in your notebook: {picked.join(' · ')}.</p>}
        {isSaturday(date) ? <p>{SUNDAY_LINE}</p> : <Upcoming label="Tomorrow" themes={tomorrowThemes} />}
        <p className="serif-line">
          {isSaturday(date)
            ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.'
            : 'Sleep well. Your next three open at 05:00.'}
        </p>
      </section>
    )
  }

  return (
    <section className="flow-body night" aria-labelledby="good-title">
      <h2 id="good-title" className="display">
        Three good things from today.
      </h2>
      <p className="muted">
        Tap three. Small counts. <strong>{picked.length} of 3</strong>
      </p>
      <div className="chips" role="group" aria-label="Good things">
        {all.map((c) => (
          <button key={c} type="button" className="chip-toggle" aria-pressed={picked.includes(c)} onClick={() => toggle(c)}>
            {c}
          </button>
        ))}
        {!writing && (
          <button type="button" className="chip-toggle dashed" onClick={() => setWriting(true)} disabled={picked.length >= 3}>
            Something else
          </button>
        )}
      </div>
      {writing && (
        <form
          className="row-gap"
          onSubmit={(e) => {
            e.preventDefault()
            addOther()
          }}
        >
          <input
            className="field"
            aria-label="Something else that was good"
            value={other}
            maxLength={MAX_LINE}
            autoFocus
            onChange={(e) => setOther(e.target.value)}
          />
          <button type="submit" className="btn small" disabled={!other.trim()}>
            Add
          </button>
        </form>
      )}
      <p className="muted small">
        <Icon name="lock" size={14} /> Kept in your notebook, on this phone only.
      </p>

      {onPractice && (
        <button type="button" className="practice-row" onClick={() => onPractice(PRACTICES.savour)}>
          <span>
            <strong>{PRACTICES.savour.name}</strong>
            <span className="muted small"> Optional · {PRACTICES.savour.minutes} minutes · evidence-based</span>
          </span>
          <span className="play" aria-hidden="true">
            <Icon name="play" size={16} />
          </span>
        </button>
      )}

      {nod}

      <button type="button" className="btn wide outline" onClick={close}>
        Close the day
      </button>
    </section>
  )
}
