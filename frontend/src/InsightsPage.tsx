import { useEffect, useMemo, useState } from 'react'
import type { Question, Verdict } from './api'
import { recalledVerdict } from './api'
import { evidenceLabel, forYou, getNotAlone, notAloneFor, type ForYouCard, type NotAloneQuestion } from './insights'
import { NEED_NAMES } from './needs'
import { intentions, keepIntention, keptCards } from './notebook'
import { loadHistory } from './profile'
import { count } from './pulse'
import { ConnectNudge } from './ConnectNudge'
import { GrowthSection } from './GrowthSection'
import { growthPairs } from './growth'
import { reflectSettings } from './journal'
import { reflections } from './notebook'
import { HeavyCard } from './QuestionCard'
import { rateAnswer } from './rating'
import { splitReveal } from './reveal'
import { NOT_ME_REPLY, VERDICT_REPLIES } from './words'
import { Disc } from './ui/Disc'
import { Icon } from './ui/icons'

// Insights (Edwin, 2026-10-25): its own page, with the Mirrors one tap away.
// For You is the person's own answers; You're not alone is the server's real
// counts, shown only to someone who turned the Human Pulse on; What Helped
// fills in later; Your Growth sets the person's own earlier and recent
// answers side by side (GrowthSection.tsx). Neither shows made-up rows.
// On a wide screen the reading has the centre and the counts and saved
// cards sit quietly beside it.

type Props = {
  today: string
  questions: Question[]
  pulse: boolean
  onOpenMirror: () => void
  onOpenKept: () => void
  onOpenReflect: () => void
  onOpenSettings: () => void
  onOpenSupport: () => void
}

// The pill row jumps to each section on the page. A section shows only
// once there is something in it (the day-one review of 2026-10-26: a new
// person met more "not yet" than anything else). What Helped waits for its
// own reports (the follow-up dataset) before it appears at all.
const JUMPS: [string, string][] = [
  ['for-you-title', 'For You'],
  ['not-alone-title', 'You’re Not Alone'],
  ['growth-title', 'Your Growth'],
  ['saved-title', 'Saved Insights'],
]

const WEEK = 7
const MONTH = 30
const FOR_YOU_MAX = 6

export function Insights({ today, questions, pulse, onOpenMirror, onOpenKept, onOpenReflect, onOpenSettings, onOpenSupport }: Props) {
  const [days, setDays] = useState(WEEK)
  const [version, setVersion] = useState(0)
  const cards = useMemo(() => {
    void version // a tap under a card reads the history again
    return forYou(loadHistory(), today, days, questions)
  }, [today, days, questions, version])
  const shown = days === WEEK ? cards.slice(0, FOR_YOU_MAX) : cards
  const growth = useMemo(
    () => growthPairs(loadHistory(), reflections(), today, undefined, { reflections: reflectSettings().reflectionsInGrowth }),
    [today],
  )
  const saved = keptCards().filter((c) => !c.private)
  const counted = cards.some((c) => !c.heavy && !c.regional)
  const present: Record<string, boolean> = {
    'for-you-title': true,
    'not-alone-title': counted,
    'growth-title': growth.length > 0,
    'saved-title': saved.length > 0,
  }
  const jumps = JUMPS.filter(([id]) => present[id])
  const answeredAny = loadHistory().answers.length > 0

  return (
    <section className="insights" aria-labelledby="insights-title">
      <header className="page-head">
        <h2 id="insights-title" className="display">
          Insights
        </h2>
        <p>Understand yourself. Find what helps.</p>
      </header>

      <div className="insights-controls">
        {jumps.length > 2 && (
        <nav className="insights-tabs" aria-label="Insights sections">
          {jumps.map(([id, name], i) => (
            <button key={id} type="button" className={i === 0 ? 'insights-tab is-first' : 'insights-tab'} onClick={() => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}>
              {name}
            </button>
          ))}
        </nav>
        )}
        {answeredAny && (
        <button type="button" className="chip range" aria-pressed={days === MONTH} onClick={() => setDays(days === MONTH ? WEEK : MONTH)}>
          <Icon name="calendar" size={16} /> Last 30 days
        </button>
        )}
        <button type="button" className="text-button" onClick={onOpenMirror}>
          Your Mirrors →
        </button>
      </div>

      <div className="insights-layout">
        <section className="insights-for-you" aria-labelledby="for-you-title">
          <h3 id="for-you-title" className="section-title">
            For You
          </h3>
          {shown.length === 0 ? (
            <p className="muted empty-note">
              {days === WEEK
                ? 'Answer a few questions and what they may say about you shows here, card by card.'
                : 'Nothing from the last 30 days yet. Your cards show here as you answer.'}
            </p>
          ) : (
            shown.map((c) => (
              <InsightCard
                key={c.questionId}
                card={c}
                today={today}
                onRated={() => setVersion((v) => v + 1)}
                onOpenMirror={onOpenMirror}
                onOpenKept={onOpenKept}
                onOpenReflect={onOpenReflect}
              />
            ))
          )}
        </section>

        {counted && <NotAlone today={today} cards={cards} pulse={pulse} onOpenSettings={onOpenSettings} />}

        <ConnectNudge today={today} onOpenSupport={onOpenSupport} />
        {growth.length > 0 && <GrowthSection pairs={growth} />}

        {saved.length > 0 && <Saved kept={saved} onOpenKept={onOpenKept} />}
      </div>
    </section>
  )
}

function InsightCard({
  card,
  today,
  onRated,
  onOpenMirror,
  onOpenKept,
  onOpenReflect,
}: {
  card: ForYouCard
  today: string
  onRated: () => void
  onOpenMirror: () => void
  onOpenKept: () => void
  onOpenReflect: () => void
}) {
  const titleId = `insight-${card.questionId}`
  return (
    <article className={`insight-card${card.heavy ? ' is-heavy' : ''}`} aria-labelledby={titleId}>
      <div className="insight-head">
        <Disc icon="leaf" tone="green" size={44} />
        <div>
          <p className="insight-kind">{evidenceLabel(card.evidence, card.date, today)}</p>
          <p id={titleId} className="insight-asked">
            {card.prompt} <span className="muted">You chose “{card.label}”.</span>
          </p>
        </div>
      </div>
      {card.heavy ? (
        <HeavyCard />
      ) : (
        <>
          {card.reveal && <Reading reveal={card.reveal} />}
          {(card.need || card.otherSide) && (
            <div className="insight-sides">
              {card.need && (
                <div className="insight-needs">
                  <p className="insight-side-title">
                    <Disc icon="leaf" tone="green" size={36} /> What may matter here
                  </p>
                  <ul className="tags" aria-label="What may matter here">
                    <li className="tag">{NEED_NAMES[card.need]}</li>
                  </ul>
                </div>
              )}
              {card.otherSide && (
                <div className="insight-other">
                  <p className="insight-side-title">
                    <Disc icon="pin" tone="rose" size={36} /> The Other Side
                  </p>{' '}
                  <p className="small">{card.otherSide}</p>
                </div>
              )}
            </div>
          )}
          {card.step && <TryThis card={card} today={today} />}
          <RateCard card={card} onRated={onRated} />
          <div className="insight-links">
            <button type="button" className="text-button" onClick={onOpenReflect}>
              Reflect on this
            </button>
            <button type="button" className="text-button" onClick={onOpenKept}>
              Saved
            </button>
            <button type="button" className="text-button" onClick={onOpenMirror}>
              Weekly Mirror
            </button>
          </div>
          <p className="insight-note">For self-reflection, not a diagnosis.</p>
        </>
      )}
    </article>
  )
}

// The reading: its headline in bold, the rest quieter, as on the day's card.
function Reading({ reveal }: { reveal: string }) {
  const { headline, body } = splitReveal(reveal)
  return (
    <>
      <p className="insight-reading">{headline}</p>
      {body && <p className="insight-body-text">{body}</p>}
    </>
  )
}

// TryThis offers the card's small step, and keeps it as an intention in
// Reflect, where its gentle check-in comes a week later.
function TryThis({ card, today }: { card: ForYouCard; today: string }) {
  const id = `insight-${card.questionId}`
  const [saved, setSaved] = useState(() => intentions().some((i) => i.id === id))
  function save() {
    keepIntention({ id, date: today, text: card.step ?? '', from: card.questionId })
    setSaved(true)
  }
  return (
    <div className="insight-try">
      <Disc icon="bulb" tone="amber" size={40} />
      <div className="insight-try-text">
        <p className="insight-try-title">Something you could try</p>
        <p className="small">{card.step}</p>
      </div>
      {saved ? (
        <p className="muted small" role="status">
          Saved as an intention in Reflect.
        </p>
      ) : (
        <button type="button" className="btn small" onClick={save}>
          Save as an intention
        </button>
      )}
    </div>
  )
}

function RateCard({ card, onRated }: { card: ForYouCard; onRated: () => void }) {
  const [verdict, setVerdict] = useState<Verdict | 'rated' | null>(() => card.verdict ?? recalledVerdict(card.questionId))
  function tap(v: Verdict) {
    rateAnswer({ id: card.questionId, ...(card.regional ? { local: true as const } : {}) }, card.optionId, v)
    setVerdict(v)
    // A "Not me" card leaves For You after a moment, so the reply can be read.
    if (v === 'not_me') window.setTimeout(onRated, 1500)
  }
  if (verdict) return <p className="muted rate-thanks">{verdict === 'not_me' ? NOT_ME_REPLY : VERDICT_REPLIES[verdict]}</p>
  return (
    <div className="rate" role="group" aria-label="Does this sound like you?">
      <p className="rate-ask">Does this sound like you?</p>
      <div className="rate-buttons">
        <button type="button" className="rate-button" onClick={() => tap('me')}>
          <Icon name="check" size={16} /> That's me
        </button>
        <button type="button" className="rate-button" onClick={() => tap('partly')}>
          Partly
        </button>
        <button type="button" className="rate-button" onClick={() => tap('not_me')}>
          Not me
        </button>
      </div>
    </div>
  )
}

// NotAlone: how many people chose the same, from the server's real counts.
// Only for someone who turned the Human Pulse on; never for an intimate,
// regional or heavy answer; below the minimum it says the picture is still
// forming, and it never estimates.
function NotAlone({ today, cards, pulse, onOpenSettings }: { today: string; cards: ForYouCard[]; pulse: boolean; onOpenSettings: () => void }) {
  const [counts, setCounts] = useState<NotAloneQuestion[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!pulse) return
    let live = true
    getNotAlone(today).then((c) => {
      if (!live) return
      setCounts(c)
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [today, pulse])
  const counted = cards.filter((c) => !c.heavy && !c.regional)
  return (
    <section className="insights-not-alone" aria-labelledby="not-alone-title">
      <div className="insight-side-head">
        <Disc icon="people" tone="blue" size={40} />
        <h3 id="not-alone-title" className="section-title">
          You’re Not Alone
        </h3>
      </div>
      {!pulse ? (
        <>
          <p className="muted small">With the Human Pulse on, this shows the count of people who chose the same response as you. Off unless you turn it on.</p>
          <button type="button" className="text-button" onClick={onOpenSettings}>
            Human Pulse in Settings
          </button>
        </>
      ) : counted.length === 0 ? (
        <p className="muted small">Answer a question and how many chose the same shows here.</p>
      ) : !loaded ? (
        <p className="muted small">Getting the counts…</p>
      ) : !counts ? (
        <p className="muted small">The counts can’t be reached just now.</p>
      ) : (
        <ul className="not-alone-list">
          {counted.map((c) => (
            <li key={c.questionId}>
              <p className="small">{c.prompt}</p>
              <p className="not-alone-line">{lineFor(notAloneFor(counts, c.questionId, c.optionId))}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function lineFor(line: ReturnType<typeof notAloneFor>): string {
  if (!line || line.kind === 'forming') return 'The picture is still forming.'
  if (line.kind === 'few') return 'A few people chose the same response.'
  return `${count(line.same)} of ${count(line.total)} people chose the same response.`
}

const SAVED_SHOWN = 3

function Saved({ kept, onOpenKept }: { kept: ReturnType<typeof keptCards>; onOpenKept: () => void }) {
  return (
    <section className="insights-saved" aria-labelledby="saved-title">
      <div className="insight-side-head">
        <Disc icon="bookmark" tone="purple" size={40} />
        <h3 id="saved-title" className="section-title">
          Saved insights
        </h3>
      </div>
      <ul className="saved-list">
        {kept.slice(0, SAVED_SHOWN).map((c) => (
          <li key={c.questionId}>{c.headline}</li>
        ))}
      </ul>
      <button type="button" className="text-button" onClick={onOpenKept}>
        Open Saved
      </button>
    </section>
  )
}
