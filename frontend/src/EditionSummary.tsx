import { useEffect, useState, type CSSProperties } from 'react'
import { playedDays, recalledChoice, type Question } from './api'
import { adviceFor } from './advice'
import { encodeCompare } from './compare'
import { awardEdition, awardStep, levelFor, loadGame, POINTS_PER_STEP, stepDone } from './game'
import { daysPlayedThisWeek, THEME_COUNT, themeName } from './themes'

type Props = {
  date: string
  edition: number
  questions: Question[]
  tomorrowThemes: string[]
  answers: [string, string][] // what a compare link may carry: no intimate answers
}

// The end of an edition: advice built from today's insight cards (which stay
// on screen above), the small steps to try, and progress kept on this phone. Nothing here
// resets or punishes a missed day.
export function EditionSummary({ date, edition, questions, tomorrowThemes, answers }: Props) {
  const [copied, setCopied] = useState(false)
  const [bonus, setBonus] = useState(0)
  const [, setVersion] = useState(0)
  const cards = questions
    .map((q) => ({ q, o: q.options.find((o) => o.id === recalledChoice(q.id)) }))
    .filter((c): c is { q: Question; o: NonNullable<typeof c.o> } => !!c.o?.insight)
  const advice = adviceFor(cards.map((c) => c.o))
  const game = loadGame()
  const level = levelFor(game.insights)
  const played = daysPlayedThisWeek(playedDays(), date)
  const headingId = `edition-${edition}`

  useEffect(() => {
    if (cards.length > 0) setBonus(awardEdition(date))
    // award once per edition, when the recap first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  function tick(questionId: string) {
    awardStep(questionId)
    setVersion((v) => v + 1)
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
          <h2 id={headingId}>Edition #{edition} complete</h2>
          <p className="muted">
            {cards.length} {cards.length === 1 ? 'insight' : 'insights'} today
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

          <div className="steps">
            <h3>
              <span aria-hidden="true">🎯 </span>Your moves this week
            </h3>
            <ul>
              {cards.map(({ q, o }) => {
                const done = stepDone(q.id)
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      className={done ? 'step done' : 'step'}
                      aria-pressed={done}
                      onClick={() => !done && tick(q.id)}
                    >
                      <span className="step-box" aria-hidden="true">
                        {done ? '✓' : ''}
                      </span>
                      <span>{o.insight!.step}</span>
                      {!done && <span className="step-points">+{POINTS_PER_STEP}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="muted">Tick a move once you have tried it.</p>
          </div>
        </>
      )}

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

      {answers.length > 0 && (
        <button type="button" className="option" onClick={compare}>
          Compare with someone
        </button>
      )}
      {copied && <p className="muted">Copied. Paste it anywhere.</p>}
      {tomorrowThemes.length > 0 && (
        <p className="tomorrow">
          <span aria-hidden="true">🌅 </span>Tomorrow: {tomorrowThemes.map(themeName).join(' · ')}
        </p>
      )}
      <p className="muted insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}
