import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, getToday, recalledChoice, SKIPPED, type DailySet, type Question } from './api'
import { readCompare } from './compare'
import { QuestionCard, type Done } from './QuestionCard'
import { EditionSummary } from './EditionSummary'
import { MyWeek } from './MyWeek'
import { levelFor, loadGame } from './game'
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
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [pickVersion, setPickVersion] = useState(0)
  const [invite] = useState(() => readCompare(window.location.hash))
  const [done, setDone] = useState<Record<string, Done>>({})
  const onDone = useCallback((id: string, d: Done) => {
    setDone((prev) => (prev[id] === d ? prev : { ...prev, [id]: d }))
  }, [])

  useEffect(() => {
    let live = true
    getToday().then(
      (set) => live && setState({ kind: 'ready', set }),
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
  const questions = useMemo(
    () =>
      compareQs?.map((c) => c.question) ??
      (set ? todaysPick(set.pool ?? [], set.questions, set.date, intimacyOn(prefs)) : []),
    // pickVersion forces a fresh pick after a preference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, prefs, pickVersion, compareQs],
  )
  const hasIntimate = !!set?.pool?.some((q) => q.care === 'intimate')

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

  return (
    <main className="page">
      <header className="masthead">
        <h1>The Persona Index</h1>
        {set && (
          <p className="muted">
            {set.edition ? `Edition #${set.edition} · ` : "Today's questions · "}
            {formatDate(set.date)}
          </p>
        )}
        {set && (
          <nav className="tabs" aria-label="Sections">
            <button type="button" aria-pressed={tab === 'today'} onClick={() => setTab('today')}>
              Today
            </button>
            <button type="button" aria-pressed={tab === 'week'} onClick={() => setTab('week')}>
              My week
            </button>
          </nav>
        )}
      </header>

      {set && tab === 'today' && questions.length > 0 && <Progress questions={questions} done={done} />}

      {state.kind === 'loading' && <p className="muted">Loading today's questions…</p>}

      {state.kind === 'empty' && (
        <p className="notice">No questions today yet. Check back soon.</p>
      )}

      {state.kind === 'error' && (
        <div className="notice" role="alert">
          <p>We couldn't load today's questions.</p>
          <button type="button" className="option" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {set && tab === 'week' && <MyWeek today={set.date} />}

      {set && tab === 'today' && compareQs && (
        <p className="notice">Someone wants to compare answers with you.</p>
      )}
      {set && tab === 'today' && staleInvite && (
        <p className="notice">That compare link is from an earlier edition. Here are today's questions instead.</p>
      )}

      {set && tab === 'today' && hasIntimate && prefs.adult === null && (
        <section className="notice gate" aria-labelledby="gate-title">
          <h2 id="gate-title">Are you 18 or older?</h2>
          <p className="muted">Some questions are about intimacy and sex. They are frank, never graphic, and your answers stay on this phone.</p>
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

      {set &&
        tab === 'today' &&
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            question={q}
            index={i}
            total={questions.length}
            date={set.date}
            onDone={onDone}
          />
        ))}

      {set &&
        tab === 'today' &&
        set.edition !== undefined &&
        questions.every((q) => done[q.id]) && (
          <EditionSummary
            date={set.date}
            edition={set.edition}
            questions={questions}
            tomorrowThemes={set.tomorrowThemes ?? []}
            answers={questions
              .filter((q) => q.care !== 'intimate')
              .map((q): [string, string] => [q.id, recalledChoice(q.id) ?? ''])
              .filter(([, c]) => c !== '' && c !== SKIPPED && c !== '?')}
          />
        )}

      {set &&
        tab === 'today' &&
        compareQs &&
        questions.every((q) => done[q.id]) && <CompareResult items={compareQs} />}

      {set && tab === 'today' && prefs.adult === true && (
        <label className="switch">
          <input
            type="checkbox"
            checked={prefs.mild}
            onChange={(e) => changePrefs({ ...prefs, mild: e.target.checked })}
          />
          Keep it mild (no intimacy questions)
        </label>
      )}
    </main>
  )
}

// Today's progress and the level, kept on this phone.
function Progress({ questions, done }: { questions: Question[]; done: Record<string, Done> }) {
  const game = loadGame()
  const level = levelFor(game.insights)
  const finished = questions.filter((q) => done[q.id]).length
  return (
    <div className="progress" aria-label="Today's progress">
      <div className="progress-steps" aria-hidden="true">
        {questions.map((q) => (
          <span
            key={q.id}
            className={done[q.id] === 'answered' ? 'seg on' : done[q.id] ? 'seg skipped' : 'seg'}
            style={themeVars(q.theme)}
          />
        ))}
      </div>
      <p className="muted">
        {finished} of {questions.length} done · <span aria-hidden="true">{level.icon} </span>
        {level.name} · {game.points} pts
      </p>
    </div>
  )
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
    <section className="card" aria-labelledby="compare-title">
      <h2 id="compare-title">{title}</h2>
      <ul className="compare-list">
        {both.map((i) => (
          <li key={i.question.id}>
            <p className="trait-name">
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

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default App
