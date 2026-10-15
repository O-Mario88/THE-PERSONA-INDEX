import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, getDay, recalledChoice, SKIPPED, type DailySet, type Question } from './api'
import { useDay } from './day'
import { QuestionCard, type Done } from './QuestionCard'
import { DayClose } from './DayClose'
import { DayPlan, NightScreen, PauseScreen, PrivacyLine, Upcoming, type Progress } from './Sittings'
import { Mirror } from './Mirror'
import { themeVars } from './themes'
import { forgetPick, todaysPick, type Half } from './profile'
import { intimacyOn, loadPrefs, savePrefs, type Prefs } from './prefs'
import './App.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; set: DailySet; day: string } // day: the phone's date it was loaded for
  | { kind: 'empty' }
  | { kind: 'error' }

const themesOf = (qs: Question[]) => qs.map((q) => q.theme).filter((t): t is string => !!t)

function progressOf(qs: Question[]): Progress {
  const done = qs.filter((q) => recalledChoice(q.id)).length
  return done === 0 ? 'none' : done === qs.length ? 'done' : 'started'
}

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
  // The phone's clock decides the sitting: three questions from 5 am to
  // 4:30 pm, three more from 5 pm to midnight, and rest in between. It
  // turns while the app is open too.
  const { date, sitting } = useDay()

  useEffect(() => {
    let live = true
    getDay(date).then(
      (set) => {
        if (!live) return
        setState({ kind: 'ready', set, day: date })
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

  // Just after midnight the set on hand is yesterday's until the new one
  // arrives; it is not shown as today's.
  const set = state.kind === 'ready' && state.day === date ? state.set : null
  const loading = state.kind === 'loading' || (state.kind === 'ready' && !set)
  const morningQs = useMemo(
    () => (set ? todaysPick(set.pool ?? [], set.questions ?? [], set.date, intimacyOn(prefs)) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs, pickVersion],
  )
  const morning = progressOf(morningQs)
  // The evening three are picked once the morning is answered or closed, so
  // they can follow what the morning showed, and never repeat it.
  const hasEvening = !!set?.evening?.length
  const eveningReady = hasEvening && (morning === 'done' || sitting === 'pause' || sitting === 'evening')
  const eveningQs = useMemo(
    () =>
      set && eveningReady
        ? todaysPick(set.pool ?? [], set.evening ?? [], set.date, intimacyOn(prefs), 'evening', morningQs)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, eveningReady, prefs, pickVersion, morningQs],
  )
  const evening = hasEvening ? progressOf(eveningQs) : null
  // Each sitting shows its own three, and only those.
  const steps = sitting === 'morning' ? morningQs : sitting === 'evening' ? eveningQs : []
  const flow = useStep(steps)
  const current = steps[flow.at]
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')
  const asking = sitting === 'morning' || sitting === 'evening'

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    // Re-pick only a sitting nobody has started, so questions never change
    // under someone mid-sitting.
    if (!set) return
    const started = (qs: Question[]) => qs.some((q) => recalledChoice(q.id))
    const halves = (['morning', 'evening'] as Half[]).filter((h) => !started(h === 'morning' ? morningQs : eveningQs))
    if (halves.length > 0) {
      forgetPick(set.date, halves)
      setPickVersion((v) => v + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  return (
    <main className={tab === 'mirror' ? 'page mirror-page' : 'page today-page'}>
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

      {loading && <p className="muted center">Getting today's questions ready…</p>}

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
        <div className="today">
          <div className="edition-bar">
            <p className="edition-line">
              {set.review ? 'Review day' : set.edition ? `Edition #${set.edition}` : "Today's questions"} ·{' '}
              {weekday(set.date)}
              {!set.review && (sitting === 'pause' || sitting === 'evening') && ' evening'}
            </p>
            {steps.length > 0 && (
              <nav className="dashes" aria-label="Today's questions">
                {steps.map((q, i) => {
                  const done = doneOf(recalledChoice(q.id))
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={`dash ${done ?? ''}`}
                      style={themeVars(q.theme)}
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
          <div className="today-main">
            {set.review && (
              <section className="notice review" aria-labelledby="review-title">
                <h2 id="review-title">Sunday is for looking back.</h2>
                <p>
                  No new questions today. Your week is waiting in your mirror: what you noticed, how you've been
                  changing and what to try next. Fresh questions arrive tomorrow at 5 am.
                </p>
                <Upcoming label="Tomorrow" themes={set.tomorrowThemes ?? []} />
                <button type="button" className="option" onClick={() => setTab('mirror')}>
                  Open your mirror
                </button>
              </section>
            )}

            {!set.review && sitting === 'night' && <NightScreen morningThemes={themesOf(morningQs)} />}

            {!set.review && sitting === 'pause' && (
              <PauseScreen morning={morning} eveningThemes={hasEvening ? themesOf(eveningQs) : null} />
            )}

            {!set.review && asking && (
              <>
                {hasIntimate && prefs.adult === null && (
                  <section className="notice gate" aria-labelledby="gate-title">
                    <h2 id="gate-title">Are you 18 or older?</h2>
                    <p className="muted">
                      Some questions are about intimacy and sex. They are frank, never graphic, and only kept as "a
                      private answer".
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

                {current && (
                  <QuestionCard
                    key={current.id}
                    question={current}
                    date={set.date}
                    onDone={onDone}
                    onNext={() => flow.go(flow.at + 1)}
                  />
                )}

                {flow.at >= steps.length &&
                  (sitting === 'evening' ? (
                    <DayClose
                      sitting="evening"
                      date={set.date}
                      questions={eveningQs}
                      morning={morningQs}
                      tomorrowThemes={set.tomorrowThemes ?? []}
                    />
                  ) : (
                    steps.length > 0 && (
                      <DayClose
                        sitting="morning"
                        date={set.date}
                        questions={morningQs}
                        eveningThemes={hasEvening ? themesOf(eveningQs) : null}
                        tomorrowThemes={set.tomorrowThemes ?? []}
                      />
                    )
                  ))}
              </>
            )}
          </div>
          {/* The rest of the day: under the card on a phone, beside it on a
              wide screen. */}
          <div className="today-side">
            {!set.review && <DayPlan sitting={sitting} morning={morning} evening={evening} />}
            <PrivacyLine />
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
          </div>
        </div>
      )}
    </main>
  )
}

function doneOf(choice: string | null): Done | undefined {
  if (!choice) return undefined
  return choice === SKIPPED ? 'skipped' : 'answered'
}

// useStep tracks which question of the sitting is showing: it opens on the
// first unanswered one (or the end, when all are done) and then moves only
// when the person moves it, so answering never jumps ahead on its own. When
// the sitting changes, it opens again on the first unanswered question.
function useStep(steps: Question[]) {
  const key = steps.map((q) => q.id).join(',')
  const [pin, setPin] = useState({ key: '', at: 0 })
  let at = pin.at
  if (pin.key !== key) {
    const open = steps.findIndex((q) => !recalledChoice(q.id))
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
