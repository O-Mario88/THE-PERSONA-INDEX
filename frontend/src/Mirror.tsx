import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  getMirror,
  getPeriodMirror,
  type Depth,
  type Level,
  type Mirror as MirrorData,
  type OwnWords,
  type Period,
  type PeriodMirror,
  type StepStatus,
  type ThemeRead,
  type Verdict,
  wordsBetween,
} from './api'
import { FocusCard, IdentityCard, PlanOffer, SundaySentence, WordsBackCard } from './Keep'
import { setMoveStatus, startMove } from './moves'
import { focusPlan, sentencesBetween, wordsBackDue } from './notebook'
import {
  AREA_NAMES,
  identityName,
  leanings,
  levelLine,
  levelMeta,
  longDate,
  PERIOD_CLOSE,
  periodName,
  periodSummary,
  sentenceStarter,
  summary,
  tagline,
  title,
  weekRange,
  type Lean,
} from './mirrorText'
import { changesBetween, changeWords, leaningVerdict, loadHistory, notMeSides, rememberLeaning, type Change } from './profile'
import { addDays } from './storage'
import { THEMES, themeName, themeStyle, themeVars } from './themes'
import { honestLine, sideOf, TRAITS } from './traits'
import { outsideMirror, type OutsideMirror as OutsideMirrorData } from './social'
import { useAccount } from './useAccount'
import { Icon } from './ui/icons'
import { ShareSheet } from './ShareCard'
import { weekTiles } from './Tapestry'
import {
  CHANGES_NOTE,
  LEANING_REPLIES,
  REACHED_NOTE,
  reachedLine,
  ROUTES_NOT,
  ROUTES_WORKED,
  SAFETY_ASK,
  SAFETY_REPLIES,
  SAFETY_WORDS,
  STEP_STATUS_WORDS,
  SUCCESS_TWO,
} from './words'
import { NEED_NAMES, NEED_PHRASES } from './needs'
import {
  needsBetween,
  reachedFor,
  rememberSafety,
  safetyAnswer,
  safetyLed,
  UNCERTAIN,
  type NeedRead,
  type Uncertain,
} from './reaching'
import { helplineHere } from './prefs'
import { ReadLink } from './Read'

type Span = 'week' | Period
type State =
  | { kind: 'loading' }
  | { kind: 'week'; m: MirrorData }
  | { kind: 'period'; p: PeriodMirror }
  | { kind: 'error' }

const SPANS: { span: Span; name: string; adj: string }[] = [
  { span: 'week', name: 'Week', adj: 'weekly' },
  { span: 'month', name: 'Month', adj: 'monthly' },
  { span: 'quarter', name: 'Quarter', adj: 'quarterly' },
  { span: 'year', name: 'Year', adj: 'yearly' },
]
const adjOf = (span: Span) => SPANS.find((s) => s.span === span)!.adj

// The mirror: built by the server from this phone's kept answers, so every
// number here is real. Sections with nothing real to show stay hidden. It
// speaks of this person alone and only sets them against their own past;
// the research behind its words stays in mirrorText.ts, out of sight. The
// week opens first; the month, quarter and year look further back.
export function Mirror({ today, onOpenKept, onCircle }: { today: string; onOpenKept: () => void; onCircle?: () => void }) {
  const [span, setSpan] = useState<Span>('week')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    const load: Promise<State> =
      span === 'week'
        ? getMirror(today).then((m) => ({ kind: 'week', m }))
        : getPeriodMirror(span, today).then((p) => ({ kind: 'period', p }))
    load.then(
      (next) => live && setState(next),
      () => live && setState({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [today, span, attempt])

  function choose(next: Span) {
    if (next === span) return
    setState({ kind: 'loading' })
    setSpan(next)
  }

  // One region for every state, so the page keeps its place while it loads.
  return (
    <section className="mirror" aria-label={`Your ${adjOf(span)} mirror`} aria-busy={state.kind === 'loading'}>
      <div className="m-spans" role="group" aria-label="Look back over">
        {SPANS.map((s) => (
          <button
            key={s.span}
            type="button"
            className="m-span"
            aria-pressed={s.span === span}
            onClick={() => choose(s.span)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {state.kind === 'loading' && <p className="m-loading">Putting your {span} together…</p>}
      {state.kind === 'error' && (
        <div className="m-card" role="alert">
          <p>I couldn't load your mirror just now.</p>
          <button
            type="button"
            className="m-button"
            onClick={() => {
              setState({ kind: 'loading' })
              reload()
            }}
          >
            Try again
          </button>
        </div>
      )}
      {state.kind === 'week' && <MirrorPage m={state.m} today={today} reload={reload} onOpenKept={onOpenKept} onCircle={onCircle} />}
      {state.kind === 'period' && <PeriodPage p={state.p} onOpenKept={onOpenKept} />}
    </section>
  )
}

function MirrorPage({
  m,
  today,
  reload,
  onOpenKept,
  onCircle,
}: {
  m: MirrorData
  today: string
  reload: () => void
  onOpenKept: () => void
  onCircle?: () => void
}) {
  const signedIn = !!useAccount()
  const [sharing, setSharing] = useState(false)
  // Leanings the person said are not them stay out of the title (profile.ts).
  const [notMe, setNotMe] = useState(() => notMeSides(today))
  // The card carries the week's name only: "The Steady Finisher".
  const top = leanings(m.traits, notMe)
  const shareName = top.length ? titleCase(`the ${top[0].side.adj} ${(top[1] ?? top[0]).side.noun}`) : null
  const name = title(m.traits, notMe)
  const suggested = identityName(m.traits, notMe)
  const line = tagline(m.traits, notMe)
  const lean = leanings(m.traits)
  // Sunday asks for one line about the week, and once a month brings back a
  // card or a line from the notebook: "Is that still true?"
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0
  const [wordsBack] = useState(() => (sunday ? wordsBackDue(today) : null))
  // Change against the person's own past, from this phone's history, and the
  // one thing they are working on.
  const [changes] = useState(() => changesBetween(loadHistory(), m.from, m.to).slice(-3))
  // What the week's answers reached for, and whether those routes got there
  // in the person's own words (reaching.ts). Also from this phone only.
  const [needs] = useState(() => {
    const h = loadHistory()
    return { top: reachedFor(h, m.from, m.to), all: needsBetween(h, m.from, m.to), safety: safetyLed(h, m.from, m.to) }
  })
  const [focus] = useState(focusPlan)
  const starter = sentenceStarter(leanings(m.traits, notMe)[0]?.side.lean)
  const moved = m.traits.some((t) => t.history.filter((h) => h.score !== undefined).length >= 2)
  // Own words live on this phone only; the server never sees them.
  const words = wordsBetween(m.from, m.to)

  // Each section shows only when there is something real in it.
  const parts: Part[] = [
    { key: 'glance', title: 'Your week at a glance', body: <Glance m={m} />, show: true },
    { key: 'traits', title: 'Your trait read', body: <Traits m={m} />, show: true },
    { key: 'moved', title: "How you've moved", body: <Moved m={m} />, show: moved },
    { key: 'changed', title: 'What changed', body: <Changes changes={changes} />, show: changes.length > 0 },
    {
      key: 'reached',
      title: 'What you reached for',
      body: <Reached top={needs.top} all={needs.all} safety={needs.safety} week={m.from} />,
      show: needs.top.length > 0,
    },
    { key: 'all', title: 'All of you', body: <AllOfYou themes={m.themes} />, show: m.themes.length > 0 },
    {
      key: 'who',
      title: 'Who you were this week',
      body: <Who leans={lean} date={today} span="week" onVerdict={() => setNotMe(notMeSides(today))} />,
      show: lean.length > 0,
    },
    {
      key: 'outside',
      title: 'How your circle experiences you',
      body: <OutsideMirrorSection m={m} onCircle={onCircle} />,
      show: signedIn,
    },
    {
      key: 'sentence',
      title: 'One line for your week',
      body: <SundaySentence week={m.from} starter={starter} />,
      show: (sunday && m.stats.answers > 0) || sentencesBetween(m.from, m.from).length > 0,
    },
    { key: 'words', title: 'In your own words', body: <OwnWordsList words={words} />, show: words.length > 0 },
    {
      key: 'focus',
      title: "What you're working on",
      body: focus && <FocusCard plan={focus} today={today} />,
      show: !!focus,
    },
    {
      key: 'steps',
      title: 'Your small steps',
      body: <Steps m={m} today={today} reload={reload} />,
      show: m.steps.length > 0 || m.stepRecord.started > 0 || (m.stats.plansDid ?? 0) + (m.stats.plansNotYet ?? 0) > 0,
    },
    {
      key: 'revisit',
      title: 'Still true?',
      body: wordsBack && <WordsBackCard item={wordsBack} today={today} />,
      show: !!wordsBack,
    },
    {
      key: 'next',
      title: 'Next week',
      body: <NextWeek m={m} today={today} reload={reload} />,
      show: true,
    },
    { key: 'road', title: 'The road ahead', body: <RoadAhead />, show: true },
  ]
  const sections = numbered(parts)

  return (
    <>
      <header className="m-hero">
        <div className="m-hero-top">
          <p className="m-eyebrow">
            {sunday ? `Sunday · week ${m.week}` : `Week ${m.week}`} · {weekRange(m.from)}
          </p>
          {shareName && (
            <button type="button" className="m-share" aria-label="Share the card" onClick={() => setSharing(true)}>
              <Icon name="share" size={18} />
            </button>
          )}
        </div>
        <h2 className={name ? 'm-were' : undefined}>
          {name ? (
            <>
              This week, you were{' '}
              <span className={name.length > 32 ? 'm-name long' : 'm-name'}>{name}.</span>
            </>
          ) : (
            'This week is just getting started.'
          )}
        </h2>
        {line && <p className="m-tagline">{line}</p>}
        <p className="m-summary">{summary(m, notMe)}</p>
        <ol className="m-week-tiles" aria-hidden="true">
          {weekTiles(today, m.from).map((t) => (
            <li key={t.date} style={t.tint ? { background: t.tint } : undefined} />
          ))}
        </ol>
      </header>
      {sharing && shareName && (
        <ShareSheet content={{ eyebrow: `Week ${m.week} · My Sunday Mirror`, name: shareName, line: line || undefined }} onClose={() => setSharing(false)} />
      )}

      {m.lowMood && (
        <div className="m-card m-support" role="note" aria-label="Support">
          <p>
            A few of your answers this week sounded heavy. If things feel hard, talking to someone you trust, or to a
            helpline, can help.
          </p>
          <a href={helplineHere()} target="_blank" rel="noreferrer">
            Find a helpline in your country
          </a>
        </div>
      )}

      {suggested && <IdentityCard key={`${m.from}-${suggested}`} week={m.from} suggested={suggested} />}
      <OneLine m={m} notMe={notMe} />
      <StatTiles m={m} />
      {sections}
      <Footer onOpenKept={onOpenKept} />
    </>
  )
}

type Part = { key: string; title: string; body: ReactNode; show: boolean }

// numbered lays out the sections that have something real in them, 01, 02…
function numbered(parts: Part[]) {
  return parts
    .filter((p) => p.show)
    .map((p, i) => (
      <section key={p.key} className="m-section" aria-labelledby={`m-${p.key}`}>
        <h3 id={`m-${p.key}`}>
          <span className="m-num">{String(i + 1).padStart(2, '0')}</span> {p.title}
        </h3>
        {p.body}
      </section>
    ))
}

// The answer behind the clearest leaning, unless the person said that
// leaning is not them.
function OneLine({ m, notMe }: { m: MirrorData; notMe: string[] }) {
  const lean = leanings(m.traits, notMe)[0]
  if (lean?.read.evidence[0]) {
    return (
      <figure className="m-card m-oneline" aria-label="One line from this week">
        <p className="m-eyebrow">One line from this week</p>
        <blockquote>“{lean.read.evidence[0]}”</blockquote>
        <figcaption>The answer that said the most about you this week.</figcaption>
      </figure>
    )
  }
  return null
}

function StatTiles({ m }: { m: MirrorData }) {
  const s = m.stats
  const daysNote =
    s.daysActiveLastWeek === 0
      ? 'Your first week here'
      : s.daysActive > s.daysActiveLastWeek
        ? `Up from ${s.daysActiveLastWeek} last week`
        : s.daysActive === s.daysActiveLastWeek
          ? 'Same as last week'
          : `${s.daysActiveLastWeek} last week`
  const tiles: [string, string, string][] = [
    ['Days active', `${s.daysActive} of 6`, daysNote], // Monday to Saturday; Sunday is for this mirror
    // A day can hold more than three answers (evening and pool questions), so no "of".
    [
      'Answers',
      `${s.answers}`,
      (s.daysSoFar >= 6 ? 'this week' : 'so far this week') + (s.private > 0 ? `, ${s.private} kept private` : ''),
    ],
    fitTile(s),
    s.stepsStarted > 0
      ? ['Small steps kept', `${s.stepsTried} of ${s.stepsStarted}`, `${s.stepsHelped} helped`]
      : ['Small steps kept', '–', 'Pick one with "I\'ll try it"'],
  ]
  return (
    <ul className="m-tiles" aria-label="This week in numbers">
      {tiles.map(([label, value, note]) => (
        <li key={label} className="m-tile">
          <span className="m-tile-label">{label}</span>
          <span className="m-tile-value">{value}</span>
          <span className="m-tile-note">{note}</span>
        </li>
      ))}
    </ul>
  )
}

// How many of the cards the person judged were them. "Went deepest" is gone:
// it turned hard answers into a score (the review of 2026-10-15).
function fitTile(s: { me: number; partly: number; rated: number }): [string, string, string] {
  return s.rated > 0
    ? ["That's me", `${s.me} of ${s.rated}`, s.partly > 0 ? `cards you judged, ${s.partly} partly` : 'cards you judged']
    : ["That's me", '–', 'Tap "That\'s me" on a card that fits']
}

// Editions are numbered from launch; anything earlier has no number to show.
const edition = (n: number) => (n > 0 ? ` · Edition #${n}` : '')

const DEPTH_ANSWER: Record<Depth, string> = {
  light: 'a light answer',
  deeper: 'a deeper answer',
  deep: 'a deep answer',
  private: 'a private answer',
}

const weekday = (iso: string, style: 'short' | 'long' = 'short') =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: style, timeZone: 'UTC' })

function Glance({ m }: { m: MirrorData }) {
  const active = m.days.map((d, i) => i < m.stats.daysSoFar && d.answers.length > 0)
  let run = 0
  let best = 0
  for (const a of active) {
    run = a ? run + 1 : 0
    best = Math.max(best, run)
  }
  const shown = active.filter(Boolean).length
  const rhythm =
    shown === 0
      ? 'No answers yet this week. Whenever you come back, your week starts filling in.'
      : `You came back on ${shown} of ${Math.min(6, m.stats.daysSoFar)} ${m.stats.daysSoFar >= 6 ? 'days' : 'days so far'}` +
        (best >= 2 ? `, with a run of ${best} in a row.` : '.') +
        ' Showing up is the whole trick: patterns only appear once there are a few answers to look back on.'
  return (
    <>
      <ol className="m-days">
        {m.days.map((d, i) => {
          // Sunday has no edition: it is the day for this mirror.
          const review = d.edition === 0 && d.answers.length === 0
          const future = !review && i >= m.stats.daysSoFar
          const label = `${weekday(d.date, 'long')}: ${
            review
              ? 'review day'
              : future
                ? 'still to come'
                : d.answers.length === 0
                  ? 'missed'
                  : d.answers.map((a) => `${themeName(a.theme)}, ${DEPTH_ANSWER[a.depth]}`).join('; ')
          }`
          return (
            <li key={d.date} className={review ? 'm-day review' : future ? 'm-day later' : 'm-day'} aria-label={label}>
              <span className="m-day-name" aria-hidden="true">
                {weekday(d.date)}
              </span>
              <span className="m-day-squares" aria-hidden="true">
                {review ? (
                  <span className="m-day-review">🪞</span>
                ) : d.answers.length === 0 ? (
                  <span className={future ? 'sq later' : 'sq missed'} />
                ) : (
                  d.answers.map((a, j) => <span key={j} className={`sq ${a.depth}`} />)
                )}
              </span>
              <span className="m-day-ed" aria-hidden="true">
                {review ? 'Review' : `#${d.edition}`}
              </span>
            </li>
          )
        })}
      </ol>
      <ul className="m-legend" aria-hidden="true">
        <li>
          <span className="sq deep" /> Deep
        </li>
        <li>
          <span className="sq deeper" /> Deeper
        </li>
        <li>
          <span className="sq light" /> Light
        </li>
        <li>
          <span className="sq private" /> Private answer
        </li>
        <li>
          <span className="sq missed" /> Missed day
        </li>
      </ul>
      <p className="m-text">{rhythm}</p>
    </>
  )
}

function Traits({ m }: { m: MirrorData }) {
  const unread = Object.keys(TRAITS).filter((t) => !m.traits.some((r) => r.trait === t))
  return (
    <>
      {m.traits.length === 0 ? (
        <p className="m-text">Your trait read starts once two answers touch the same trait. A few more days will do it.</p>
      ) : (
        <ul className="m-traits" aria-label="Trait read">
          {m.traits.map((t) => {
            const text = TRAITS[t.trait]
            if (!text) return null
            return (
              <li key={t.trait}>
                <div className="m-trait-head">
                  <span className="m-trait-name">{text.name}</span>
                  <span className="m-trait-score">
                    {t.score}
                    {t.change !== undefined && t.change !== 0 && (
                      <span className="m-change">
                        {' '}
                        {t.change > 0 ? '+' : '−'}
                        {Math.abs(t.change)} vs last week
                      </span>
                    )}
                  </span>
                </div>
                <span className="m-scale" aria-hidden="true">
                  <span className="m-scale-mid" />
                  <span className="m-scale-dot" style={{ left: `${t.score}%` }} />
                </span>
                <p className="m-trait-meta">{levelMeta(t)}</p>
                <WhyThis t={t} name={text.name} />
              </li>
            )
          })}
        </ul>
      )}
      <p className="m-note">
        0 to 100: where your answers sit between each question's two ends, with 50 in the middle. It compares you only
        with yourself, week to week.
      </p>
      <div className="m-side">
        {unread.length > 0 && (
          <div className="m-card">
            <p className="m-eyebrow">The trait you never described</p>
            <p>
              Nothing you answered lately touched <strong>{TRAITS[unread[0]].name.toLowerCase()}</strong>. A question on it
              will come round; that's where you might surprise yourself.
            </p>
          </div>
        )}
        <div className="m-card">
          <p className="m-eyebrow">Reading this honestly</p>
          <p>
            A week of everyday answers gives a rough read, not a verdict. Traits like these do predict real outcomes, but
            each by a modest amount, and you are always more than a number.
          </p>
        </div>
      </div>
    </>
  )
}

// What changed: answers this week that leaned a way the person's own
// answers had not leaned for weeks (profile.ts, changeAt). Never set against
// anyone else.
function Changes({ changes }: { changes: Change[] }) {
  return (
    <div className="m-card m-changes">
      <ul className="m-why-list">
        {changes.map((c) => (
          <li key={`${c.questionId}-${c.trait}`}>
            <span className="m-why-date">{longDate(c.date)}</span> {changeWords(c)}
          </li>
        ))}
      </ul>
      <p className="m-note">{CHANGES_NOTE}</p>
    </div>
  )
}

// What you reached for: the week's two needs that drove most choices, once
// each is a pattern, and the routes the person said got them there (the
// evening's question). Doing well and being respected are kept apart. When
// feeling safe has come first three weeks running, the mirror asks, never
// tells, whether something else feels uncertain.
function Reached({ top, all, safety, week }: { top: NeedRead[]; all: NeedRead[]; safety: boolean; week: string }) {
  const [first, second] = top
  const has = (n: NeedRead['need']) => all.some((r) => r.need === n)
  return (
    <div className="m-card m-reached">
      <p className="m-text">{reachedLine(NEED_PHRASES[first.need], second && NEED_PHRASES[second.need])}</p>
      {top.map((r) => (
        <Routes key={r.need} read={r} />
      ))}
      {has('competence') && has('respect') && <p className="m-note">{SUCCESS_TWO}</p>}
      {safety && <SafetyAsk week={week} />}
      <p className="m-note">{REACHED_NOTE}</p>
    </div>
  )
}

function Routes({ read }: { read: NeedRead }) {
  const worked = read.routes.filter((r) => r.route !== 'no')
  const not = read.routes.filter((r) => r.route === 'no')
  if (worked.length === 0 && not.length === 0) return null
  const list = (rs: NeedRead['routes']) => rs.map((r) => `“${r.label}”`).join(', ')
  return (
    <div className="m-routes" role="group" aria-label={NEED_NAMES[read.need]}>
      <p className="m-trait-name">{NEED_NAMES[read.need]}</p>
      {worked.length > 0 && (
        <p>
          {ROUTES_WORKED}: {list(worked)}.
        </p>
      )}
      {not.length > 0 && (
        <p>
          {ROUTES_NOT}: {list(not)}.
        </p>
      )}
    </div>
  )
}

function SafetyAsk({ week }: { week: string }) {
  const [answer, setAnswer] = useState<Uncertain | null>(() => safetyAnswer(week))
  return (
    <div className="m-safety" role="group" aria-label="Is something else uncertain?">
      <p className="m-text">{SAFETY_ASK}</p>
      {answer ? (
        <p className="m-note">{SAFETY_REPLIES[answer]}</p>
      ) : (
        <div className="m-verdict">
          {UNCERTAIN.map((u) => (
            <button
              key={u}
              type="button"
              className="m-chip"
              onClick={() => {
                rememberSafety(week, u)
                setAnswer(u)
              }}
            >
              {SAFETY_WORDS[u]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Moved({ m }: { m: MirrorData }) {
  const rows = m.traits.filter((t) => TRAITS[t.trait] && t.history.filter((h) => h.score !== undefined).length >= 2)
  return (
    <>
      <ul className="m-moved" aria-label="Your reads over three weeks">
        {rows.map((t) => (
          <li key={t.trait}>
            <span className="m-trait-name">{TRAITS[t.trait].name}</span>
            <span className="m-minis">
              {t.history.map((h) => (
                <span key={h.week} className="m-mini" aria-label={`Week ${h.week}: ${h.score ?? 'no read'}`}>
                  <span className={h.score === undefined ? 'm-mini-track none' : 'm-mini-track'} aria-hidden="true">
                    <span style={{ height: `${h.score ?? 0}%` }} />
                  </span>
                  <span className="m-mini-week" aria-hidden="true">
                    W{h.week}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="m-card">
        <p className="m-eyebrow">Why movement is possible</p>
        <p>
          Traits shift across a lifetime, people who set out to change a trait often do move it a little, and small
          if-then plans make new habits stick.
        </p>
      </div>
    </>
  )
}

function AllOfYou({ themes: read }: { themes: ThemeRead[] }) {
  const answered = new Map(read.map((t) => [t.theme, t]))
  const deepest = read.filter((t) => t.depth === 'deep').slice(0, 3)
  const unknown = Object.keys(THEMES).filter((t) => !answered.has(t))
  return (
    <>
      {Object.keys(AREA_NAMES).map((area) => {
        const themes = Object.entries(THEMES).filter(([, t]) => t.area === area)
        return (
          <div key={area} className="m-area">
            <p className="m-area-name">{AREA_NAMES[area]}</p>
            <ul className="m-themes">
              {themes.map(([slug, t]) => {
                const r = answered.get(slug)
                return (
                  <li
                    key={slug}
                    className={`m-theme ${r ? r.depth : 'none'}`}
                    style={themeVars(slug)}
                    aria-label={`${t.name}: ${r ? `${r.answers} ${r.answers === 1 ? 'answer' : 'answers'}, ${DEPTH_WORDS[r.depth]}` : 'not yet'}`}
                  >
                    <span aria-hidden="true">{t.icon}</span>
                    <span aria-hidden="true">{t.name}</span>
                    <span className="m-theme-n" aria-hidden="true">
                      {r ? r.answers : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      <ul className="m-legend" aria-hidden="true">
        <li>
          <span className="sq deep" /> Deep
        </li>
        <li>
          <span className="sq deeper" /> Deeper
        </li>
        <li>
          <span className="sq light" /> Light
        </li>
        <li>
          <span className="sq private" /> Private
        </li>
      </ul>
      <div className="m-side">
        {deepest.length > 0 && (
          <div className="m-card">
            <p className="m-eyebrow">Where you go deepest</p>
            <p>
              {deepest.map((t) => themeName(t.theme)).join(', ')}. When you pick the most revealing answers somewhere, it
              usually means that part of life is on your mind.
            </p>
          </div>
        )}
        {unknown.length > 0 && (
          <div className="m-card">
            <p className="m-eyebrow">Still mostly unknown</p>
            <p>
              {unknown.slice(0, 4).map(themeName).join(', ')}
              {unknown.length > 4 ? ` and ${unknown.length - 4} more` : ''}. They'll come round in the coming weeks.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

const DEPTH_WORDS = { light: 'light', deeper: 'deeper', deep: 'deep', private: 'private' } as const

// The week's plan checks. The plans themselves stay on the phone; the server
// only counts "did it" and "not yet".
function PlanRecord({ did, notYet }: { did: number; notYet: number }) {
  if (did + notYet === 0) return null
  const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)
  return (
    <div className="m-card">
      <p className="m-eyebrow">Your plans this week</p>
      <p>
        {did > 0 ? `You did what you planned ${times(did)}` : 'You checked in on your plans'}
        {notYet > 0 ? `, and said "not yet" ${times(notYet)}.` : '.'}{' '}
        {notYet > did ? 'A plan that keeps slipping may need a smaller "I will".' : 'Plans tied to a moment are the ones that last.'}
      </p>
    </div>
  )
}

// "Why do you say that?": the person's own answers a read rests on, from the
// server's copy of them, newest first. Each says which way it pointed, so a
// read that rests on mixed answers shows it.
function WhyThis({ t, name }: { t: MirrorData['traits'][number]; name: string }) {
  const [open, setOpen] = useState(false)
  if (!t.behind || t.behind.length === 0) return null
  const high = t.score >= 50
  const way = (l: 'high' | 'low' | 'middle') =>
    l === 'middle' ? 'in between' : (l === 'high') === high ? 'points this way' : 'points the other way'
  const id = `why-${t.trait}`
  return (
    <div className="m-why">
      <button type="button" className="text-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {open ? 'Hide the answers' : 'Why do you say that?'}
      </button>
      {open && (
        <div id={id}>
          <p className="m-note">
            {`Your read on ${name.toLowerCase()} comes from ${t.answers === 1 ? 'one answer' : `${t.answers} answers`} over ${
              t.weeks === 1 ? 'one week' : `${t.weeks} weeks`
            }.`}
            {t.behind.length < t.answers ? ` Here are the newest ${t.behind.length}.` : ' Here they are, newest first.'}
          </p>
          <ul className="m-why-list">
            {t.behind.map((b, i) => (
              <li key={`${b.date}-${i}`}>
                <span className="m-why-date">{longDate(b.date)}</span> {b.question} You said “{b.answer}”.{' '}
                <span className="m-why-way">({way(b.leans)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// The leanings that have earned a name, each with its honest part and
// whether the person says it is them. Used by the week and the longer spans.
function Who({
  leans,
  date,
  span,
  onVerdict,
}: {
  leans: Lean<{ trait: string; score: number; level: Level; answers: number; days: number; weeks: number; evidence?: string[] }>[]
  date: string
  span: string
  onVerdict: () => void
}) {
  return (
    <ul className="m-who">
      {leans.slice(0, 3).map((l) => (
        <li key={l.read.trait} className="m-card m-who-card">
          <div className="m-who-top">
            <span className="m-who-trait">{l.text.name}</span>
          </div>
          <p className="m-who-headline">{l.side.headline}</p>
          <p>{l.side.prediction}</p>
          <p className="m-who-honest">
            <strong>The honest part:</strong> {honestLine(l.side, date, 'mirror').text}
          </p>
          <PlanOffer trait={l.read.trait} high={l.high} date={date} />
          <ReadLink side={`${l.read.trait}.${l.high ? 'high' : 'low'}`} />
          {l.read.evidence && l.read.evidence.length > 0 && (
            <p className="m-who-evidence">You said: {l.read.evidence.map((e) => `“${e}”`).join(', ')}</p>
          )}
          <p className="m-who-kind">{levelLine(l.read, span)}</p>
          <LeaningVerdict trait={l.read.trait} high={l.high} date={date} onVerdict={onVerdict} />
        </li>
      ))}
    </ul>
  )
}

// "That's me", "Partly" or "Not me" under a leaning, kept on this phone only.
function LeaningVerdict({
  trait,
  high,
  date,
  onVerdict,
}: {
  trait: string
  high: boolean
  date: string
  onVerdict: () => void
}) {
  const [verdict, setVerdict] = useState(() => leaningVerdict(trait, high, date))
  function tap(v: Verdict) {
    rememberLeaning(trait, high, v, date)
    setVerdict(v)
    onVerdict()
  }
  if (verdict) return <p className="m-note">{LEANING_REPLIES[verdict]}</p>
  return (
    <div className="m-verdict" role="group" aria-label="Does this sound like you?">
      <button type="button" className="m-chip" onClick={() => tap('me')}>
        That's me
      </button>
      <button type="button" className="m-chip" onClick={() => tap('partly')}>
        Partly
      </button>
      <button type="button" className="m-chip" onClick={() => tap('not_me')}>
        Not me
      </button>
    </div>
  )
}

// What someone wrote instead of tapping, read from this phone. An intimacy
// answer shows only that it was written, so the words never sit open on a page.
function OwnWordsList({ words }: { words: OwnWords[] }) {
  return (
    <>
      <ul className="m-words">
        {words.map((w) => (
          <li key={w.questionId} className="m-card m-word" style={themeVars(w.theme)}>
            <p className="m-step-meta">
              <span aria-hidden="true">{themeStyle(w.theme).icon} </span>
              {w.theme ? themeName(w.theme) : 'Today'} · {longDate(w.date)}
            </p>
            <p className="m-word-prompt">{w.prompt}</p>
            {w.private ? (
              <p className="m-word-private">A private answer, in your own words.</p>
            ) : (
              <blockquote className="m-word-text">“{w.words}”</blockquote>
            )}
            {w.closest && !w.private && <p className="m-note">Closest to: {w.closest}</p>}
          </li>
        ))}
      </ul>
      <p className="m-note">Only on this phone. These words were never sent anywhere.</p>
    </>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const STATUS_WORDS = STEP_STATUS_WORDS

// Open steps pile up when they're never marked, so the list starts short.
const STEPS_SHOWN = 4

function Steps({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const [error, setError] = useState(false)
  const [all, setAll] = useState(false)
  const shown = all ? m.steps : m.steps.slice(0, STEPS_SHOWN)
  async function mark(s: MirrorData['steps'][number], status: StepStatus) {
    setError(false)
    try {
      await setMoveStatus(s.questionId, status, today, { optionId: s.optionId, step: s.step, date: s.started })
      reload()
    } catch {
      setError(true)
    }
  }
  const r = m.stepRecord
  return (
    <>
      <ul className="m-steps" aria-label="Steps you started">
        {shown.map((s) => (
          <li key={s.questionId} className="m-card m-step" style={themeVars(s.theme)}>
            <p className="m-step-meta">
              <span aria-hidden="true">{themeStyle(s.theme).icon} </span>
              {themeName(s.theme)}
              {edition(s.edition)} · <span className={`m-status ${s.status}`}>{STATUS_WORDS[s.status]}</span>
            </p>
            <p>{s.step}</p>
            {s.status === 'started' && (
              <div className="m-step-buttons" role="group" aria-label="How did it go?">
                <button type="button" className="m-chip" onClick={() => mark(s, 'helped')}>
                  It helped
                </button>
                <button type="button" className="m-chip" onClick={() => mark(s, 'no_change')}>
                  No change yet
                </button>
                <button type="button" className="m-chip" onClick={() => mark(s, 'not_tried')}>
                  Not today
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {m.steps.length > shown.length && (
        <button type="button" className="m-link" onClick={() => setAll(true)}>
          Show all {m.steps.length} steps
        </button>
      )}
      {error && (
        <p className="m-error" role="alert">
          That didn't save. Please try again.
        </p>
      )}
      <div className="m-card">
        <p className="m-eyebrow">Your record so far</p>
        <p>
          {r.started} {r.started === 1 ? 'step' : 'steps'} started, {r.tried} tried, {r.helped} helped.{' '}
          {r.tried === 0
            ? 'Trying one is what counts, even when nothing changes.'
            : 'Every try teaches you something, including the ones that change nothing.'}
        </p>
      </div>
      <PlanRecord did={m.stats.plansDid ?? 0} notYet={m.stats.plansNotYet ?? 0} />
    </>
  )
}

function NextWeek({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const [error, setError] = useState(false)
  const early = m.traits.filter((t) => t.level === 'hint' && TRAITS[t.trait]).slice(0, 2)
  async function start(s: MirrorData['nextSteps'][number]) {
    setError(false)
    try {
      await startMove(today, s.questionId, s.optionId, s.step)
      reload()
    } catch {
      setError(true)
    }
  }
  return (
    <>
      {m.nextSteps.length > 0 && (
        <ol className="m-next">
          {m.nextSteps.map((s) => (
            <li key={s.questionId} className="m-card m-step" style={themeVars(s.theme)}>
              <p className="m-step-meta">
                <span aria-hidden="true">{themeStyle(s.theme).icon} </span>
                {themeName(s.theme)}
                {s.edition > 0 && ` · from Edition #${s.edition}`}
              </p>
              <p>{s.step}</p>
              <button type="button" className="m-button" onClick={() => start(s)}>
                Start this step
              </button>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p className="m-error" role="alert">
          That didn't save. Please try again.
        </p>
      )}
      <div className="m-side">
        {m.comingUp.length > 0 && (
          <div className="m-card">
            <p className="m-eyebrow">Coming up</p>
            <p>{m.comingUp.map(themeName).join(' · ')}</p>
          </div>
        )}
        {early.length > 0 && (
          <div className="m-card">
            <p className="m-eyebrow">Sharpen your read</p>
            <p>
              {early.map((t) => TRAITS[t.trait].name).join(' and ')} {early.length === 1 ? 'is' : 'are'} only a hint so
              far. Answers on a few more days will show whether {early.length === 1 ? "it's a pattern" : "they're patterns"}.
            </p>
          </div>
        )}
      </div>
    </>
  )
}

function RoadAhead() {
  return (
    <>
      <ol className="m-road">
        <li>
          <strong>Next Sunday</strong> Another week of answers, and your reads firm up.
        </li>
        <li>
          <strong>In a month</strong> Four weeks is enough to see which small steps actually stuck.
        </li>
        <li>
          <strong>In a year</strong> The slow changes, the ones you only notice looking back.
        </li>
      </ol>
      <p className="m-text">
        Nothing on this page is fixed. It's a mirror of one week, and next week you get to answer again.
      </p>
    </>
  )
}

function Footer({ onOpenKept }: { onOpenKept: () => void }) {
  const signedIn = !!useAccount()
  return (
    <footer className="m-footer">
      <p className="m-strong">For self-reflection, not a diagnosis.</p>
      <div className="m-privacy" role="note" aria-label="What leaves my phone">
        <p className="m-eyebrow">What leaves my phone</p>
        {signedIn ? (
          <p>
            You're signed in, so I keep your answers under a key made from your account, the same on every device you
            sign in on. Your name and handle are never stored with them, but the server can tell they belong to your
            account. For an intimate question I keep only that you answered, never what you chose. Anything you write in
            your own words stays on your phone and is never sent.
          </p>
        ) : (
          <p>
            I keep your answers on the server under an anonymous key made from this phone's pass: no name, no email, no
            account. That's how I build this mirror. For an intimate question I keep only that you answered, never what
            you chose. Anything you write in your own words stays on this phone and is never sent.
          </p>
        )}
        <p>
          Your answers and small steps go after five weeks. For your month, quarter and year, I keep a small note of each
          week for 13 months: how many answers, how deep they went, your three clearest answers and the steps that helped.
        </p>
      </div>
      <button type="button" className="m-link" onClick={onOpenKept}>
        What I keep, and how to delete it
      </button>
    </footer>
  )
}

// The month, quarter or year: this phone's weeks added up, set only against
// its own earlier weeks and the period before.
function PeriodPage({ p, onOpenKept }: { p: PeriodMirror; onOpenKept: () => void }) {
  const noun = p.period
  const [notMe, setNotMe] = useState(() => notMeSides(p.date))
  const name = title(p.traits, notMe)
  const line = tagline(p.traits, notMe)
  const lean = leanings(p.traits)
  const moved = noun !== 'year' && p.traits.some((t) => t.weekly.filter((w) => w.score !== undefined).length >= 2)
  // The Sunday sentences of the weeks in this span (a week belongs to the
  // span that holds its Thursday), from this phone only.
  const lines = sentencesBetween(addDays(p.from, -3), addDays(p.to, -3))
  const parts: Part[] = [
    { key: 'weeks', title: 'Week by week', body: <WeekByWeek p={p} />, show: true },
    { key: 'traits', title: 'Your trait read', body: <PeriodTraits p={p} />, show: true },
    { key: 'moved', title: "How you've moved", body: <PeriodMoved p={p} />, show: moved },
    { key: 'moments', title: 'The answers that said the most', body: <Moments p={p} />, show: p.moments.length > 0 },
    {
      key: 'who',
      title: `Who you were this ${noun}`,
      body: <Who leans={lean} date={p.date} span={noun} onVerdict={() => setNotMe(notMeSides(p.date))} />,
      show: lean.length > 0,
    },
    { key: 'lines', title: 'In your own words, week by week', body: <WeekLines lines={lines} />, show: lines.length > 0 },
    { key: 'all', title: 'All of you', body: <AllOfYou themes={p.themes} />, show: p.themes.length > 0 },
    { key: 'steps', title: 'Your small steps', body: <PeriodSteps p={p} />, show: p.stats.stepsStarted > 0 },
  ]
  return (
    <>
      <header className="m-hero">
        <p className="m-eyebrow">
          Your {adjOf(noun)} mirror · {periodName(noun, p.label)} ·{' '}
          <span className="m-nowrap">
            Week {p.weeks.length} of {p.weeksTotal}
          </span>
        </p>
        <h2 className={name ? 'm-were' : undefined}>
          {name ? (
            <>
              This {noun}, you were <span className="m-name">{name}.</span>
            </>
          ) : (
            `This ${noun} is just getting started.`
          )}
        </h2>
        {line && <p className="m-tagline">{line}</p>}
        <p className="m-summary">{periodSummary(p, notMe)}</p>
      </header>
      <PeriodTiles p={p} />
      {numbered(parts)}
      <p className="m-text m-close">{PERIOD_CLOSE[noun]}</p>
      <Footer onOpenKept={onOpenKept} />
    </>
  )
}

function WeekLines({ lines }: { lines: { week: string; text: string }[] }) {
  return (
    <>
      <ul className="m-words">
        {lines.map((l) => (
          <li key={l.week} className="m-card m-word">
            <p className="m-step-meta">{weekRange(l.week)}</p>
            <blockquote className="m-word-text">“{l.text}”</blockquote>
          </li>
        ))}
      </ul>
      <p className="m-note">Only on this phone. These lines were never sent anywhere.</p>
    </>
  )
}

function PeriodTiles({ p }: { p: PeriodMirror }) {
  const s = p.stats
  const prev = p.previous
  const before = prev && p.previousLabel ? periodName(p.period, p.previousLabel, false) : null
  // Weeks with nothing on record are left out of both counts, and the notes say so.
  const all = s.weeksSoFar === p.weeks.length
  const tiles: [string, string, string][] = [
    [
      'Days active',
      `${s.daysActive} of ${s.daysSoFar}`,
      prev && before
        ? `${prev.daysActive} of ${prev.daysSoFar} in ${before}`
        : all
          ? 'question days so far'
          : 'question days on record',
    ],
    [
      'Weeks you came back',
      `${s.weeksActive} of ${s.weeksSoFar}`,
      prev && before
        ? `${prev.weeksActive} of ${prev.weeksSoFar} in ${before}`
        : all
          ? 'weeks with an answer'
          : 'weeks on record',
    ],
    ['Answers', `${s.answers}`, s.private > 0 ? `${s.private} kept private` : `this ${p.period}`],
    fitTile(s),
    s.stepsStarted > 0
      ? ['Small steps kept', `${s.stepsTried} of ${s.stepsStarted}`, `${s.stepsHelped} helped`]
      : ['Small steps kept', '–', 'Pick one with "I\'ll try it"'],
  ]
  return (
    <ul className="m-tiles" aria-label={`This ${p.period} in numbers`}>
      {tiles.map(([label, value, note]) => (
        <li key={label} className="m-tile">
          <span className="m-tile-label">{label}</span>
          <span className="m-tile-value">{value}</span>
          <span className="m-tile-note">{note}</span>
        </li>
      ))}
    </ul>
  )
}

// One bar per week so far, as tall as the days answered in it. A week with
// nothing on record (before the mirror kept notes) is drawn empty and says so.
function WeekByWeek({ p }: { p: PeriodMirror }) {
  const kept = p.weeks.filter((w) => w.kept)
  let run = 0
  let best = 0
  for (const w of kept) {
    run = w.answers > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  const active = kept.filter((w) => w.answers > 0).length
  const toCome = p.weeksTotal - p.weeks.length
  const rhythm =
    active === 0
      ? `No answers yet this ${p.period}. Whenever you come back, it starts filling in.`
      : `You came back in ${active} of ${plural(kept.length, 'week', 'weeks')}` +
        (best >= 2 ? `, ${best} in a row at best.` : '.') +
        " A week off is fine; the mirror picks up wherever you left off."
  return (
    <>
      <ol className={`m-weeks ${p.period}`} aria-label="Week by week">
        {p.weeks.map((w) => (
          <li
            key={w.monday}
            className={w.kept ? 'm-week' : 'm-week none'}
            aria-label={
              w.kept
                ? `Week ${w.week}: ${w.daysActive} of ${w.daysSoFar} days, ${plural(w.answers, 'answer', 'answers')}`
                : `Week ${w.week}: nothing on record`
            }
          >
            <span className="m-week-track" aria-hidden="true">
              <span style={{ height: `${Math.min(100, (w.daysActive / 6) * 100)}%` }} />
            </span>
            {p.period !== 'year' && (
              <span className="m-week-num" aria-hidden="true">
                W{w.week}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="m-note">
        {p.period === 'year' && p.weeks.length > 0 ? `Each bar is a week, from week ${p.weeks[0].week} to week ${p.weeks[p.weeks.length - 1].week}. ` : ''}
        A full bar is all six question days.
        {toCome > 0 ? ` ${plural(toCome, 'week', 'weeks')} still to come.` : ''}
      </p>
      <p className="m-text">{rhythm}</p>
    </>
  )
}

function PeriodTraits({ p }: { p: PeriodMirror }) {
  if (p.traits.length === 0) {
    return <p className="m-text">Your trait read starts once two answers touch the same trait. A few more days will do it.</p>
  }
  return (
    <>
      <ul className="m-traits" aria-label="Trait read">
        {p.traits.map((t) => {
          const text = TRAITS[t.trait]
          if (!text) return null
          return (
            <li key={t.trait}>
              <div className="m-trait-head">
                <span className="m-trait-name">{text.name}</span>
                <span className="m-trait-score">
                  {t.score}
                  {t.change !== undefined && t.change !== 0 && (
                    <span className="m-change">
                      {' '}
                      {t.change > 0 ? '+' : '−'}
                      {Math.abs(t.change)} since your first weeks
                    </span>
                  )}
                </span>
              </div>
              <span className="m-scale" aria-hidden="true">
                <span className="m-scale-mid" />
                <span className="m-scale-dot" style={{ left: `${t.score}%` }} />
              </span>
              <p className="m-trait-meta">{levelMeta(t)}</p>
            </li>
          )
        })}
      </ul>
      <p className="m-note">
        0 to 100: where your answers this {p.period} sit between each question's two ends, with 50 in the middle. The
        change sets your latest weeks against your first ones; it compares you only with yourself.
      </p>
    </>
  )
}

function PeriodMoved({ p }: { p: PeriodMirror }) {
  const rows = p.traits.filter((t) => TRAITS[t.trait] && t.weekly.filter((w) => w.score !== undefined).length >= 2)
  return (
    <ul className="m-moved" aria-label="Your reads week by week">
      {rows.map((t) => (
        <li key={t.trait}>
          <span className="m-trait-name">{TRAITS[t.trait].name}</span>
          <span className="m-minis">
            {t.weekly.map((h) => (
              <span key={h.week} className="m-mini" aria-label={`Week ${h.week}: ${h.score ?? 'no read'}`}>
                <span className={h.score === undefined ? 'm-mini-track none' : 'm-mini-track'} aria-hidden="true">
                  <span style={{ height: `${h.score ?? 0}%` }} />
                </span>
                <span className="m-mini-week" aria-hidden="true">
                  W{h.week}
                </span>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

// The deepest answers that leaned clearly one way, in the person's own words,
// with the first line of the card each one showed.
function Moments({ p }: { p: PeriodMirror }) {
  return (
    <>
      <ul className="m-moments" aria-label="The answers that said the most">
        {p.moments.map((mo) => (
          <li key={`${mo.date}-${mo.prompt}`} className="m-card m-moment" style={themeVars(mo.theme)}>
            <p className="m-step-meta">
              <span aria-hidden="true">{themeStyle(mo.theme).icon} </span>
              {themeName(mo.theme)} · {longDate(mo.date)}
              {edition(mo.edition)}
            </p>
            <p className="m-moment-prompt">{mo.prompt}</p>
            <blockquote>“{mo.label}”</blockquote>
            {mo.headline && <p className="m-moment-shows">{mo.headline}</p>}
          </li>
        ))}
      </ul>
      <p className="m-note">Your deepest answers this {p.period} that leaned clearly one way. Private answers are never shown.</p>
    </>
  )
}

function PeriodSteps({ p }: { p: PeriodMirror }) {
  const s = p.stats
  return (
    <>
      {p.helped.length > 0 && (
        <ul className="m-steps" aria-label="Steps that helped">
          {p.helped.map((h) => (
            <li key={`${h.started}-${h.step}`} className="m-card m-step" style={themeVars(h.theme)}>
              <p className="m-step-meta">
                <span aria-hidden="true">{themeStyle(h.theme).icon} </span>
                {themeName(h.theme)} · started {longDate(h.started)} ·{' '}
                <span className="m-status helped">Helped</span>
              </p>
              <p>{h.step}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="m-card">
        <p className="m-eyebrow">This {p.period}</p>
        <p>
          {plural(s.stepsStarted, 'step', 'steps')} started, {s.stepsTried} tried, {s.stepsHelped} helped.{' '}
          {s.stepsHelped > 0
            ? 'The ones that helped are worth keeping.'
            : 'Every try teaches you something, including the ones that change nothing.'}
        </p>
      </div>
    </>
  )
}

// How your circle experiences you (Stage 5, the Outside Mirror): where
// friends, blended, place you on each trait at least three of them spoke
// to, beside where your own answers place you. Locked, it shows only how
// many friends have answered, never which.
function OutsideMirrorSection({ m, onCircle }: { m: MirrorData; onCircle?: () => void }) {
  const [o, setO] = useState<OutsideMirrorData | null>(null)
  useEffect(() => {
    let live = true
    outsideMirror().then(
      (x) => live && setO(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  if (!o) return null
  if (!o.open) {
    const rows = Array.from({ length: o.need }, (_, i) => i < o.friends)
    return (
      <div className="m-card outside-locked">
        <div className="outside-head">
          <span className="outside-lock" aria-hidden="true">
            <Icon name="lock" size={20} />
          </span>
          <p className="outside-opens">Opens when {o.need} friends have answered</p>
        </div>
        <ul className="outside-count" aria-label={`${o.friends} of ${o.need} friends have answered`}>
          {rows.map((done, i) => (
            <li key={i} className={done ? 'is-done' : 'is-open'}>
              <span className="outside-dot" aria-hidden="true">
                {done && <Icon name="check" size={14} />}
              </span>
              <span className="outside-who">{done ? 'A friend' : o.need - o.friends === 1 ? 'One more friend' : 'A friend to invite'}</span>
              {done ? (
                <span className="outside-state">Answered</span>
              ) : (
                onCircle && (
                  <button type="button" className="link-button outside-state" onClick={onCircle}>
                    Invite
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        <p className="outside-why">
          With two friends you could work out who said what by elimination. Three keeps every answer anonymous, by
          arithmetic, not by promise. Answers already given are held until the third friend joins.
        </p>
        {onCircle && (
          <button type="button" className="btn wide" onClick={onCircle}>
            {o.need - o.friends === 1 ? 'Invite one more person' : 'Invite friends'}
          </button>
        )}
      </div>
    )
  }
  const own = new Map(m.traits.map((t) => [t.trait, t.score]))
  const rows = o.traits.filter((t) => TRAITS[t.trait])
  const gaps = rows
    .filter((t) => own.has(t.trait))
    .map((t) => ({ t, gap: t.position - (own.get(t.trait) ?? 50) }))
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
  const shared = gaps[0] && Math.abs(gaps[0].gap) < 15 ? gaps[0] : null
  const miss = gaps.length && Math.abs(gaps[gaps.length - 1].gap) >= 20 ? gaps[gaps.length - 1] : null
  return (
    <>
      <p className="small muted">
        Blended from {o.friends} friends over {o.weeks} weeks. No single answer is ever shown.
      </p>
      {shared && (
        <div className="m-card">
          <p className="label">Shared ground</p>
          <p>
            You and your circle both see you near {sideOf(TRAITS[shared.t.trait], shared.t.position >= 50).lean}.
          </p>
        </div>
      )}
      {miss && (
        <div className="m-card outside-miss">
          <p className="label">What your circle notices that you might miss</p>
          <p>
            Your circle places you nearer {sideOf(TRAITS[miss.t.trait], miss.gap > 0).lean} than your own answers do.
            Neither is the truer one: people see the side of you that you show them.
          </p>
        </div>
      )}
      <ul className="outside-scales">
        {rows.map((t) => {
          const tr = TRAITS[t.trait]
          const mine = own.get(t.trait)
          return (
            <li key={t.trait}>
              <p className="row-between small">
                <span>{tr.low.lean}</span>
                <span>{tr.high.lean}</span>
              </p>
              <span
                className="m-scale"
                role="img"
                aria-label={`${tr.name}: your circle ${Math.round(t.position)} of 100${mine === undefined ? '' : `, you ${mine}`}`}
              >
                {mine !== undefined && <span className="m-scale-dot you" style={{ left: `${mine}%` }} />}
                <span className="m-scale-dot circle" style={{ left: `${t.position}%` }} />
              </span>
            </li>
          )
        })}
      </ul>
      <p className="small muted">
        <span className="dot-key you" /> you · <span className="dot-key circle" /> your circle
      </p>
    </>
  )
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
