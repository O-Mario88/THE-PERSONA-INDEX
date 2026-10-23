import { useState } from 'react'
import { sendPlanChecks } from './api'
import {
  changePlan,
  checkPlan,
  goodThings,
  keepGoodThings,
  keepSentence,
  makePlan,
  nameFor,
  plan as loadPlan,
  rename,
  reviseCard,
  sentence,
  type KeptCard,
  type Plan,
  type Revisit,
} from './notebook'
import { longDate } from './mirrorText'
import { practiceFor, type Practice } from './practices'
import { daysBetween } from './storage'
import { sideOf, TRAITS } from './traits'
import { PLAN_REPLIES, REVISIT_REPLIES } from './words'

// The small pieces that let a person keep and say things themselves (the
// review of 2026-10-15, "Yours to keep"). Everything here is written on this
// phone only (notebook.ts); a plan's check says only "did it" or "not yet" to
// the server, never the plan.

const MAX_LINE = 140
const MAX_SENTENCE = 200
const MAX_PLAN = 80

// Three good things from today, before bed. Private: no ads, nothing sent.
export function GoodThings({ date, label = 'Before bed: three good things from today' }: { date: string; label?: string }) {
  const kept = goodThings(date)
  const [lines, setLines] = useState<string[]>(() => kept?.lines.concat(['', '', '']).slice(0, 3) ?? ['', '', ''])
  const [done, setDone] = useState(!!kept)
  const [editing, setEditing] = useState(false)
  const id = `good-${date}`
  if (done && !editing) {
    const now = goodThings(date)
    return (
      <div className="good" role="group" aria-label="Three good things">
        <p className="eyebrow">Three good things · {longDate(date)}</p>
        <ul className="nb-good">{now?.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <p className="muted">
          Kept in your notebook.{' '}
          <button type="button" className="text-button inline" onClick={() => setEditing(true)}>
            Change them
          </button>
        </p>
      </div>
    )
  }
  return (
    <form
      className="good"
      aria-labelledby={id}
      onSubmit={(e) => {
        e.preventDefault()
        if (!lines.some((l) => l.trim())) return
        keepGoodThings(date, lines)
        setDone(true)
        setEditing(false)
      }}
    >
      <p id={id} className="eyebrow">
        {label}
      </p>
      <p className="muted">Small ones count: a good cup of tea, a kind word, a job done. Add why, if you like.</p>
      {lines.map((l, i) => (
        <input
          key={i}
          className="own-line"
          aria-label={`Good thing ${i + 1}`}
          value={l}
          maxLength={MAX_LINE}
          onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      <p className="own-meta">
        <span>
          <span aria-hidden="true">🔒 </span>Kept in your notebook, on this phone only.
        </span>
      </p>
      <button type="submit" className="pill-button" disabled={!lines.some((l) => l.trim())}>
        Keep them
      </button>
    </form>
  )
}

// The Sunday sentence: "This week I learned that I...", with a starter the
// person edits. One a week, kept under its Monday.
export function SundaySentence({ week, starter }: { week: string; starter: string }) {
  const kept = sentence(week)
  const [text, setText] = useState(kept?.text ?? starter)
  const [done, setDone] = useState(!!kept)
  if (done) {
    return (
      <div className="m-card m-sentence" role="group" aria-label="Your sentence for the week">
        <p className="m-eyebrow">In your words</p>
        <blockquote>“{sentence(week)?.text ?? text}”</blockquote>
        <p className="m-note">
          Kept in your notebook. Your month shows four of these, and your year all of them.{' '}
          <button type="button" className="m-link" onClick={() => setDone(false)}>
            Change it
          </button>
        </p>
      </div>
    )
  }
  return (
    <form
      className="m-card m-sentence"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || text.trim() === starter.trim()) return
        keepSentence(week, text)
        setDone(true)
      }}
    >
      <label className="m-eyebrow" htmlFor={`sentence-${week}`}>
        One line for your week
      </label>
      <textarea
        id={`sentence-${week}`}
        className="m-box"
        rows={3}
        value={text}
        maxLength={MAX_SENTENCE}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="m-note">Finish it in your own words. It stays on this phone.</p>
      <button type="submit" className="m-button" disabled={!text.trim() || text.trim() === starter.trim()}>
        Keep my line
      </button>
    </form>
  )
}

// Once a month, Sunday brings back one kept card: "Still true?"
export function RevisitCard({ card, today }: { card: KeptCard; today: string }) {
  const [answer, setAnswer] = useState<Revisit['verdict'] | null>(null)
  const ago = daysBetween(card.date, today)
  function tap(verdict: Revisit['verdict']) {
    reviseCard(card.questionId, { date: today, verdict })
    setAnswer(verdict)
  }
  return (
    <div className="m-card m-revisit" role="group" aria-label="From your notebook">
      <p className="m-eyebrow">From your notebook</p>
      <p className="m-text">
        {ago <= 40 ? 'A month ago' : `On ${longDate(card.date)}`} this felt true. Still true?
      </p>
      <blockquote>“{card.headline}”</blockquote>
      <p className="m-note">{card.prompt}</p>
      {answer ? (
        <p className="m-note">{REVISIT_REPLIES[answer]}</p>
      ) : (
        <div className="m-verdict">
          <button type="button" className="m-chip" onClick={() => tap('still')}>
            Still me
          </button>
          <button type="button" className="m-chip" onClick={() => tap('changing')}>
            Changing
          </button>
          <button type="button" className="m-chip" onClick={() => tap('not_anymore')}>
            Not anymore
          </button>
        </div>
      )}
    </div>
  )
}

// The identity card from Edwin's mockups ("The Steady Noticer"): a name for
// the week, offered as a suggestion the person can rename.
export function IdentityCard({ week, suggested }: { week: string; suggested: string }) {
  const [name, setName] = useState(() => nameFor(week)?.name ?? suggested)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const mine = name !== suggested
  return (
    <figure className="m-card m-identity" aria-label="Your name for the week">
      <p className="m-eyebrow">{mine ? 'Your name for this week' : 'A name for this week'}</p>
      {editing ? (
        <form
          className="m-rename"
          onSubmit={(e) => {
            e.preventDefault()
            const next = draft.trim() || suggested
            rename(week, suggested, next)
            setName(next)
            setEditing(false)
          }}
        >
          <label className="m-note" htmlFor={`name-${week}`}>
            Call it what fits you
          </label>
          <input id={`name-${week}`} className="m-input" value={draft} maxLength={40} onChange={(e) => setDraft(e.target.value)} />
          <div className="m-verdict">
            <button type="submit" className="m-button">
              Keep this name
            </button>
            <button type="button" className="m-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="m-identity-name">{name}</p>
          <figcaption className="m-note">
            {mine ? `I suggested ${suggested}.` : 'My suggestion, from your answers. You know yourself best.'}{' '}
            <button
              type="button"
              className="m-link"
              onClick={() => {
                setDraft(name)
                setEditing(true)
              }}
            >
              Rename it
            </button>
          </figcaption>
        </>
      )}
    </figure>
  )
}

// "Want to work on this?" under an honest part: one plan, "When ___, I will
// ___", and the short practice that fits, if there is one.
export function PlanOffer({
  trait,
  high,
  date,
  onPractice,
  dark = false,
}: {
  trait: string
  high: boolean
  date: string
  onPractice?: (p: Practice) => void
  dark?: boolean
}) {
  const side = TRAITS[trait] ? sideOf(TRAITS[trait], high) : null
  const [open, setOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [will, setWill] = useState('')
  const [made, setMade] = useState<Plan | null>(null)
  if (!side) return null
  const practice = onPractice ? practiceFor(trait, high) : null
  const cls = dark ? 'plan-offer' : 'plan-offer m-plan'
  if (made) {
    return (
      <div className={cls} role="status">
        <p>
          <strong>Your plan:</strong> When {made.when}, I will {made.will}.
        </p>
        <p className="muted">Kept in your notebook. Next time you sit down, I'll ask how it went.</p>
      </div>
    )
  }
  if (!open) {
    return (
      <div className={cls}>
        <button type="button" className={dark ? 'chip' : 'm-chip'} onClick={() => setOpen(true)}>
          Want to work on this?
        </button>
        {practice && (
          <button type="button" className={dark ? 'chip' : 'm-chip'} onClick={() => onPractice?.(practice)}>
            {practice.name} · {practice.minutes} min
          </button>
        )}
      </div>
    )
  }
  const ready = when.trim() && will.trim()
  return (
    <form
      className={cls}
      aria-label="Make a plan"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ready) return
        setMade(makePlan({ made: date, trait, high, when: when.trim(), will: will.trim() }))
      }}
    >
      <p className="eyebrow">One plan, tied to a moment</p>
      <label className="plan-field">
        <span>When</span>
        <input className="own-line" value={when} maxLength={MAX_PLAN} placeholder={side.plan.when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="plan-field">
        <span>I will</span>
        <input className="own-line" value={will} maxLength={MAX_PLAN} placeholder={side.plan.will} onChange={(e) => setWill(e.target.value)} />
      </label>
      <p className="own-meta">
        <span>
          <span aria-hidden="true">🔒 </span>Your plan stays on this phone. I only ever send whether you did it.
        </span>
      </p>
      <div className="own-buttons">
        <button type="submit" className="pill-button" disabled={!ready}>
          Keep my plan
        </button>
        <button type="button" className="text-button" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </form>
  )
}

// The next sitting asks about a plan: "Did it, not yet, or changed it?"
export function PlanCheckCard({ plan: start, date }: { plan: Plan; date: string }) {
  const [p, setP] = useState(start)
  const [reply, setReply] = useState<keyof typeof PLAN_REPLIES | 'changed' | null>(null)
  const [editing, setEditing] = useState(false)
  const [when, setWhen] = useState(start.when)
  const [will, setWill] = useState(start.will)

  function tap(status: 'did' | 'not_yet') {
    checkPlan(p.id, status, date)
    setReply(status)
    // Kept on the phone first; one that does not get through is sent again
    // when the app next opens.
    sendPlanChecks()
  }

  return (
    <div className="moves plan-check" role="group" aria-label="Your plan">
      <p className="eyebrow">Your plan</p>
      <p className="move-step">
        When {p.when}, I will {p.will}.
      </p>
      {reply === 'changed' && <p className="move-reply">Changed. I'll ask about the new one next time.</p>}
      {reply && reply !== 'changed' && <p className="move-reply">{PLAN_REPLIES[reply]}</p>}
      {!reply && !editing && (
        <>
          <p className="muted">Did it, not yet, or changed it?</p>
          <div className="move-buttons">
            <button type="button" className="option" onClick={() => tap('did')}>
              Did it
            </button>
            <button type="button" className="option" onClick={() => tap('not_yet')}>
              Not yet
            </button>
            <button type="button" className="option" onClick={() => setEditing(true)}>
              Changed it
            </button>
          </div>
        </>
      )}
      {editing && (
        <form
          className="plan-offer"
          onSubmit={(e) => {
            e.preventDefault()
            if (!when.trim() || !will.trim()) return
            changePlan(p.id, when.trim(), will.trim(), date)
            setP(loadPlan(p.id) ?? p)
            setEditing(false)
            setReply('changed')
          }}
        >
          <label className="plan-field">
            <span>When</span>
            <input className="own-line" value={when} maxLength={MAX_PLAN} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="plan-field">
            <span>I will</span>
            <input className="own-line" value={will} maxLength={MAX_PLAN} onChange={(e) => setWill(e.target.value)} />
          </label>
          <div className="own-buttons">
            <button type="submit" className="pill-button" disabled={!when.trim() || !will.trim()}>
              Keep the new plan
            </button>
            <button type="button" className="text-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
