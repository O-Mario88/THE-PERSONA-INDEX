import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, getDay, recalledChoice, recalledEvening, SKIPPED, type DailySet, type Question } from './api'
import { readCompare } from './compare'
import { followUpsFor, localDate, useAfternoon, useEvening } from './day'
import { QuestionCard, type Done } from './QuestionCard'
import { EditionSummary } from './EditionSummary'
import { EveningSummary } from './EveningSummary'
import { FollowUpCard } from './FollowUpCard'
import { Mirror } from './Mirror'
import { themeVars } from './themes'
import { forgetPick, todaysPick } from './profile'
import { intimacyOn, loadPrefs, savePrefs, type Prefs } from './prefs'
import './App.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; set: DailySet }
  | { kind: 'empty' }
  | { kind: 'error' }

function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<'today' | 'mirror'>('today')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  const [invite] = useState(() => readCompare(window.location.hash))
  // What is answered lives on the phone; a finished card only asks for a
  // fresh render so the dashes catch up.
  const [, setFinished] = useState(0)
  const onDone = useCallback(() => setFinished((n) => n + 1), [])
  const evening = useEvening()
  const afternoon = useAfternoon()
  const [showMorning, setShowMorning] = useState(false)

  useEffect(() => {
    let live = true
    getDay(localDate()).then(
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
  }, [attempt])

  const set = state.kind === 'ready' ? state.set : null
  // A compare link for today's edition replaces the pick with its questions.
  const compareQs = useMemo(() => (set && invite ? compareQuestions(set, invite.e, invite.a) : null), [set, invite])
  const staleInvite = !!(set && invite && !compareQs)
  const morningQs = useMemo(
    () =>
      compareQs?.map((c) => c.question) ??
      (set ? todaysPick(set.pool ?? [], set.questions, set.date, intimacyOn(prefs)) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs, pickVersion, compareQs],
  )
  // The afternoon three open at noon and are picked then, after the morning's answers.
  const hasAfternoon = !!set?.afternoon?.length && !compareQs
  const afternoonQs = useMemo(
    () =>
      set && hasAfternoon && afternoon
        ? todaysPick(set.pool ?? [], set.afternoon ?? [], set.date, intimacyOn(prefs), 'afternoon', morningQs)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, hasAfternoon, afternoon, prefs, pickVersion, morningQs],
  )
  const questions = useMemo(() => [...morningQs, ...afternoonQs], [morningQs, afternoonQs])
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')

  // In the evening the check-in goes back to this morning's answers; the
  // morning questions stay one tap away. A compare link always opens the morning.
  const followUps = useMemo(
    () => (set && evening && !compareQs ? followUpsFor(morningQs, set.date) : []),
    [set, evening, compareQs, morningQs],
  )
  const checkingIn = followUps.length > 0
  const morningShown = !checkingIn || showMorning
  const openMorning = questions.filter((q) => !recalledChoice(q.id)).length

  const morning = useStep(questions, (q) => !!recalledChoice(q.id))
  const night = useStep(
    followUps.map((f) => f.question),
    (q) => !!recalledEvening(q.id),
  )

  function changePrefs(next: Prefs) {
    savePrefs(next)
    setPrefs(next)
    // Re-pick only while nothing of today's three is answered yet, so the
    // questions never change under someone mid-edition.
    if (set && !questions.some((q) => recalledChoice(q.id))) {
      forgetPick(set.date)
      setPickVersion((v) => v + 1)
    }
  }

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  const showingEvening = set && tab === 'today' && checkingIn && !showMorning
  const inAfternoon = afternoonQs.length > 0 && morning.at >= morningQs.length
  const flow = showingEvening ? night : morning
  const flowQuestions = showingEvening ? followUps.map((f) => f.question) : questions
  const flowDone = (q: Question) => doneOf(showingEvening ? recalledEvening(q.id) : recalledChoice(q.id))

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
              {set.review
                ? 'Review day'
                : showingEvening
                  ? 'Evening check-in'
                  : set.edition
                    ? `Edition #${set.edition}`
                    : "Today's questions"}{' '}
              · {weekday(set.date)}
              {inAfternoon && !showingEvening && ' afternoon'}
            </p>
            {flowQuestions.length > 0 && (
              <nav className="dashes" aria-label={showingEvening ? "Tonight's questions" : "Today's questions"}>
                {flowQuestions.map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    className={`dash ${flowDone(q) ?? ''}`}
                    style={themeVars(q.theme)}
                    aria-label={`Question ${i + 1} of ${flowQuestions.length}`}
                    aria-current={flow.at === i ? 'step' : undefined}
                    disabled={!flowDone(q) && flow.at !== i}
                    onClick={() => flow.go(i)}
                  />
                ))}
              </nav>
            )}
          </div>

          {showingEvening && flow.at === 0 && !recalledEvening(followUps[0].question.id) && (
            <p className="evening-intro">Good evening. How did today actually go?</p>
          )}

          {showingEvening && (
            <>
              {followUps.map(
                (f, i) =>
                  i === flow.at && (
                    <FollowUpCard
                      key={f.question.id}
                      question={f.question}
                      said={f.said}
                      date={set.date}
                      onDone={onDone}
                      onNext={() => flow.go(i + 1)}
                    />
                  ),
              )}
              {flow.at >= followUps.length && set.edition !== undefined && (
                <EveningSummary
                  date={set.date}
                  edition={set.edition}
                  items={followUps}
                  tomorrowThemes={set.tomorrowThemes ?? []}
                />
              )}
            </>
          )}

          {set.review && (
            <section className="notice review" aria-labelledby="review-title">
              <h2 id="review-title">Sunday is for looking back.</h2>
              <p>
                No new questions today. Your week is waiting in your mirror: what you noticed, where you stood apart and
                what to try next. Fresh questions arrive tomorrow morning.
              </p>
              <button type="button" className="option" onClick={() => setTab('mirror')}>
                Open your mirror
              </button>
            </section>
          )}

          {checkingIn && (
            <button
              type="button"
              className="text-button morning-toggle"
              aria-expanded={showMorning}
              onClick={() => setShowMorning((v) => !v)}
            >
              {showMorning
                ? 'Back to the evening check-in'
                : `Today's questions${openMorning > 0 ? ` (${openMorning} still open)` : ''}`}
            </button>
          )}

          {morningShown && !set.review && (
            <>
              {evening && !checkingIn && !compareQs && (
                <p className="notice">
                  The evening check-in follows up on morning answers from before 5 pm. Today's questions are still here.
                </p>
              )}
              {compareQs && <p className="notice">Someone wants to compare answers with you.</p>}
              {staleInvite && (
                <p className="notice">That compare link is from an earlier edition. Here are today's questions instead.</p>
              )}

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

              {questions.map(
                (q, i) =>
                  i === morning.at && (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      date={set.date}
                      onDone={onDone}
                      onNext={() => morning.go(i + 1)}
                    />
                  ),
              )}

              {morning.at >= questions.length && set.edition !== undefined && (
                <EditionSummary
                  date={set.date}
                  edition={set.edition}
                  questions={questions}
                  tomorrowThemes={set.tomorrowThemes ?? []}
                  checkIn={!evening ? 'later' : checkingIn ? 'open' : 'tomorrow'}
                  afternoon={!hasAfternoon ? 'none' : afternoonQs.length > 0 ? 'done' : 'later'}
                  answers={questions
                    .filter((q) => q.care !== 'intimate')
                    .map((q): [string, string] => [q.id, recalledChoice(q.id) ?? ''])
                    .filter(([, c]) => c !== '' && c !== SKIPPED && c !== '?')}
                />
              )}

              {compareQs && morning.at >= questions.length && <CompareResult items={compareQs} />}
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

// useStep tracks which screen of a set of questions is showing: it opens on
// the first unfinished one (or the end, when all are done) and then moves
// only when the person moves it, so answering never jumps ahead on its own.
function useStep(questions: Question[], finished: (q: Question) => boolean) {
  const key = questions.map((q) => q.id).join(',')
  const [pin, setPin] = useState({ key: '', at: 0 })
  let at = pin.at
  if (pin.key !== key) {
    const open = questions.findIndex((q) => !finished(q))
    at = open < 0 ? questions.length : open
    setPin({ key, at })
  }
  const go = (i: number) => {
    setPin({ key, at: Math.max(0, Math.min(i, questions.length)) })
    window.scrollTo?.({ top: 0 })
  }
  return { at, go }
}

type CompareItem = { question: Question; theirs: string }

function compareQuestions(set: DailySet, edition: number, answers: [string, string][]): CompareItem[] | null {
  if (edition !== set.edition) return null
  const all = [...(set.pool ?? []), ...set.questions]
  const items: CompareItem[] = []
  for (const [id, theirs] of answers) {
    const question = all.find((q) => q.id === id)
    if (!question || question.care === 'intimate' || !question.options.some((o) => o.id === theirs)) return null
    if (!items.some((i) => i.question.id === id)) items.push({ question, theirs })
  }
  return items.length ? items : null
}

function CompareResult({ items }: { items: CompareItem[] }) {
  const both = items
    .map((i) => ({ ...i, mine: recalledChoice(i.question.id) }))
    .filter((i): i is CompareItem & { mine: string } => !!i.mine && i.question.options.some((o) => o.id === i.mine))
  const agreed = both.filter((i) => i.mine === i.theirs).length
  const label = (q: Question, id: string) => q.options.find((o) => o.id === id)?.label ?? ''
  const title = both.length ? `You agreed on ${agreed} of ${both.length}` : 'Nothing to compare yet'
  return (
    <section className="screen compare" aria-labelledby="compare-title">
      <h2 id="compare-title" className="done-title">
        {title}
      </h2>
      <ul className="compare-list">
        {both.map((i) => (
          <li key={i.question.id}>
            <p className="compare-q">
              {i.mine === i.theirs ? 'Same: ' : 'Split: '}
              {i.question.prompt}
            </p>
            <p className="muted">
              You: {label(i.question, i.mine)} · Them: {label(i.question, i.theirs)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' })
}

export default App
