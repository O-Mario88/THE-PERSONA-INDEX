import { useState, type ReactNode } from 'react'
import type { StepStatus } from './api'
import { movesOn, setMoveStatus, startedInEvening, type Move } from './moves'
import { loadJSON, saveJSON } from './storage'
import { STEP_REPLIES } from './words'

// The midday window (11:30 to 14:30): a one-tap check on the morning's
// step, today's friend once the circle has three (FriendDrop), and the day's
// read. About forty-five seconds; then nothing until the afternoon.

const laterKey = (date: string) => `pi.midday.${date}`
function middayLater(date: string): string[] {
  const v = loadJSON(laterKey(date))
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// StepNudge is the one-line check: "Your morning step, tried it yet?"
// In the evening it asks how the morning's step went, before the evening three.
export function StepNudge({ date, evening, onAnswered }: { date: string; evening?: boolean; onAnswered?: () => void }) {
  const [moves, setMoves] = useState(() => movesOn(date).filter((m) => !startedInEvening(m)))
  const [later, setLater] = useState(() => middayLater(date))
  const [tried, setTried] = useState<string | null>(null)
  const open = moves.find((m) => m.status === 'started' && (evening || !later.includes(m.questionId)))
  const answeredNow = moves.find((m) => m.status !== 'started' && m.questionId === tried)
  if (answeredNow) {
    return (
      <p className="nudge done" role="status">
        {answeredNow.status !== 'started' && STEP_REPLIES[answeredNow.status]}
      </p>
    )
  }
  if (!open) return null
  function answer(m: Move, status: StepStatus) {
    setMoveStatus(m.questionId, status, date).catch(() => {
      // kept on the phone, and sent again when the app next opens
    })
    setMoves(moves.map((x) => (x.questionId === m.questionId ? { ...x, status } : x)))
    setTried(m.questionId)
    onAnswered?.()
  }
  function notYet(m: Move) {
    const next = [...later, m.questionId]
    saveJSON(laterKey(date), next)
    setLater(next)
    onAnswered?.()
  }
  if (evening) {
    return (
      <div className="nudge evening" role="group" aria-label="This morning's step">
        <p className="nudge-text">
          This morning's step — <strong>{open.step}</strong> Did it help?
        </p>
        <div className="nudge-buttons">
          <button type="button" className="btn small amber" onClick={() => answer(open, 'helped')}>
            It helped
          </button>
          <button type="button" className="btn small ghost" onClick={() => answer(open, 'no_change')}>
            No change yet
          </button>
          <button type="button" className="btn small ghost" onClick={() => answer(open, 'not_tried')}>
            Not today
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="nudge" role="group" aria-label="Your morning step">
      {tried === open.questionId ? (
        <>
          <p className="nudge-text">Did it help?</p>
          <div className="nudge-buttons">
            <button type="button" className="btn small sage" onClick={() => answer(open, 'helped')}>
              It helped
            </button>
            <button type="button" className="btn small ghost" onClick={() => answer(open, 'no_change')}>
              No change yet
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="nudge-text">
            <strong>Your morning step</strong> — tried it yet? <span className="sr-only">{open.step}</span>
          </p>
          <div className="nudge-buttons">
            <button type="button" className="btn small sage" onClick={() => setTried(open.questionId)}>
              Yes
            </button>
            <button type="button" className="btn small ghost" onClick={() => notYet(open)}>
              Not yet
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function MiddayScreen({
  date,
  friend,
  read,
  morningOpen,
  onMorning,
  onDone,
}: {
  date: string
  friend: ReactNode // today's friend, or the circle's invitation
  read: ReactNode
  morningOpen: boolean // the morning three are not all answered
  onMorning: () => void
  onDone: () => void
}) {
  return (
    <section className="flow-body midday" aria-label="Midday">
      <StepNudge date={date} onAnswered={onDone} />
      {morningOpen && (
        <div className="nudge" role="group" aria-label="Your morning three">
          <p className="nudge-text">
            <strong>Your morning three</strong> — still open until 17:00.
          </p>
          <div className="nudge-buttons">
            <button type="button" className="btn small sage" onClick={onMorning}>
              Answer them
            </button>
          </div>
        </div>
      )}
      {friend}
      {read}
    </section>
  )
}
