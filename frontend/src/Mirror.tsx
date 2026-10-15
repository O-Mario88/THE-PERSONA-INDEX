import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  forgetLocal,
  forgetMirror,
  getMirror,
  saveStep,
  type AnswerSplit,
  type Crowd,
  type Mirror as MirrorData,
  type StepStatus,
} from './api'
import { setMoveStatus } from './game'
import {
  AREA_NAMES,
  archetype,
  leanings,
  pct,
  SOURCES,
  summary,
  tagline,
  TRAITS,
  type SourceKey,
} from './mirrorText'
import { THEMES, themeName, themeStyle, themeVars } from './themes'

type State = { kind: 'loading' } | { kind: 'ready'; m: MirrorData } | { kind: 'error' }

const STRENGTH_LABEL = { strong: 'Strong evidence', moderate: 'Some evidence' } as const

// The weekly mirror: built by the server from this phone's kept answers, so
// every number here is real. Sections with nothing real to show stay hidden.
export function Mirror({ today }: { today: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let live = true
    getMirror(today).then(
      (m) => live && setState({ kind: 'ready', m }),
      () => live && setState({ kind: 'error' }),
    )
    return () => {
      live = false
    }
  }, [today, attempt])

  // One region for every state, so the page keeps its place while it loads.
  return (
    <section className="mirror" aria-label="Your weekly mirror" aria-busy={state.kind === 'loading'}>
      {state.kind === 'loading' && <p className="m-loading">Putting your week together…</p>}
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
      {state.kind === 'ready' && <MirrorPage m={state.m} today={today} reload={reload} />}
    </section>
  )
}

function MirrorPage({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const name = archetype(m.traits)
  const line = tagline(m.traits)
  const lean = leanings(m.traits)
  const moved = m.traits.some((t) => t.history.filter((h) => h.score !== undefined).length >= 2)

  // Each section shows only when there is something real in it.
  const parts: { key: string; title: string; body: ReactNode; show: boolean; dark?: boolean }[] = [
    { key: 'glance', title: 'Your week at a glance', body: <Glance m={m} />, show: true },
    { key: 'apart', title: 'Where you stand apart', body: <Apart m={m} />, show: m.stats.judged > 0 || !!m.divisive },
    { key: 'traits', title: 'Your trait read', body: <Traits m={m} />, show: true },
    { key: 'moved', title: "How you've moved", body: <Moved m={m} />, show: moved },
    { key: 'all', title: 'All of you', body: <AllOfYou m={m} />, show: m.themes.length > 0 },
    { key: 'who', title: 'Who you were this week', body: <WhoYouWere m={m} />, show: lean.length > 0 },
    { key: 'strengths', title: 'Strengths you showed', body: <Strengths m={m} />, show: m.strengths.length > 0, dark: true },
    {
      key: 'steps',
      title: 'Your small steps',
      body: <Steps m={m} today={today} reload={reload} />,
      show: m.steps.length > 0 || m.stepRecord.started > 0,
    },
    {
      key: 'next',
      title: 'Next week',
      body: <NextWeek m={m} today={today} reload={reload} name={name} line={line} />,
      show: true,
    },
    { key: 'road', title: 'The road ahead', body: <RoadAhead />, show: true },
  ]
  const shown = parts.filter((p) => p.show)
  const cited = [
    ...new Set<SourceKey>([
      ...lean.slice(0, 3).map((l) => l.text.source),
      'soto2019',
      ...(moved ? (['roberts2006', 'hudson2015', 'gollwitzer2006'] as const) : []),
      'vazire2010',
    ]),
  ]
  const sections = shown.map((p, i) => (
    <section key={p.key} className={p.dark ? 'm-section m-dark' : 'm-section'} aria-labelledby={`m-${p.key}`}>
      <h3 id={`m-${p.key}`}>
        <span className="m-num">{String(i + 1).padStart(2, '0')}</span> {p.title}
      </h3>
      {p.body}
    </section>
  ))

  return (
    <>
      <header className="m-hero">
        <p className="m-eyebrow">
          Your weekly mirror · Week {m.week} · Editions #{m.editions[0]}–#{m.editions[1]}
        </p>
        <h2>
          {name ? (
            <>
              This week you were <span className="m-name">{name}.</span>
            </>
          ) : (
            'This week is just getting started.'
          )}
        </h2>
        {line && <p className="m-tagline">{line}</p>}
        <p className="m-summary">{summary(m)}</p>
      </header>

      {m.lowMood && (
        <div className="m-card m-support" role="note" aria-label="Support">
          <p>
            A few of your answers this week sounded heavy. If things feel hard, talking to someone you trust, or to a
            helpline, can help.
          </p>
          <a href="https://findahelpline.com" target="_blank" rel="noreferrer">
            Find a helpline in your country
          </a>
        </div>
      )}

      <OneLine m={m} />
      <StatTiles m={m} />
      {sections}
      <Footer cited={cited} reload={reload} />
    </>
  )
}

function OneLine({ m }: { m: MirrorData }) {
  const yours = m.rarest?.options.find((o) => o.yours)
  const lean = leanings(m.traits)[0]
  if (m.rarest && yours) {
    return (
      <figure className="m-card m-oneline" aria-label="One line from this week">
        <p className="m-eyebrow">One line from this week</p>
        <blockquote>“{yours.label}”</blockquote>
        <figcaption>
          Your answer to “{m.rarest.prompt}” Only {Math.round(yours.percent)}% of players said the same.
        </figcaption>
      </figure>
    )
  }
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
    ['Days active', `${s.daysActive} of 7`, daysNote],
    // A day can hold more than three answers (evening and pool questions), so no "of".
    [
      'Answers',
      `${s.answers}`,
      (s.daysSoFar >= 7 ? 'this week' : 'so far this week') + (s.private > 0 ? `, ${s.private} kept private` : ''),
    ],
    s.judged > 0
      ? ['Against the crowd', `${pct(s.minority, s.judged)}%`, `of ${s.judged} answers with 100+ votes`]
      : ['Against the crowd', '–', 'Shown once questions pass 100 votes'],
    s.rated > 0
      ? ['Learned something', `${s.learned} of ${s.rated}`, 'cards you rated']
      : ['Learned something', '–', 'Tap "I learned something" on a card'],
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

// Editions are numbered from launch; anything earlier has no number to show.
const edition = (n: number) => (n > 0 ? ` · Edition #${n}` : '')

const CROWD_WORDS: Record<Crowd, string> = {
  with: 'with the crowd',
  against: 'against the crowd',
  early: 'too early to compare',
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
      : `You came back on ${shown} of ${Math.min(7, m.stats.daysSoFar)} ${m.stats.daysSoFar >= 7 ? 'days' : 'days so far'}` +
        (best >= 2 ? `, with a run of ${best} in a row.` : '.') +
        ' Showing up is the whole trick: patterns only appear when there are answers to compare.'
  return (
    <>
      <ol className="m-days">
        {m.days.map((d, i) => {
          const future = i >= m.stats.daysSoFar
          const label = `${weekday(d.date, 'long')}: ${
            future
              ? 'still to come'
              : d.answers.length === 0
                ? 'missed'
                : d.answers.map((a) => `${themeName(a.theme)}, ${CROWD_WORDS[a.crowd]}`).join('; ')
          }`
          return (
            <li key={d.date} className={future ? 'm-day later' : 'm-day'} aria-label={label}>
              <span className="m-day-name" aria-hidden="true">
                {weekday(d.date)}
              </span>
              <span className="m-day-squares" aria-hidden="true">
                {d.answers.length === 0 ? (
                  <span className={future ? 'sq later' : 'sq missed'} />
                ) : (
                  d.answers.map((a, j) => <span key={j} className={`sq ${a.crowd}`} />)
                )}
              </span>
              <span className="m-day-ed" aria-hidden="true">
                #{d.edition}
              </span>
            </li>
          )
        })}
      </ol>
      <ul className="m-legend" aria-hidden="true">
        <li>
          <span className="sq with" /> With the crowd
        </li>
        <li>
          <span className="sq against" /> Against the crowd
        </li>
        <li>
          <span className="sq early" /> Under 100 votes
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

function Apart({ m }: { m: MirrorData }) {
  const rows = m.areas.filter((a) => a.judged > 0)
  return (
    <>
      {m.stats.judged > 0 ? (
        <ul className="m-bars" aria-label="Against the crowd, by area">
          {rows.map((a) => (
            <li key={a.area}>
              <Bar
                label={AREA_NAMES[a.area] ?? a.area}
                value={pct(a.minority, a.judged)}
                note={
                  a.lastJudged > 0
                    ? `${pct(a.minority, a.judged)}% · ${pct(a.lastMinority, a.lastJudged)}% last week`
                    : `${pct(a.minority, a.judged)}% of ${a.judged}`
                }
              />
            </li>
          ))}
          <li className="m-bar-total">
            <Bar label="All answers" value={pct(m.stats.minority, m.stats.judged)} note={`${pct(m.stats.minority, m.stats.judged)}%`} />
          </li>
        </ul>
      ) : null}
      {m.stats.judged > 0 ? (
        <p className="m-note">
          An answer counts as against the crowd when fewer players picked it than an even split would give: under a
          third, on a question with three answers.
        </p>
      ) : (
        <p className="m-text">
          Once a question passes 100 votes, I'll show where you go with the crowd and where you stand apart.
        </p>
      )}
      {m.rarest && (
        <Split
          title="Your most unusual answer"
          split={m.rarest}
          note="Going against the crowd isn't right or wrong. It's where you're most yourself."
        />
      )}
      {m.divisive && (
        <Split
          title="Most divisive this week, worldwide"
          split={m.divisive}
          note="The question players split on most evenly. Neither side is the normal one."
        />
      )}
    </>
  )
}

function Bar({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="m-bar">
      <span className="m-bar-label">{label}</span>
      <span className="m-bar-track" aria-hidden="true">
        <span className="m-bar-fill" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
      <span className="m-bar-note">{note}</span>
    </div>
  )
}

function Split({ title, split, note }: { title: string; split: AnswerSplit; note: string }) {
  return (
    <div className="m-card m-split" role="group" aria-label={title}>
      <p className="m-eyebrow">{title}</p>
      <p className="m-split-q">
        <span aria-hidden="true">{themeStyle(split.theme).icon} </span>
        {split.prompt}
      </p>
      <ul>
        {split.options.map((o) => (
          <li key={o.label} className={o.yours ? 'yours' : undefined}>
            <span className="m-split-label">
              {o.label}
              {o.yours && <span className="m-you"> · you</span>}
            </span>
            <span className="m-split-pct">{Math.round(o.percent)}%</span>
            <span className="m-split-track" aria-hidden="true">
              <span style={{ width: `${o.percent}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="m-note">
        {split.total} votes{edition(split.edition)}
        {split.final ? '' : ' · still counting'}. {note}
      </p>
    </div>
  )
}

function Traits({ m }: { m: MirrorData }) {
  const unread = Object.keys(TRAITS).filter((t) => !m.traits.some((r) => r.trait === t))
  const mid = m.ranked ? 'typical player' : 'middle'
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
                <p className="m-trait-meta">
                  {t.solid ? 'Solid read' : 'Early read'} · {t.answers} {t.answers === 1 ? 'answer' : 'answers'} ·{' '}
                  {text.science}
                  {t.ranked ? ' · ranked against players' : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}
      <p className="m-note">
        0 to 100, with 50 the {mid}
        {m.ranked
          ? '. Ranked reads compare you with everyone who answered on that trait in the same three weeks.'
          : '. Once enough people play, reads become a rank among players.'}
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
          <Cite k="soto2019" />
        </div>
      </div>
    </>
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
        <Cite k="roberts2006" />
        <Cite k="hudson2015" />
        <Cite k="gollwitzer2006" />
      </div>
    </>
  )
}

function AllOfYou({ m }: { m: MirrorData }) {
  const answered = new Map(m.themes.map((t) => [t.theme, t]))
  const deepest = m.themes.filter((t) => t.depth === 'deep').slice(0, 3)
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

function WhoYouWere({ m }: { m: MirrorData }) {
  return (
    <ul className="m-who">
      {leanings(m.traits)
        .slice(0, 3)
        .map((l) => {
          const src = SOURCES[l.text.source]
          return (
            <li key={l.read.trait} className="m-card m-who-card">
              <div className="m-who-top">
                <span className="m-badge">{STRENGTH_LABEL[src.strength]}</span>
                <span className="m-who-trait">{l.text.name}</span>
              </div>
              <p className="m-who-headline">{l.side.headline}</p>
              <p>{l.side.prediction}</p>
              {l.read.evidence.length > 0 && (
                <p className="m-who-evidence">
                  You said: {l.read.evidence.map((e) => `“${e}”`).join(', ')}
                </p>
              )}
              <p className="m-who-research">
                {l.text.research} <Cite k={l.text.source} inline />
              </p>
              <p className="m-who-kind">
                {l.read.solid
                  ? 'Prediction: a solid read, from enough answers to be worth testing in real life.'
                  : `Early read: from ${l.read.answers} answers. Treat it as a hunch to check.`}
              </p>
            </li>
          )
        })}
    </ul>
  )
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1))

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const STRENGTH_WORDS: Record<MirrorData['strengths'][number]['kind'], (you: number, med: string) => string> = {
  days: (you, med) => `You came back on ${plural(you, 'day', 'days')}. The typical player came back on ${med}.`,
  deepest: (you, med) =>
    `You chose the most revealing answer ${plural(you, 'time', 'times')}. The typical player did ${med}.`,
  minority: (you, med) => `You went against the crowd ${plural(you, 'time', 'times')}. The typical player did ${med}.`,
  learned: (you, med) => `You learned something from ${plural(you, 'card', 'cards')}. The typical player did from ${med}.`,
  steps: (you, med) => `You tried ${plural(you, 'small step', 'small steps')}. The typical player tried ${med}.`,
}

function Strengths({ m }: { m: MirrorData }) {
  return (
    <>
      <ul className="m-strengths">
        {m.strengths.map((s) => (
          <li key={s.kind}>
            <span className="m-strength-n">{s.you}</span>
            <span>{STRENGTH_WORDS[s.kind](s.you, fmt(s.median))}</span>
          </li>
        ))}
      </ul>
      <p className="m-note">Compared with {m.strengths[0].players} players this week.</p>
    </>
  )
}

const STATUS_WORDS: Record<StepStatus, string> = {
  started: 'In progress',
  helped: 'Helped',
  no_change: 'No change yet',
  not_tried: "Didn't try",
}

// Open steps pile up when they're never marked, so the list starts short.
const STEPS_SHOWN = 4

function Steps({ m, today, reload }: { m: MirrorData; today: string; reload: () => void }) {
  const [error, setError] = useState(false)
  const [all, setAll] = useState(false)
  const shown = all ? m.steps : m.steps.slice(0, STEPS_SHOWN)
  async function mark(questionId: string, optionId: string, status: StepStatus) {
    setError(false)
    try {
      await saveStep(questionId, optionId, status, today)
      setMoveStatus(questionId, status)
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
                <button type="button" className="m-chip" onClick={() => mark(s.questionId, s.optionId, 'helped')}>
                  It helped
                </button>
                <button type="button" className="m-chip" onClick={() => mark(s.questionId, s.optionId, 'no_change')}>
                  No change yet
                </button>
                <button type="button" className="m-chip" onClick={() => mark(s.questionId, s.optionId, 'not_tried')}>
                  Didn't get to it
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
    </>
  )
}

function NextWeek({
  m,
  today,
  reload,
  name,
  line,
}: {
  m: MirrorData
  today: string
  reload: () => void
  name: string | null
  line: string | null
}) {
  const [error, setError] = useState(false)
  const [shared, setShared] = useState(false)
  const early = m.traits.filter((t) => !t.solid && TRAITS[t.trait]).slice(0, 2)
  async function start(questionId: string, optionId: string) {
    setError(false)
    try {
      await saveStep(questionId, optionId, 'started', today)
      reload()
    } catch {
      setError(true)
    }
  }
  async function shareCard() {
    const text = `This week I was ${name}. ${line ?? ''} Find yours on The Persona Index: ${window.location.origin}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setShared(true)
    } catch {
      // the share sheet was closed
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
              <button type="button" className="m-button" onClick={() => start(s.questionId, s.optionId)}>
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
              {early.map((t) => `${TRAITS[t.trait].name} needs ${plural(12 - t.answers, 'more answer', 'more answers')}`).join('; ')}{' '}
              {early.length === 1
                ? 'to become a solid read. Keep answering and it will firm up.'
                : 'to become solid reads. Keep answering and they will firm up.'}
            </p>
          </div>
        )}
        <div className="m-card">
          <p className="m-eyebrow">See yourself from outside</p>
          <p>
            People who know you well often see things you can't, especially how you come across. Show someone your card
            and ask: does this sound like me?
          </p>
          <Cite k="vazire2010" />
          {name && (
            <button type="button" className="m-button" onClick={shareCard}>
              Share my identity card
            </button>
          )}
          {shared && <p className="m-note">Copied. Paste it anywhere.</p>}
        </div>
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

function Cite({ k, inline = false }: { k: SourceKey; inline?: boolean }) {
  const s: { title: string; url?: string; strength: 'strong' | 'moderate' } = SOURCES[k]
  const body = s.url ? (
    <a href={s.url} target="_blank" rel="noreferrer">
      {s.title}
    </a>
  ) : (
    s.title
  )
  return inline ? (
    <span className="m-cite">
      {STRENGTH_LABEL[s.strength]} · {body}
    </span>
  ) : (
    <p className="m-cite">
      {STRENGTH_LABEL[s.strength]} · {body}
    </p>
  )
}

function Footer({ cited, reload }: { cited: SourceKey[]; reload: () => void }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'deleting' | 'done' | 'failed'>('idle')
  async function deleteAll() {
    setStep('deleting')
    try {
      await forgetMirror()
      forgetLocal()
      setStep('done')
      reload()
    } catch {
      setStep('failed')
    }
  }
  return (
    <footer className="m-footer">
      <p className="m-strong">For self-reflection, not a diagnosis.</p>
      <div className="m-privacy" role="note" aria-label="What leaves my phone">
        <p className="m-eyebrow">What leaves my phone</p>
        <p>
          Your answers are kept on our server under an anonymous key made from this phone's code: no name, no email, no
          account. That's how this mirror is built. Intimate answers are kept only as "a private answer", never what you
          chose. Evening answers stay on this phone. Everything kept is deleted after five weeks, or right now with the
          button below.
        </p>
      </div>
      {step === 'idle' && (
        <button type="button" className="m-link" onClick={() => setStep('confirm')}>
          Delete everything
        </button>
      )}
      {step === 'confirm' && (
        <div className="m-confirm">
          <p>This deletes your answers, steps and points, here and on our server.</p>
          <button type="button" className="m-button danger" onClick={deleteAll}>
            Yes, delete it all
          </button>
          <button type="button" className="m-link" onClick={() => setStep('idle')}>
            Keep it
          </button>
        </div>
      )}
      {step === 'deleting' && <p>Deleting…</p>}
      {step === 'done' && <p role="status">Everything is deleted, here and on our server.</p>}
      {step === 'failed' && (
        <p role="alert">
          I couldn't reach the server, so nothing was deleted.{' '}
          <button type="button" className="m-link" onClick={deleteAll}>
            Try again
          </button>
        </p>
      )}
      {cited.length > 0 && (
        <div className="m-sources">
          <p className="m-eyebrow" id="m-sources">
            Sources
          </p>
          <ul aria-labelledby="m-sources">
            {cited.map((k) => (
              <li key={k}>
                <Cite k={k} inline />
              </li>
            ))}
          </ul>
        </div>
      )}
    </footer>
  )
}
