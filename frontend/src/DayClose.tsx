import { useState } from 'react'
import { recalledChoice, SKIPPED, type Question, type StepStatus } from './api'
import { adviceFor } from './advice'
import { isSaturday, opensAt } from './day'
import { movesOn, setMoveStatus, startedInEvening, type Move } from './moves'
import { Upcoming } from './Sittings'
import { themeName, themeStyle, themeVars } from './themes'

// The close of each sitting. The morning's: what the answers add up to,
// honestly, the small steps picked and what opens at 5 pm. The evening's: how
// the morning's small steps went, one thought for tomorrow and what opens at 5 am. The
// insight cards are not repeated; they were just shown. Nothing here is
// scored, shared or set against anyone else, and nothing resets or punishes
// a missed day.

type Props = {
  date: string
  questions: Question[] // this sitting's questions
  tomorrowThemes: string[]
} & (
  | { sitting: 'morning'; eveningThemes: string[] | null } // null: no evening sitting today
  | { sitting: 'evening'; morning: Question[] }
)

// Saturday looks ahead to Sunday, the review day.
const SUNDAY_LINE = 'Tomorrow is Sunday: no new questions, just your week in the mirror.'

const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

const REPLIES: Record<Exclude<StepStatus, 'started'>, string> = {
  helped: "Glad it helped. Small things like this add up, and you'll see them in your mirror.",
  no_change: 'Good that you tried. Some steps take a few goes before they show anything.',
  not_tried: "That's okay. The day had other plans. It'll still be there tomorrow.",
}

const chosenIn = (questions: Question[]) => questions.flatMap((q) => q.options.filter((o) => o.id === recalledChoice(q.id)))

export function DayClose(props: Props) {
  const { date, questions, tomorrowThemes, sitting } = props
  const headingId = `close-${sitting}-${date}`
  const chosen = chosenIn(questions)
  const eveningThemes = props.sitting === 'morning' ? props.eveningThemes : null
  const endsDay = !eveningThemes

  let title = 'Day complete'
  let lead = "That's your day, in your own answers."
  if (props.sitting === 'morning') {
    title = eveningThemes ? 'Morning done.' : 'Done for today.'
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
          {eveningThemes && (
            <Upcoming
              label={`Your evening three · ${opensAt('evening')}`}
              themes={eveningThemes}
              note={`Go about your day. They'll be waiting for you at ${opensAt('evening')}.`}
            />
          )}
        </>
      ) : (
        <>
          <MoveCheck date={date} />
          <ForTomorrow chosen={[...chosenIn(props.morning), ...chosen]} />
        </>
      )}

      {endsDay && (
        <>
          {isSaturday(date) ? (
            <p className="tomorrow">{SUNDAY_LINE}</p>
          ) : (
            <Upcoming label="Tomorrow" themes={tomorrowThemes} />
          )}
          <p className="sign-off">
            {isSaturday(date)
              ? 'Sleep well. Tomorrow is for looking back: your week will be waiting in your mirror.'
              : `Sleep well. Your next three open at ${opensAt('morning')}.`}
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
          <p className="honest">
            <strong>The honest part:</strong> {p.honest}
          </p>
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
    <div className="moves" role="group" aria-label="Small steps you'll try">
      <p className="eyebrow">Small steps you'll try</p>
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
        <p className="muted">No small step picked today. That's okay; noticing counts too.</p>
      )}
    </div>
  )
}

// How each of the morning's small steps went. One picked this evening has had
// no day yet, so the mirror asks about it later.
function MoveCheck({ date }: { date: string }) {
  return <StepCheck date={date} label="Your small steps" pick={() => movesOn(date)} />
}

// StepCheck asks how each step went, and keeps the answer here and on the
// server (moves.ts). Sunday's review asks it of the whole week's steps.
export function StepCheck({ date, label, pick }: { date: string; label: string; pick: () => Move[] }) {
  const [moves, setMoves] = useState(pick)
  if (moves.length === 0) return null

  function answer(m: Move, status: StepStatus) {
    setMoveStatus(m.questionId, status, date).catch(() => {
      // kept on the phone, and sent again when the app next opens
    })
    setMoves(moves.map((x) => (x.questionId === m.questionId ? { ...x, status } : x)))
  }

  return (
    <div className="moves" role="group" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <ul className="move-checks">
        {moves.map((m) => (
          <li key={m.questionId}>
            <p className="move-step">{m.step}</p>
            {m.status !== 'started' ? (
              <p className="move-reply">{REPLIES[m.status]}</p>
            ) : startedInEvening(m) && m.date === date ? (
              <p className="muted">Started this evening. Give it a go tomorrow, and I'll ask how it went in your mirror.</p>
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

// The day's clearest leaning, from the morning's and the evening's answers:
// one thing to carry into tomorrow.
function ForTomorrow({ chosen }: { chosen: { traits?: Record<string, number> }[] }) {
  const top = adviceFor(chosen).points[0]
  return (
    <div className="thread" role="note" aria-label="For tomorrow">
      <p className="eyebrow">For tomorrow</p>
      {top && <p className="thread-name">{top.name}</p>}
      {top && (
        <p className="honest">
          <strong>The honest part:</strong> {top.honest}
        </p>
      )}
      <p>{top ? top.grow : QUIET_DAY}</p>
    </div>
  )
}
