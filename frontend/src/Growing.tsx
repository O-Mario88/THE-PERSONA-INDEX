import { useEffect, useState } from 'react'
import { recalledChoice, type Question } from './api'
import { ShareSheet } from './ShareCard'
import type { CircleView } from './social'

// Growing Together (Edwin, 2026-10-25): real, anonymous totals that show a
// person they are not the only one going through something. A question's
// split shows only once enough people have answered (the Human Pulse
// threshold, sent by the server). No feed, no likes, no comments, never a
// named person, never a rank or a score.

type Split = { questionId: string; totalVotes: number; options: { optionId: string; count: number; percent: number }[] }
type GrowingView = { date: string; answers: number; min: number; questions: Split[] }

const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export function Growing({ date, questions, circle }: { date: string; questions: Question[]; circle: CircleView | null }) {
  const [g, setG] = useState<GrowingView | null>(null)
  const [sharing, setSharing] = useState<{ name: string; line: string } | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/growing?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && setG(body), () => live && setG(null))
    return () => {
      live = false
    }
  }, [date])

  const monday = mondayOf(date)
  const newThisWeek = circle ? circle.friends.filter((f) => f.since >= monday).length : null

  // For each question with a split, the person's own answer if they gave
  // one; otherwise the answer most people chose.
  const shares = (g?.questions ?? [])
    .filter((s) => s.totalVotes >= (g?.min ?? Infinity))
    .flatMap((s) => {
      const q = questions.find((x) => x.id === s.questionId)
      if (!q) return []
      const mine = recalledChoice(q.id)
      const pick = s.options.find((o) => o.optionId === mine) ?? [...s.options].sort((a, b) => b.count - a.count)[0]
      const option = q.options.find((o) => o.id === pick?.optionId)
      if (!pick || !option) return []
      const same = pick.optionId === mine
      const text = same
        ? `${Math.round(pick.percent)}% of ${s.totalVotes} people chose “${option.label}” too. You’re not the only one.`
        : `${Math.round(pick.percent)}% of ${s.totalVotes} people chose “${option.label}”.`
      return [{ id: q.id, prompt: q.prompt, text, same, percent: Math.round(pick.percent), label: option.label }]
    })

  return (
    <section className="growing" aria-labelledby="growing-title">
      <div className="page-head">
        <p className="label">Today</p>
        <h3 id="growing-title" className="title">
          Growing together
        </h3>
        <p>How people are showing up today, so you know you are not alone in it.</p>
      </div>

      <div className="growing-tiles" role="group" aria-label="Today in numbers">
        <p className="stat-tile">
          <span className="stat-num">{g ? g.answers : '–'}</span>
          <span className="stat-name">answers to today’s questions</span>
        </p>
        {circle && (
          <p className="stat-tile">
            <span className="stat-num">{circle.active}</span>
            <span className="stat-name">friends active this week</span>
          </p>
        )}
        {newThisWeek !== null && (
          <p className="stat-tile">
            <span className="stat-num">{newThisWeek}</span>
            <span className="stat-name">new connections this week</span>
          </p>
        )}
      </div>

      {shares.length > 0 ? (
        <ul className="growing-list">
          {shares.map((s) => (
            <li key={s.id} className="card">
              <p className="eyebrow">{s.same ? 'You’re not alone' : 'Today, most people'}</p>
              <p className="growing-prompt">{s.prompt}</p>
              <p className="growing-share">{s.text}</p>
              {s.same && <p className="muted small">If it is hard for you, someone in your circle may be carrying the same thing. A quiet nod tonight can help.</p>}
              <button type="button" className="text-button" onClick={() => setSharing({ name: `${s.percent}% chose “${s.label}”`, line: s.prompt })}>
                Share this
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notice">
          {g ? `Each question’s split shows once ${g.min} people have answered it. It fills in through the day.` : 'Today’s totals will show here.'}
        </p>
      )}
      <p className="muted small">Anonymous totals only. No one sees who chose what, and private answers are never counted here.</p>
      {sharing && <ShareSheet content={{ eyebrow: 'Growing together · today', name: sharing.name, line: sharing.line }} onClose={() => setSharing(null)} />}
    </section>
  )
}
