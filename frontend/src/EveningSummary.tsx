import { useEffect, useState } from 'react'
import { recalledEvening, saveStep, type StepStatus } from './api'
import { adviceFor } from './advice'
import type { FollowUpItem } from './day'
import { Confetti, LevelLine } from './EditionSummary'
import { awardEvening, movesOn, POINTS_PER_STEP, setMoveStatus, type Move } from './game'
import { themeName } from './themes'

type Props = {
  date: string
  edition: number
  items: FollowUpItem[]
  tomorrowThemes: string[]
}

const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

const REPLIES: Record<Exclude<StepStatus, 'started'>, string> = {
  helped: "Glad it helped. Small things like this add up, and you'll see them in your mirror.",
  no_change: "Good that you tried. Some steps take a few goes before they show anything.",
  not_tried: "That's okay. The day had other plans. It'll still be there tomorrow.",
}

// The end of the day: how each move went, one thought to carry into
// tomorrow, and tomorrow's themes. Short on purpose; the day is done.
export function EveningSummary({ date, edition, items, tomorrowThemes }: Props) {
  const [bonus, setBonus] = useState(0)
  const [moves, setMoves] = useState(() => movesOn(date))
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

  function answer(m: Move, status: StepStatus) {
    setMoveStatus(m.questionId, status)
    setMoves(movesOn(date))
    if (m.optionId) {
      saveStep(m.questionId, m.optionId, status, date).catch(() => {
        // kept on the phone; the mirror just won't count it
      })
    }
  }

  return (
    <section className="screen done evening-done" aria-labelledby={headingId}>
      {bonus > 0 && <Confetti />}
      <h2 id={headingId} className="done-title">
        Day complete
      </h2>
      <p className="muted">
        {reflections.length} {reflections.length === 1 ? 'reflection' : 'reflections'} tonight
        {bonus > 0 && <span className="points-pill">+{bonus} bonus</span>}
      </p>

      {moves.length > 0 && (
        <div className="moves" role="group" aria-labelledby={`${headingId}-moves`}>
          <p className="eyebrow" id={`${headingId}-moves`}>
            Your moves
          </p>
          <ul className="move-checks">
            {moves.map((m) => (
              <li key={m.questionId}>
                <p className="move-step">{m.step}</p>
                {m.status === 'started' ? (
                  <>
                    <p className="muted">How did it go?</p>
                    <div className="move-buttons">
                      <button type="button" className="option" onClick={() => answer(m, 'helped')}>
                        It helped <span className="step-points">+{POINTS_PER_STEP}</span>
                      </button>
                      <button type="button" className="option" onClick={() => answer(m, 'no_change')}>
                        No change yet <span className="step-points">+{POINTS_PER_STEP}</span>
                      </button>
                      <button type="button" className="option" onClick={() => answer(m, 'not_tried')}>
                        Didn't get to it
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="move-reply">{REPLIES[m.status]}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="thread" role="note" aria-label="For tomorrow">
        <p className="eyebrow">For tomorrow</p>
        {top && <p className="thread-name">{top.name}</p>}
        <p>{top ? top.grow : QUIET_DAY}</p>
      </div>

      {tomorrowThemes.length > 0 && (
        <p className="tomorrow">
          <span className="eyebrow">Tomorrow</span> {tomorrowThemes.map(themeName).join(' · ')}
        </p>
      )}
      <p className="check-in">Sleep well. See you tomorrow morning.</p>
      <LevelLine date={date} />
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}
