import { useState } from 'react'
import { recalledChoice, recalledEvening, saveStep, SKIPPED, type Question, type StepStatus } from './api'
import { adviceFor } from './advice'
import { isSaturday, type FollowUpItem } from './day'
import { movesOn, setMoveStatus, startedInEvening, type Move } from './moves'
import { themeName, themeStyle, themeVars } from './themes'

// The close of each sitting. The morning's: what the answers add up to, the
// moves picked and what comes at 4 pm. The evening's: how the morning's moves
// went, one thought for tomorrow and tomorrow's themes. The insight cards are
// not repeated; they were just shown. Nothing here is scored, shared or set
// against anyone else, and nothing resets or punishes a missed day.

type Props = {
  date: string
  questions: Question[] // this sitting's questions
  tomorrowThemes: string[]
} & (
  | { sitting: 'morning'; later: { questions: boolean; checkIn: boolean } } // what opens at 4 pm
  | { sitting: 'evening'; followUps: FollowUpItem[] }
)

// Saturday looks ahead to Sunday, the review day.
const SUNDAY_LINE = 'Tomorrow is Sunday: no new questions, just your week in the mirror.'

const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

const REPLIES: Record<Exclude<StepStatus, 'started'>, string> = {
  helped: "Glad it helped. Small things like this add up, and you'll see them in your mirror.",
  no_change: 'Good that you tried. Some steps take a few goes before they show anything.',
  not_tried: "That's okay. The day had other plans. It'll still be there tomorrow.",
}

function laterLine({ questions, checkIn }: { questions: boolean; checkIn: boolean }): string {
  if (questions && checkIn) return "Three more questions open at 4 pm, and I'll ask how this morning went."
  if (questions) return 'Three more questions open at 4 pm.'
  return "At 4 pm I'll ask how this morning went."
}

export function DayClose(props: Props) {
  const { date, questions, tomorrowThemes, sitting } = props
  const headingId = `close-${sitting}-${date}`
  const chosen = questions.flatMap((q) => q.options.filter((o) => o.id === recalledChoice(q.id)))
  const comesLater = props.sitting === 'morning' && (props.later.questions || props.later.checkIn)
  const endsDay = !comesLater

  let title = 'Day complete'
  let lead = "That's your day, in your own answers."
  if (props.sitting === 'morning') {
    title = comesLater ? 'Morning done.' : 'Done for today.'
    lead = "Here's what your answers add up to this morning."
  }

  return (
    <section className={endsDay ? 'screen done evening-done' : 'screen done'} aria-labelledby={headingId}>
      <h2 id={headingId} className="done-title">
        {title}
      </h2>
      <p className="muted">{lead}</p>

      {questions.length > 0 && (
        <Tiles label={sitting === 'morning' ? "This morning's answers" : "This evening's answers"} questions={questions} />
      )}

      {props.sitting === 'morning' ? (
        <>
          <Thread chosen={chosen.filter((o) => o.insight)} />
          <MorningMoves date={date} />
          {comesLater && <p className="tomorrow">{laterLine(props.later)}</p>}
        </>
      ) : (
        <>
          <MoveCheck date={date} />
          <ForTomorrow
            chosen={[
              ...props.followUps.map((f) => f.said),
              ...props.followUps.flatMap(({ question }) =>
                question.followUp!.options.filter((o) => o.id === recalledEvening(question.id)),
              ),
              ...chosen,
            ]}
          />
        </>
      )}

      {endsDay && (
        <>
          {isSaturday(date) && <p className="tomorrow">{SUNDAY_LINE}</p>}
          {tomorrowThemes.length > 0 && (
            <p className="tomorrow">
              <span className="eyebrow">Tomorrow</span> {tomorrowThemes.map(themeName).join(' · ')}
            </p>
          )}
          <p className="check-in">
            {isSaturday(date)
              ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.'
              : 'Sleep well. See you tomorrow morning.'}
          </p>
        </>
      )}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

// One tile per question of the sitting: its theme, and whether it was
// answered, skipped or kept private. Never the answer itself.
function Tiles({ label, questions }: { label: string; questions: Question[] }) {
  return (
    <ul className="tiles" aria-label={label}>
      {questions.map((q) => {
        const c = recalledChoice(q.id)
        const status = !c || c === SKIPPED ? 'skipped' : q.care === 'intimate' ? 'private' : 'answered'
        return (
          <li key={q.id} className={status === 'skipped' ? 'tile' : 'tile on'} style={themeVars(q.theme)}>
            <span className="tile-icon" aria-hidden="true">
              {themeStyle(q.theme).icon}
            </span>
            <span className="tile-theme">{q.theme ? themeName(q.theme) : 'Today'}</span>
            <span className="tile-status">{status}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Thread({ chosen }: { chosen: { traits?: Record<string, number> }[] }) {
  if (chosen.length === 0) return null
  const advice = adviceFor(chosen)
  return (
    <div className="thread" role="note" aria-label="Today's thread">
      <p className="eyebrow">Today's thread</p>
      <p className="thread-headline">{advice.headline}</p>
      {advice.points.map((p) => (
        <div key={p.trait} className="thread-point">
          <p className="thread-name">{p.name}</p>
          <p>{p.strength}</p>
          <p>
            <strong>For the rest of today:</strong> {p.grow}
          </p>
        </div>
      ))}
    </div>
  )
}

function MorningMoves({ date }: { date: string }) {
  const moves = movesOn(date)
  return (
    <div className="moves" role="group" aria-label="Moves you'll try">
      <p className="eyebrow">Moves you'll try</p>
      {moves.length > 0 ? (
        <ul>
          {moves.map((m) => (
            <li key={m.questionId}>
              <span className="move-dot" aria-hidden="true" />
              {m.step}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No move picked today. That's okay; noticing is a step too.</p>
      )}
    </div>
  )
}

// How each of the morning's moves went. A move picked this evening has had
// no day yet, so the mirror asks about it later.
function MoveCheck({ date }: { date: string }) {
  const [moves, setMoves] = useState(() => movesOn(date))
  if (moves.length === 0) return null

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
    <div className="moves" role="group" aria-label="Your moves">
      <p className="eyebrow">Your moves</p>
      <ul className="move-checks">
        {moves.map((m) => (
          <li key={m.questionId}>
            <p className="move-step">{m.step}</p>
            {m.status !== 'started' ? (
              <p className="move-reply">{REPLIES[m.status]}</p>
            ) : startedInEvening(m) ? (
              <p className="muted">Started this evening. Give it a go tomorrow; your mirror will ask how it went.</p>
            ) : (
              <>
                <p className="muted">How did it go?</p>
                <div className="move-buttons">
                  <button type="button" className="option" onClick={() => answer(m, 'helped')}>
                    It helped
                  </button>
                  <button type="button" className="option" onClick={() => answer(m, 'no_change')}>
                    No change yet
                  </button>
                  <button type="button" className="option" onClick={() => answer(m, 'not_tried')}>
                    Didn't get to it
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// The day's clearest leaning, from the morning answers checked in on, the
// check-ins and the evening's answers: one thing to carry into tomorrow.
function ForTomorrow({ chosen }: { chosen: { traits?: Record<string, number> }[] }) {
  const top = adviceFor(chosen).points[0]
  return (
    <div className="thread" role="note" aria-label="For tomorrow">
      <p className="eyebrow">For tomorrow</p>
      {top && <p className="thread-name">{top.name}</p>}
      <p>{top ? top.grow : QUIET_DAY}</p>
    </div>
  )
}
