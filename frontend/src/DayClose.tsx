import { useState } from 'react'
import { recalledChoice, SKIPPED, type Question, type StepStatus } from './api'
import { adviceFor, levelLine } from './advice'
import { isMidday, isSaturday, opensAt, sittingStart } from './day'
import { Helpline } from './Helpline'
import { GoodThings, PlanCheckCard, PlanOffer } from './Keep'
import { movesOn, setMoveStatus, startedInEvening, type Move } from './moves'
import { planToCheck } from './notebook'
import type { Practice } from './practices'
import { FirstGlimpse } from './FirstGlimpse'
import { heavyPause, isLowMood, loadHistory, recordRoute, type AnswerRecord, type History, type Route } from './profile'
import { NEED_PHRASES, type Need } from './needs'
import { TapestryGrid } from './TapestryViews'
import { season } from './tapestry'
import { routeToAsk } from './reaching'
import { loadJSON, saveJSON } from './storage'
import { Upcoming } from './Sittings'
import { themeName, themeStyle } from './themes'
import { splitReveal } from './reveal'
import {
  NO_STEP,
  QUIET_DAY,
  ROUTE_ASK,
  ROUTE_REPLIES,
  ROUTE_WORDS,
  routeLead,
  STEP_REPLIES as REPLIES,
  SUNDAY_LINE,
} from './words'

// The close of each sitting. The morning's: what the answers add up to,
// honestly, the small steps picked and what opens at 5 pm. The evening's: how
// the morning's small steps went, one thought for tomorrow and what opens at 5 am. The
// insight cards are not repeated; they were just shown. Nothing here is
// scored, shared or set against anyone else, and nothing resets or punishes
// a missed day.

type Props = {
  date: string
  // The close of the person's very first sitting: their first glimpse in
  // place of the usual thread (firstWeek.ts), with their name if they gave one.
  glimpse?: { name: string | null }
  dayWithYou?: number // in the first week, the close counts the person's own days
  questions: Question[] // this sitting's questions
  tomorrowThemes: string[]
  onPractice?: (p: Practice) => void
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
  const { date, questions, tomorrowThemes, sitting, onPractice, glimpse, dayWithYou } = props
  const headingId = `close-${sitting}-${date}`
  const [history] = useState(loadHistory)
  // A plan made before this sitting began is asked about at its close.
  const [due] = useState(() => planToCheck(date, sittingStart(date, sitting)))
  const mine = answersIn(history, questions, date)
  const eveningThemes = props.sitting === 'morning' ? props.eveningThemes : null
  const endsDay = !eveningThemes
  const heavy = mine.some((a) => a.heavy || isLowMood(a.theme, a.depth))
  // After a heavy answer the close keeps to kind words: no honest part, no
  // plan or practice offered (profile.ts, heavyPause).
  const [paused] = useState(() => heavyPause(history, date))
  // The close of a person's first sitting opens with a first glimpse of
  // them (firstWeek.ts); never after a heavy answer, which keeps to kind words.
  const dayAnswers = props.sitting === 'evening' ? [...answersIn(history, props.morning, date), ...mine] : mine
  const glimpseFor = glimpse && !heavy ? glimpse : null

  let title = "That's your day."
  if (props.sitting === 'morning') {
    title = eveningThemes ? 'Morning done.' : "That's your day."
  }

  const s = season(date)
  const answered = questions.filter((q) => {
    const c = recalledChoice(q.id)
    return !!c && c !== SKIPPED
  }).length

  return (
    <section className={endsDay ? 'screen done close evening-done' : 'screen done close'} aria-labelledby={headingId}>
      <div className="close-hero">
        <div className="close-hero-top">
          <span className="close-hero-label">
            {dayWithYou === 1
              ? `Your first ${sitting}`
              : `${sitting === 'morning' ? 'Morning close' : 'Evening close'} · ${dayWithYou ? `your day ${dayWithYou}` : `day ${s.day} of 90`}`}
          </span>
          {questions.length > 0 && (
            <span className="close-hero-pill">
              {answered} of {questions.length}
            </span>
          )}
        </div>
        <TapestryGrid s={s} dark cols={15} weaving />
        <div className="close-hero-words">
          <h2 id={headingId} className="sr-only">
            {title}
          </h2>
          <p className="close-hero-title">{summaryLine(mine, sitting)}</p>
          <p className="close-hero-sub">Today's tile weaves in as you watch. A missed day stays open, and nothing resets.</p>
        </div>
      </div>

      {questions.length > 0 && (
        <Tiles label={sitting === 'morning' ? "This morning's answers" : "This evening's answers"} questions={questions} />
      )}

      {heavy && <Helpline />}

      {due && <PlanCheckCard plan={due} date={date} />}

      {props.sitting === 'morning' ? (
        <>
          {glimpseFor ? (
            <FirstGlimpse answers={mine} history={history} date={date} name={glimpseFor.name} />
          ) : (
            <Thread answers={mine} history={history} date={date} paused={paused} />
          )}
          {/* On the first glimpse an empty list of steps is left out. */}
          {!(glimpseFor && movesOn(date).length === 0) && <MorningMoves date={date} />}
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
          {glimpseFor && <FirstGlimpse answers={dayAnswers} history={history} date={date} name={glimpseFor.name} />}
          <MoveCheck date={date} />
          {!paused && <RouteCheck date={date} morning={props.morning} />}
          <ForTomorrow
            answers={[...answersIn(history, props.morning, date), ...mine]}
            history={history}
            date={date}
            onPractice={onPractice}
            paused={paused}
          />
        </>
      )}

      {(endsDay || sitting === 'evening') && <GoodThings date={date} />}

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

// The card shown above the sign-in sheet: the first card of the sitting, by
// its area and headline. Never a private one.
export function closeCard(questions: Question[]): { area: string; line: string } | undefined {
  for (const q of questions) {
    if (q.care === 'intimate') continue
    const o = q.options.find((x) => x.id === recalledChoice(q.id))
    if (o?.insight) return { area: q.theme ? themeName(q.theme) : 'Today', line: splitReveal(o.insight.reveal).headline }
  }
  return undefined
}

// A step picked this sitting and not yet tried.
export const hasOpenStep = (date: string) => movesOn(date).some((m) => m.status === 'started')

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six']

// The serif line under the tapestry: how many threads were woven, and what
// they reached for when the answers agree. Only what the answers say.
function summaryLine(answers: AnswerRecord[], sitting: 'morning' | 'evening'): string {
  const n = answers.length
  const when = sitting === 'morning' ? 'this morning' : 'this evening'
  if (n === 0) return `Nothing woven ${when}, and that's fine.`
  const head = `${COUNT[n] ?? n} new ${n === 1 ? 'thread' : 'threads'}`
  const needs = answers.map((a) => a.need).filter((x): x is Need => !!x)
  if (needs.length === n && needs.every((x) => x === needs[0]))
    return n === 1 ? `${head}, reaching for ${NEED_PHRASES[needs[0]]}.` : `${head}, all reaching for ${NEED_PHRASES[needs[0]]}.`
  return `${head} woven in ${when}.`
}

// One tile per question of the sitting: its theme, and whether it was
// answered, skipped or kept private. Never the answer itself.
function Tiles({ label, questions }: { label: string; questions: Question[] }) {
  return (
    <ul className="tiles sr-only" aria-label={label}>
      {questions.map((q) => {
        const c = recalledChoice(q.id)
        const status = !c || c === SKIPPED ? 'skipped' : q.care === 'intimate' ? 'private' : 'answered'
        return (
          <li key={q.id} className={status === 'skipped' ? 'tile' : 'tile on'}>
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

type Read = {
  answers: History['answers']
  history: History
  date: string
  onPractice?: (p: Practice) => void
  paused: boolean // after a heavy answer: no honest part and no plan offered
}

function Thread({ answers, history, date, paused }: Read) {
  if (answers.length === 0) return null
  const advice = adviceFor(answers, history, date, 'morning')
  return (
    <div className="thread" role="note" aria-label="Today's thread">
      <p className="eyebrow">Today's thread</p>
      <p className="thread-headline">{advice.headline}</p>
      {advice.points.length > 0 && (
        <details className="thread-more">
          <summary>{advice.points.length > 1 ? 'What each could mean' : 'What it could mean'}</summary>
      {advice.points.map((p) => (
        <div key={p.trait} className="thread-point">
          <p className="thread-name">{p.name}</p>
          <p className="thread-level">{levelLine(p.earned)}</p>
          <p>{p.strength}</p>
          {p.honest && !paused && (
            <p className="honest">
              <strong>The honest part:</strong> {p.honest}
            </p>
          )}
          {p.honest && !paused && <PlanOffer trait={p.trait} high={p.high} date={date} dark />}
          <p>
            <strong>For the rest of today:</strong> {p.grow}
          </p>
        </div>
      ))}
        </details>
      )}
    </div>
  )
}

// The morning's small steps. Around lunch each open one gets one quick
// check, "Did you try it yet?" (the review of 2026-10-15): an answer is kept
// like the evening's, and "not yet" leaves it for the evening to ask.
function MorningMoves({ date }: { date: string }) {
  const [moves, setMoves] = useState(() => movesOn(date))
  const [later, setLater] = useState<string[]>(() => middayLater(date))
  const [midday] = useState(() => isMidday())
  const label = moves.length > 1 ? 'Small steps for today' : 'One small step for today'
  if (moves.length === 0) {
    return (
      <div className="moves" role="group" aria-label={label}>
        <p className="eyebrow">{label}</p>
        <p className="muted">{NO_STEP}</p>
      </div>
    )
  }
  const asks = (m: Move) => midday && m.status === 'started' && !startedInEvening(m) && !later.includes(m.questionId)
  function answer(m: Move, status: StepStatus) {
    setMoveStatus(m.questionId, status, date).catch(() => {
      // kept on the phone, and sent again when the app next opens
    })
    setMoves(moves.map((x) => (x.questionId === m.questionId ? { ...x, status } : x)))
  }
  function notYet(m: Move) {
    const next = [...later, m.questionId]
    saveJSON(`pi.midday.${date}`, next)
    setLater(next)
  }
  return (
    <div className="moves" role="group" aria-label={label}>
      <p className="eyebrow">{label}</p>
      <ul className="move-checks">
        {moves.map((m) => (
          <li key={m.questionId}>
            <p className="move-step">
              <span>{m.step}</span>
              <span className="move-check" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              </span>
            </p>
            {m.status !== 'started' && <p className="move-reply">{REPLIES[m.status]}</p>}
            {m.status === 'started' && later.includes(m.questionId) && (
              <p className="muted">No rush. I'll ask again this evening.</p>
            )}
            {asks(m) && (
              <>
                <p className="muted">Did you try it yet?</p>
                <div className="move-buttons">
                  <button type="button" className="option" onClick={() => answer(m, 'helped')}>
                    Yes, it helped
                  </button>
                  <button type="button" className="option" onClick={() => answer(m, 'no_change')}>
                    Yes, no change yet
                  </button>
                  <button type="button" className="option" onClick={() => notYet(m)}>
                    Not yet
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

// The steps answered "not yet" at midday, for the day.
function middayLater(date: string): string[] {
  const v = loadJSON(`pi.midday.${date}`)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
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
                    Not today
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

// One morning choice, asked about at the close of the evening: does that
// route usually get the person what they were after? This is how the app
// learns which routes work for this person, from the person (Stage 2 of the
// proposal of 2026-10-24). The answer stays on this phone.
function RouteCheck({ date, morning }: { date: string; morning: Question[] }) {
  const [ask] = useState(() => routeToAsk(loadHistory(), morning, date))
  const [route, setRoute] = useState<Route | null>(ask?.record.route ?? null)
  if (!ask) return null
  function tap(r: Route) {
    if (!ask) return
    recordRoute(ask.question.id, r, ask.label)
    setRoute(r)
  }
  return (
    <div className="moves route" role="group" aria-label="This morning's choice">
      <p className="eyebrow">This morning's choice</p>
      <p>{routeLead(ask.label, NEED_PHRASES[ask.record.need])}</p>
      {route ? (
        <p className="move-reply">{ROUTE_REPLIES[route]}</p>
      ) : (
        <>
          <p className="muted">{ROUTE_ASK}</p>
          <div className="move-buttons">
            {(Object.keys(ROUTE_WORDS) as Route[]).map((r) => (
              <button key={r} type="button" className="option" onClick={() => tap(r)}>
                {ROUTE_WORDS[r]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// The day's clearest leaning, from the morning's and the evening's answers:
// one thing to carry into tomorrow. Its honest part comes only once the
// leaning is a pattern.
function ForTomorrow({ answers, history, date, onPractice, paused }: Read) {
  const top = adviceFor(answers, history, date, 'evening').points[0]
  return (
    <div className="thread" role="note" aria-label="For tomorrow">
      <p className="eyebrow">For tomorrow</p>
      {top && <p className="thread-name">{top.name}</p>}
      {top && <p className="thread-level">{levelLine(top.earned)}</p>}
      {top?.honest && !paused && (
        <p className="honest">
          <strong>The honest part:</strong> {top.honest}
        </p>
      )}
      {top?.honest && !paused && (
        <PlanOffer trait={top.trait} high={top.high} date={date} onPractice={onPractice} dark />
      )}
      <p>{top ? top.grow : QUIET_DAY}</p>
    </div>
  )
}
