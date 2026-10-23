import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  cacheEdition,
  cachedEdition,
  getDay,
  pruneLocal,
  pruneWords,
  recalledChoice,
  sendPlanChecks,
  sendUnrated,
  SKIPPED,
  type DailySet,
  type Question,
} from './api'
import { useDay } from './day'
import { QuestionCard, type Done } from './QuestionCard'
import { DayClose, StepCheck } from './DayClose'
import { DayPlan, NightScreen, PauseScreen, PrivacyLine, Upcoming, type Progress } from './Sittings'
import { Mirror } from './Mirror'
import { GoodThings } from './Keep'
import { KeptScreen } from './Kept'
import { NotebookScreen } from './Notebook'
import { pruneNotebook } from './notebook'
import { PracticeScreen } from './Practice'
import { InstallInvite } from './pwa/InstallInvite'
import { ReadScreen, TodaysRead } from './Read'
import { OpenRead } from './readContext'
import type { Read } from './reads/types'
import type { Practice } from './practices'
import { SettingsScreen } from './Settings'
import { themeVars } from './themes'
import { openThisWeek, sendUnsent } from './moves'
import { forgetPick, todaysPick, type Half } from './profile'
import { intimacyOn, loadPrefs, savePrefs, type Prefs } from './prefs'
import { onOtherTab } from './storage'
import { startBackups } from './vault'
import './App.css'

type State =
  | { kind: 'loading' }
  // day: the phone's date it was loaded for; offline: opened from what the
  // phone kept, because the server could not be reached
  | { kind: 'ready'; set: DailySet; day: string; offline?: true }
  | { kind: 'empty' }
  | { kind: 'error' }

type View = 'today' | 'mirror' | 'notebook' | 'kept' | 'settings' | 'practice' | 'read'
// The views reached from the tabs, which Back returns to.
type Tab = 'today' | 'mirror' | 'notebook'
const isTab = (v: View): v is Tab => v === 'today' || v === 'mirror' || v === 'notebook'

const themesOf = (qs: Question[]) => qs.map((q) => q.theme).filter((t): t is string => !!t)

function progressOf(qs: Question[]): Progress {
  const done = qs.filter((q) => recalledChoice(q.id)).length
  return done === 0 ? 'none' : done === qs.length ? 'done' : 'started'
}

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<View>('today')
  // Where Back goes from What I keep, Settings and a practice.
  const [back, setBack] = useState<Tab>('today')
  const [practice, setPractice] = useState<Practice | null>(null)
  const [reading, setReading] = useState<Read | null>(null)
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
        cacheEdition(set, date)
        setState((s) => {
          // Sunday has no new questions: it opens on the week in the mirror.
          if (set.review && !(s.kind === 'ready' && s.day === date)) setTab('mirror')
          return { kind: 'ready', set, day: date }
        })
      },
      (e) => {
        if (!live) return
        const empty = e instanceof ApiError && e.code === 'no_questions_today'
        // Without a connection the app opens on the day it already holds.
        const kept = empty ? null : cachedEdition(date)
        setState(kept ? { kind: 'ready', set: kept, day: date, offline: true } : { kind: empty ? 'empty' : 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [date, attempt])

  // Offline, try again as soon as the phone is back online.
  const offline = state.kind === 'ready' && state.offline
  useEffect(() => {
    if (!offline) return
    const again = () => setAttempt((n) => n + 1)
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [offline])

  // Each day the app opens: clear what has outlived its use and send any
  // small step or card tap the server did not get.
  useEffect(() => {
    pruneLocal(date, loadPrefs().wordsDays)
    pruneNotebook(date)
    sendUnsent(date)
    sendUnrated()
    sendPlanChecks()
  }, [date])

  // While backup is on, changes worth keeping are sealed and sent a little
  // after they happen (vault.ts).
  useEffect(() => startBackups(), [])

  // Another tab on this phone answered, changed a setting or deleted
  // everything: catch up.
  useEffect(
    () =>
      onOtherTab(() => {
        setPrefs(loadPrefs())
        setFinished((n) => n + 1)
      }),
    [],
  )

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
    if (next.wordsDays !== prefs.wordsDays) pruneWords(date, next.wordsDays)
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

  function open(view: 'kept' | 'settings' | 'practice' | 'read') {
    if (isTab(tab)) setBack(tab)
    setTab(view)
    window.scrollTo?.({ top: 0 })
  }

  function openPractice(p: Practice) {
    setPractice(p)
    open('practice')
  }

  const openRead = useCallback((r: Read) => {
    setReading(r)
    setTab((t) => {
      if (isTab(t)) setBack(t)
      return 'read'
    })
    window.scrollTo?.({ top: 0 })
  }, [])

  return (
    <OpenRead.Provider value={openRead}>
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
              <button type="button" aria-pressed={tab === 'notebook'} onClick={() => setTab('notebook')}>
                Notebook
              </button>
            </nav>
          )}
        </header>

        {offline && tab === 'today' && (
          <p className="notice offline" role="status">
            You're offline, so I opened what this phone already had. Answers go through once you're back.
          </p>
        )}

        {tab === 'kept' && <KeptScreen today={date} mild={!intimacyOn(prefs)} onBack={() => setTab(back)} />}

        {tab === 'notebook' && <NotebookScreen mild={!intimacyOn(prefs)} today={date} />}

        {tab === 'practice' && practice && <PracticeScreen practice={practice} date={date} onBack={() => setTab(back)} />}

        {tab === 'read' && reading && (
          <ReadScreen key={reading.slug} read={reading} date={date} intimacy={intimacyOn(prefs)} onBack={() => setTab(back)} />
        )}

        {tab === 'settings' && (
          <SettingsScreen prefs={prefs} onChange={changePrefs} onOpenKept={() => open('kept')} onBack={() => setTab(back)} />
        )}

        {loading && (tab === 'today' || tab === 'mirror') && (
          <p className="muted center">Getting today's questions ready…</p>
        )}

        {state.kind === 'empty' && tab === 'today' && <p className="notice">No questions today yet. Check back soon.</p>}

        {state.kind === 'error' && tab === 'today' && (
          <div className="notice" role="alert">
            <p>I couldn't load today's questions.</p>
            <button type="button" className="option" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {set && tab === 'mirror' && <Mirror today={set.date} onOpenKept={() => open('kept')} />}

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
                  <StepCheck date={set.date} label="This week's small steps" pick={() => openThisWeek(set.date)} />
                  <GoodThings date={set.date} label="Three good things from today" />
                </section>
              )}

              {!set.review && sitting === 'night' && <NightScreen date={set.date} morningThemes={themesOf(morningQs)} />}

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
                      sitting={sitting === 'evening' ? 'evening' : 'morning'}
                      wordsDays={prefs.wordsDays}
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
                        onPractice={openPractice}
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
              <TodaysRead date={set.date} themes={themesOf([...morningQs, ...eveningQs])} intimacy={intimacyOn(prefs)} />
            <InstallInvite today={set.date} />
              <PrivacyLine onOpenKept={() => open('kept')} onOpenSettings={() => open('settings')} />
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
    </OpenRead.Provider>
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
