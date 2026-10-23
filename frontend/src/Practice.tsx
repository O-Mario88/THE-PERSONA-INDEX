import { useEffect, useState } from 'react'
import { notePractice } from './notebook'
import type { Practice } from './practices'

// One short practice, step by step, with a quiet timer the person starts
// when they are ready. Nothing typed, nothing sent; finishing it is noted in
// the notebook on this phone. No ads during a practice (the review of
// 2026-10-15: one may come after it ends, never during).
export function PracticeScreen({ practice, date, onBack }: { practice: Practice; date: string; onBack: () => void }) {
  const total = practice.minutes * 60
  const [left, setLeft] = useState<number | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (left === null || left <= 0) return
    const id = setTimeout(() => setLeft((s) => (s === null ? s : s - 1)), 1000)
    return () => clearTimeout(id)
  }, [left])

  function finish() {
    notePractice(date, practice.id)
    setDone(true)
  }

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <section className="screen practice" aria-labelledby="practice-title">
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      <p className="eyebrow">A practice · {practice.minutes} min</p>
      <h2 id="practice-title" className="done-title">
        {practice.name}
      </h2>
      <ol className="practice-steps">
        {practice.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {!done && (
        <div className="practice-timer" role="timer" aria-live="off" aria-label="Time left">
          {left === null ? (
            <button type="button" className="pill-button" onClick={() => setLeft(total)}>
              Start {practice.minutes} {practice.minutes === 1 ? 'minute' : 'minutes'}
            </button>
          ) : left > 0 ? (
            <p className="practice-clock">{clock(left)}</p>
          ) : (
            <p className="practice-clock" role="status">
              Time.
            </p>
          )}
          <button type="button" className="option" onClick={finish}>
            I've done it
          </button>
        </div>
      )}
      {done && (
        <div className="notice" role="status">
          <p>{practice.end}</p>
          <button type="button" className="option" onClick={onBack}>
            Back
          </button>
        </div>
      )}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}
