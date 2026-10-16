import { useState } from 'react'
import { recalledChoice, SKIPPED, type Question, type StepStatus } from './api'
import { adviceFor, levelLine } from './advice'
import { isSaturday, opensAt } from './day'
import { Helpline } from './Helpline'
import { movesOn, setMoveStatus, startedInEvening, type Move } from './moves'
import { isHeavy, loadHistory, type AnswerRecord, type History } from './profile'
import { Upcoming } from './Sittings'
import { themeName, themeStyle, themeVars } from './themes'
import { NO_STEP, QUIET_DAY, STEP_REPLIES as REPLIES, SUNDAY_LINE } from './words'

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

// The records of the questions answered in a sitting: the phone's history
// where it has one (with any "That's me" or "Not me" tap), else the option
// picked, for a question that came without a theme and so was never recorded.
const answersIn = (h: History, questions: Question[], date: string): AnswerRecord[] =>
  questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    if (!id || id === SKIPPED) return []
    const kept = h.answers.find((a) => a.questionId === q.id)
    if (kept) return [kept]
    const o = q.options.find((x) => x.id === id)
    return o ? [{ date, questionId: q.id, theme: q.theme ?? '', depth: o.depth ?? 1, traits: o.traits ?? {}, optionId: o.id }] : []
  })

export function DayClose(props: Props) {
  const { date, questions, tomorrowThemes, sitting } = props
  const headingId = `close-${sitting}-${date}`
  const [history] = useState(loadHistory)
  const mine = answersIn(history, questions, date)
  const eveningThemes = props.sitting === 'morning' ? props.eveningThemes : null
  const endsDay = !eveningThemes
  const heavy = mine.some((a) => isHeavy(a.theme, a.depth))

  let title = "That's your day."
  let lead = "Here's what your answers add up to this evening."
  if (props.sitting === 'morning') {
    title = eveningThemes ? 'Morning done.' : "That's your day."
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

      {heavy && <Helpline />}

      {props.sitting === 'morning' ? (
        <>
          <Thread answers={mine} history={history} date={date} />
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
          <ForTomorrow answers={[...answersIn(history, props.morning, date), ...mine]} history={history} date={date} />
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

type Read = { answers: History['answers']; history: History; date: string }

function Thread({ answers, history, date }: Read) {
  if (answers.length === 0) return null
  const advice = adviceFor(answers, history, date, 'morning')
  return (
    <div className="thread" role="note" aria-label="Today's thread">
      <p className="eyebrow">Today's thread</p>
      <p className="thread-headline">{advice.headline}</p>
      {advice.points.map((p) => (
        <div key={p.trait} className="thread-point">
          <p className="thread-name">{p.name}</p>
          <p className="thread-level">{levelLine(p.earned)}</p>
          <p>{p.strength}</p>
          {p.honest && (
            <p className="honest">
              <strong>The honest part:</strong> {p.honest}
            </p>
          )}
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
        <p className="muted">{NO_STEP}</p>
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
// one thing to carry into tomorrow. Its honest part comes only once the
// leaning is a pattern.
function ForTomorrow({ answers, history, date }: Read) {
  const top = adviceFor(answers, history, date, 'evening').points[0]
  return (
    <div className="thread" role="note" aria-label="For tomorrow">
      <p className="eyebrow">For tomorrow</p>
      {top && <p className="thread-name">{top.name}</p>}
      {top && <p className="thread-level">{levelLine(top.earned)}</p>}
      {top?.honest && (
        <p className="honest">
          <strong>The honest part:</strong> {top.honest}
        </p>
      )}
      <p>{top ? top.grow : QUIET_DAY}</p>
    </div>
  )
}
