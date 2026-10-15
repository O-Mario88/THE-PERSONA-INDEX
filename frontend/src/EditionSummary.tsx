import { useEffect, useState, type CSSProperties } from 'react'
import { playedDays, recalledChoice, type Question } from './api'
import { adviceFor } from './advice'
import { encodeCompare } from './compare'
import { awardEdition, levelFor, loadGame, pickMove, todaysMove } from './game'
import { daysPlayedThisWeek, THEME_COUNT } from './themes'

// When the evening check-in comes, as the morning summary tells it.
export type CheckIn = 'later' | 'open' | 'tomorrow'

type Props = {
  date: string
  edition: number
  questions: Question[]
  checkIn: CheckIn
  answers: [string, string][] // what a compare link may carry: no intimate answers
}

const CHECK_IN_LINE: Record<CheckIn, string> = {
  later: 'Your evening check-in opens at 5 pm: a quick follow-up on how today went.',
  open: 'Your evening check-in is open.',
  tomorrow: 'Answer before 5 pm tomorrow and the evening check-in will follow up on how your day went.',
}

// The end of the morning: advice built from today's insight cards (which stay
// on screen above), one move to try today, and progress kept on this phone.
// Nothing here resets or punishes a missed day.
export function EditionSummary({ date, edition, questions, checkIn, answers }: Props) {
  const [copied, setCopied] = useState(false)
  const [bonus, setBonus] = useState(0)
  const [move, setMove] = useState(() => todaysMove(date))
  const cards = questions
    .map((q) => ({ q, o: q.options.find((o) => o.id === recalledChoice(q.id)) }))
    .filter((c): c is { q: Question; o: NonNullable<typeof c.o> } => !!c.o?.insight)
  const advice = adviceFor(cards.map((c) => c.o))
  const headingId = `morning-${edition}`

  useEffect(() => {
    if (cards.length > 0) setBonus(awardEdition(date))
    // award once per edition, when the recap first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  function choose(questionId: string, step: string) {
    pickMove(date, questionId, step)
    setMove(todaysMove(date))
  }

  async function compare() {
    const link = `${window.location.origin}/#c=${encodeCompare({ e: edition, a: answers })}`
    try {
      const text = `I answered today's Persona Index. Answer the same questions and see where we agree: ${link}`
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // the person closed the share sheet; nothing to do
    }
  }

  return (
    <section className="card summary" aria-labelledby={headingId}>
      {bonus > 0 && <Confetti />}
      <div className="summary-head">
        <span className="summary-badge" aria-hidden="true">
          🏆
        </span>
        <div>
          <h2 id={headingId}>Morning complete</h2>
          <p className="muted">
            Edition #{edition} · {cards.length} {cards.length === 1 ? 'insight' : 'insights'} today
            {bonus > 0 && <span className="points-pill">+{bonus} pts bonus</span>}
          </p>
        </div>
      </div>

      {cards.length > 0 && (
        <>
          <div className="advice" role="note" aria-label="Advice for you">
            <h3>
              <span aria-hidden="true">💡 </span>Advice for you
            </h3>
            <p>{advice.headline}</p>
            {advice.points.map((p) => (
              <div key={p.trait} className="advice-point">
                <p className="trait-name">{p.name}</p>
                <p>{p.strength}</p>
                <p>
                  <strong>How to grow:</strong> {p.grow}
                </p>
              </div>
            ))}
          </div>

          <div className="steps" role="group" aria-labelledby={`${headingId}-move`}>
            <h3 id={`${headingId}-move`}>
              <span aria-hidden="true">🎯 </span>Pick your move
            </h3>
            <ul>
              {cards.map(({ q, o }) => {
                const picked = move?.questionId === q.id
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      className={picked ? 'step done' : 'step'}
                      aria-pressed={picked}
                      disabled={move?.tried !== undefined}
                      onClick={() => choose(q.id, o.insight!.step)}
                    >
                      <span className="step-box" aria-hidden="true">
                        {picked ? '✓' : ''}
                      </span>
                      <span>{o.insight!.step}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="muted">{move ? 'The evening check-in will ask how it went.' : 'Pick one to try.'}</p>
          </div>
        </>
      )}

      <p className="tomorrow">
        <span aria-hidden="true">🌙 </span>
        {CHECK_IN_LINE[checkIn]}
      </p>

      <LevelBlock date={date} />

      {answers.length > 0 && (
        <button type="button" className="option" onClick={compare}>
          Compare with someone
        </button>
      )}
      {copied && <p className="muted">Copied. Paste it anywhere.</p>}
      <p className="muted insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

// The level, points and the week's play, all kept on this phone.
export function LevelBlock({ date }: { date: string }) {
  const game = loadGame()
  const level = levelFor(game.insights)
  const played = daysPlayedThisWeek(playedDays(), date)
  return (
    <div className="level" aria-label="Your level">
      <p className="level-name">
        <span aria-hidden="true">{level.icon} </span>
        {level.name} · {game.points} pts
      </p>
      <div className="level-bar" aria-hidden="true">
        <div className="level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      <p className="muted">
        {level.next
          ? `${level.toNext} more ${level.toNext === 1 ? 'insight' : 'insights'} to ${level.next.name}`
          : 'Top level reached'}
        {' · '}
        {game.themes.length} of {THEME_COUNT} life areas discovered · played {played} of the last 7 days
      </p>
    </div>
  )
}

export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}
