import { useEffect, useMemo, useState } from 'react'
import type { Question, Verdict } from './api'
import { recalledVerdict } from './api'
import { evidenceLabel, forYou, getNotAlone, notAloneFor, type ForYouCard, type NotAloneQuestion } from './insights'
import { NEED_NAMES } from './needs'
import { intentions, keepIntention, keptCards } from './notebook'
import { loadHistory } from './profile'
import { count } from './pulse'
import { HeavyCard } from './QuestionCard'
import { rateAnswer } from './rating'
import { NOT_ME_REPLY, VERDICT_REPLIES } from './words'

// Insights (Edwin, 2026-10-25): its own page, with the Mirrors one tap away.
// For You is the person's own answers; You're not alone is the server's real
// counts, shown only to someone who turned the Human Pulse on; What Helped
// and Your Growth fill in later, and say so rather than show made-up rows.
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
}

const WEEK = 7
const MONTH = 30
const FOR_YOU_MAX = 6

export function Insights({ today, questions, pulse, onOpenMirror, onOpenKept, onOpenReflect, onOpenSettings }: Props) {
  const [days, setDays] = useState(WEEK)
  const [version, setVersion] = useState(0)
  const cards = useMemo(() => {
    void version // a tap under a card reads the history again
    return forYou(loadHistory(), today, days, questions)
  }, [today, days, questions, version])
  const shown = days === WEEK ? cards.slice(0, FOR_YOU_MAX) : cards

  return (
    <section className="insights" aria-labelledby="insights-title">
      <header className="page-head">
        <h2 id="insights-title" className="display">
          Your Insights
        </h2>
        <p>Understand yourself. Discover you’re not alone. Find what helps.</p>
      </header>

      <div className="insights-controls">
        <button type="button" className="chip" aria-pressed={days === MONTH} onClick={() => setDays(days === MONTH ? WEEK : MONTH)}>
          Last 30 days
        </button>
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

        <NotAlone today={today} cards={cards} pulse={pulse} onOpenSettings={onOpenSettings} />

        <section className="insights-helped" aria-labelledby="helped-title">
          <h3 id="helped-title" className="section-title">
            What Helped
          </h3>
          <p className="muted empty-note">This fills in as you and others report back on the small steps you try.</p>
        </section>

        <section className="insights-growth" aria-labelledby="growth-title">
          <h3 id="growth-title" className="section-title">
            Your Growth
          </h3>
          <p className="muted empty-note">This fills in over the weeks, from your own earlier and recent answers.</p>
        </section>

        <Saved onOpenKept={onOpenKept} />
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
      <p className="label">{evidenceLabel(card.evidence, card.date, today)}</p>
      <p id={titleId} className="insight-asked">
        {card.prompt} <span className="muted">You chose “{card.label}”.</span>
      </p>
      {card.heavy ? (
        <HeavyCard />
      ) : (
        <>
          {card.reveal && <p className="insight-reading">{card.reveal}</p>}
          {card.need && (
            <div className="insight-needs">
              <p className="label">What may matter here</p>
              <ul className="chips" aria-label="What may matter here">
                <li className="chip is-static">{NEED_NAMES[card.need]}</li>
              </ul>
            </div>
          )}
          {card.otherSide && (
            <p className="insight-other">
              <span className="label">The Other Side</span> {card.otherSide}
            </p>
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
      <p className="label">Something you could try</p>
      <p>{card.step}</p>
      {saved ? (
        <p className="muted small" role="status">
          Saved as an intention in Reflect.
        </p>
      ) : (
        <button type="button" className="chip" onClick={save}>
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
        <button type="button" className="chip" onClick={() => tap('me')}>
          That's me
        </button>
        <button type="button" className="chip" onClick={() => tap('partly')}>
          Partly
        </button>
        <button type="button" className="chip" onClick={() => tap('not_me')}>
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
      <h3 id="not-alone-title" className="section-title">
        You’re Not Alone
      </h3>
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

function Saved({ onOpenKept }: { onOpenKept: () => void }) {
  const kept = keptCards().filter((c) => !c.private)
  return (
    <section className="insights-saved" aria-labelledby="saved-title">
      <h3 id="saved-title" className="section-title">
        Saved insights
      </h3>
      {kept.length === 0 ? (
        <p className="muted small">Cards you keep show here.</p>
      ) : (
        <ul className="saved-list">
          {kept.slice(0, SAVED_SHOWN).map((c) => (
            <li key={c.questionId}>{c.headline}</li>
          ))}
        </ul>
      )}
      <button type="button" className="text-button" onClick={onOpenKept}>
        Open Saved
      </button>
    </section>
  )
}
