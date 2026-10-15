import { useEffect, useState } from 'react'
import { recalledEvening } from './api'
import { adviceFor } from './advice'
import type { FollowUpItem } from './day'
import { Confetti, LevelBlock } from './EditionSummary'
import { awardEvening, markMove, POINTS_PER_STEP, todaysMove } from './game'
import { themeName } from './themes'

type Props = {
  date: string
  edition: number
  items: FollowUpItem[]
  tomorrowThemes: string[]
}

const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

// The end of the day: whether today's move was tried, one thought to carry
// into tomorrow, and tomorrow's themes. Short on purpose; the day is done.
export function EveningSummary({ date, edition, items, tomorrowThemes }: Props) {
  const [bonus, setBonus] = useState(0)
  const [move, setMove] = useState(() => todaysMove(date))
  const reflections = items
    .map(({ question }) => question.followUp!.options.find((o) => o.id === recalledEvening(question.id)))
    .filter((o) => o !== undefined)
  // The day's clearest leaning, from this morning's answers and tonight's.
  const top = adviceFor([...items.map((i) => i.said), ...reflections]).points[0]
  const headingId = `evening-${edition}`

  useEffect(() => {
    if (reflections.length > 0) setBonus(awardEvening(date))
    // award once per day, when the summary first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  function answerMove(tried: boolean) {
    markMove(date, tried)
    setMove(todaysMove(date))
  }

  return (
    <section className="card summary evening-summary" aria-labelledby={headingId}>
      {bonus > 0 && <Confetti />}
      <div className="summary-head">
        <span className="summary-badge" aria-hidden="true">
          🌙
        </span>
        <div>
          <h2 id={headingId}>Day complete</h2>
          <p className="muted">
            {reflections.length} {reflections.length === 1 ? 'reflection' : 'reflections'} tonight
            {bonus > 0 && <span className="points-pill">+{bonus} pts bonus</span>}
          </p>
        </div>
      </div>

      {move && (
        <div className="move-check" role="group" aria-labelledby={`${headingId}-move`}>
          <h3 id={`${headingId}-move`}>
            <span aria-hidden="true">🎯 </span>Your move
          </h3>
          {move.tried === undefined ? (
            <>
              <p>Did you get a chance to try it?</p>
              <p className="move-step">{move.step}</p>
              <div className="confirm">
                <button type="button" className="option" onClick={() => answerMove(true)}>
                  Yes, I tried it <span className="step-points">+{POINTS_PER_STEP}</span>
                </button>
                <button type="button" className="option" onClick={() => answerMove(false)}>
                  Not yet
                </button>
              </div>
            </>
          ) : move.tried ? (
            <p>
              <span aria-hidden="true">✓ </span>You tried your move. That is how small changes start.
            </p>
          ) : (
            <p>That's fine. Try it when the moment comes, or pick a new one tomorrow.</p>
          )}
        </div>
      )}

      <div className="advice" role="note" aria-label="For tomorrow">
        <h3>
          <span aria-hidden="true">🌱 </span>For tomorrow
        </h3>
        {top && <p className="trait-name">{top.name}</p>}
        <p>{top ? top.grow : QUIET_DAY}</p>
      </div>

      <LevelBlock date={date} />

      {tomorrowThemes.length > 0 && (
        <p className="tomorrow">
          <span aria-hidden="true">🌅 </span>Tomorrow: {tomorrowThemes.map(themeName).join(' · ')}
        </p>
      )}
      <p className="tomorrow">See you tomorrow morning.</p>
      <p className="muted insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}
