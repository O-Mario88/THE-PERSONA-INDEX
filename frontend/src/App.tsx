import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, getDay, recalledChoice, recalledEvening, SKIPPED, type DailySet, type Option, type Question } from './api'
import { followUpsFor, useDay } from './day'
import { QuestionCard, type Done } from './QuestionCard'
import { DayClose } from './DayClose'
import { FollowUpCard } from './FollowUpCard'
import { Mirror } from './Mirror'
import { themeName, themeVars } from './themes'
import { forgetPick, todaysPick } from './profile'
import { intimacyOn, loadPrefs, savePrefs, type Prefs } from './prefs'
import './App.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; set: DailySet }
  | { kind: 'empty' }
  | { kind: 'error' }

// One screen of the day: a question, or an evening check-in on a morning answer.
type Step = { question: Question; said?: Option }

const isCheckIn = (s: Step) => s.said !== undefined

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<'today' | 'mirror'>('today')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  // What is answered lives on the phone; a finished card only asks for a
  // fresh render so the dashes catch up.
  const [, setFinished] = useState(0)
  const onDone = useCallback(() => setFinished((n) => n + 1), [])
  // The phone's clock decides the time of day: the evening opens at 4 pm and
  // a new day starts at midnight, while the app is open too.
  const { date, evening } = useDay()

  useEffect(() => {
    let live = true
    getDay(date).then(
      (set) => {
        if (!live) return
        setState({ kind: 'ready', set })
        // Sunday has no new questions: it opens on the week in the mirror.
        if (set.review) setTab('mirror')
      },
      (e) => {
        if (!live) return
        const empty = e instanceof ApiError && e.code === 'no_questions_today'
        setState({ kind: empty ? 'empty' : 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [date, attempt])

  const set = state.kind === 'ready' ? state.set : null
  const morningQs = useMemo(
    () => (set ? todaysPick(set.pool ?? [], set.questions ?? [], set.date, intimacyOn(prefs)) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs, pickVersion],
  )
  // The evening three open at 4 pm and are picked then, after the morning's answers.
  const hasEvening = !!set?.evening?.length
  const eveningQs = useMemo(
    () =>
      set && hasEvening && evening
        ? todaysPick(set.pool ?? [], set.evening ?? [], set.date, intimacyOn(prefs), 'evening', morningQs)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, hasEvening, evening, prefs, pickVersion, morningQs],
  )
  // The evening starts with a check-in on this morning's answers.
  const followUps = useMemo(
    () => (set && evening ? followUpsFor(morningQs, set.date) : []),
    [set, evening, morningQs],
  )
  const steps = useMemo<Step[]>(
    () => [
      ...morningQs.map((question) => ({ question })),
      ...followUps.map(({ question, said }) => ({ question, said })),
      ...eveningQs.map((question) => ({ question })),
    ],
    [morningQs, followUps, eveningQs],
  )
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')
  const finished = (s: Step) => !!(isCheckIn(s) ? recalledEvening(s.question.id) : recalledChoice(s.question.id))
  const flow = useStep(steps, finished)
  const current = steps[flow.at]

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    // Re-pick only while nothing of today's questions is answered yet, so
    // they never change under someone mid-edition.
    if (set && !morningQs.some((q) => recalledChoice(q.id))) {
      forgetPick(set.date)
      setPickVersion((v) => v + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <main className={tab === 'mirror' ? 'page mirror-page' : 'page'}>
      <header className="masthead">
        <p className="brand">The Persona Index</p>
        {set && (
          <nav className="tabs" aria-label="Sections">
            <button type="button" aria-pressed={tab === 'today'} onClick={() => setTab('today')}>
              Today
            </button>
            <button type="button" aria-pressed={tab === 'mirror'} onClick={() => setTab('mirror')}>
              Your mirror
            </button>
          </nav>
        )}
      </header>

      {state.kind === 'loading' && <p className="muted center">Getting today's questions ready…</p>}

      {state.kind === 'empty' && <p className="notice">No questions today yet. Check back soon.</p>}

      {state.kind === 'error' && (
        <div className="notice" role="alert">
          <p>I couldn't load today's questions.</p>
          <button type="button" className="option" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {set && tab === 'mirror' && <Mirror today={set.date} />}

      {set && tab === 'today' && (
        <>
          <div className="edition-bar">
            <p className="edition-line">
              {set.review ? 'Review day' : set.edition ? `Edition #${set.edition}` : "Today's questions"} ·{' '}
              {weekday(set.date)}
              {evening && !set.review && ' evening'}
            </p>
            {steps.length > 0 && (
              <nav className="dashes" aria-label="Today's questions">
                {steps.map((s, i) => {
                  const done = isCheckIn(s) ? doneOf(recalledEvening(s.question.id)) : doneOf(recalledChoice(s.question.id))
                  return (
                    <button
                      key={(isCheckIn(s) ? 'check-in:' : '') + s.question.id}
                      type="button"
                      className={`dash ${done ?? ''}`}
                      style={themeVars(s.question.theme)}
                      aria-label={`Question ${i + 1} of ${steps.length}`}
                      aria-current={flow.at === i ? 'step' : undefined}
                      disabled={!done && flow.at !== i}
                      onClick={() => flow.go(i)}
                    />
                  )
                })}
              </nav>
            )}
          </div>

          {set.review && (
            <section className="notice review" aria-labelledby="review-title">
              <h2 id="review-title">Sunday is for looking back.</h2>
              <p>
                No new questions today. Your week is waiting in your mirror: what you noticed, how you've been changing
                and what to try next. Fresh questions arrive tomorrow morning.
              </p>
              {(set.tomorrowThemes ?? []).length > 0 && (
                <p className="tomorrow">
                  <span className="eyebrow">Tomorrow</span> {set.tomorrowThemes!.map(themeName).join(' · ')}
                </p>
              )}
              <button type="button" className="option" onClick={() => setTab('mirror')}>
                Open your mirror
              </button>
            </section>
          )}

          {!set.review && (
            <>
              {hasIntimate && prefs.adult === null && (
                <section className="notice gate" aria-labelledby="gate-title">
                  <h2 id="gate-title">Are you 18 or older?</h2>
                  <p className="muted">
                    Some questions are about intimacy and sex. They are frank, never graphic, and only kept as "a private
                    answer".
                  </p>
                  <div className="confirm">
                    <button type="button" className="option" onClick={() => changePrefs({ ...prefs, adult: true })}>
                      Yes, I'm 18 or older
                    </button>
                    <button type="button" className="option" onClick={() => changePrefs({ ...prefs, adult: false })}>
                      No
                    </button>
                  </div>
                </section>
              )}

              {current && isCheckIn(current) && flow.at === morningQs.length && !recalledEvening(current.question.id) && (
                <p className="evening-intro">Welcome back. Before anything new, how did this morning go?</p>
              )}

              {current &&
                (isCheckIn(current) ? (
                  <FollowUpCard
                    key={'check-in:' + current.question.id}
                    question={current.question}
                    said={current.said!}
                    date={set.date}
                    onDone={onDone}
                    onNext={() => flow.go(flow.at + 1)}
                  />
                ) : (
                  <QuestionCard
                    key={current.question.id}
                    question={current.question}
                    date={set.date}
                    onDone={onDone}
                    onNext={() => flow.go(flow.at + 1)}
                  />
                ))}

              {flow.at >= steps.length &&
                steps.length > 0 &&
                (evening ? (
                  <DayClose
                    sitting="evening"
                    date={set.date}
                    questions={eveningQs}
                    followUps={followUps}
                    tomorrowThemes={set.tomorrowThemes ?? []}
                  />
                ) : (
                  <DayClose
                    sitting="morning"
                    date={set.date}
                    questions={morningQs}
                    later={{ questions: hasEvening, checkIn: followUpsFor(morningQs, set.date).length > 0 }}
                    tomorrowThemes={set.tomorrowThemes ?? []}
                  />
                ))}
            </>
          )}

          {prefs.adult === true && (
            <label className="switch">
              <input
                type="checkbox"
                checked={prefs.mild}
                onChange={(e) => changePrefs({ ...prefs, mild: e.target.checked })}
              />
              Keep it mild (no intimacy questions)
            </label>
          )}
        </>
      )}
    </main>
  )
}

function doneOf(choice: string | null): Done | undefined {
  if (!choice) return undefined
  return choice === SKIPPED ? 'skipped' : 'answered'
}

// useStep tracks which screen of the day is showing: it opens on the first
// unfinished one (or the end, when all are done) and then moves only when the
// person moves it, so answering never jumps ahead on its own. When the day
// grows at 4 pm, it opens again on the first unfinished screen.
function useStep(steps: Step[], finished: (s: Step) => boolean) {
  const key = steps.map((s) => (isCheckIn(s) ? 'check-in:' : '') + s.question.id).join(',')
  const [pin, setPin] = useState({ key: '', at: 0 })
  let at = pin.at
  if (pin.key !== key) {
    const open = steps.findIndex((s) => !finished(s))
    at = open < 0 ? steps.length : open
    setPin({ key, at })
  }
  const go = (i: number) => {
    setPin({ key, at: Math.max(0, Math.min(i, steps.length)) })
    window.scrollTo?.({ top: 0 })
  }
  return { at, go }
}

function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })
}

export default App
