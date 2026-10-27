import { useId, useState, type ReactNode } from 'react'
import { answerStillImportant, chooseDirection, directionChoice, stillImportant, undoDirection, type StillImportant } from './mirrorChoices'
import {
  HELPED_NOTE,
  HELPED_PILL,
  whenSaid,
  type Direction,
  type EvidenceItem,
  type HelpedItem,
  type NotAlonePick,
  type OthersPick,
  type Span,
  type Story,
} from './mirrorStory'
import { reflectSettings, setReflectSettings } from './journal'
import { Disc, type Tone } from './ui/Disc'
import { Icon, type IconName } from './ui/icons'

// The parts every Mirror shares (Edwin's Mirrors, 2026-10-26): a story
// first, sections on the page with a soft disc and a title, "Why am I
// seeing this?" under every finding, and one gentle direction at the end.

export function StoryHero({ eyebrow, story, aside, meta, span }: { eyebrow: string; story: Story; aside?: ReactNode; meta?: string; span: Span }) {
  return (
    <header className="ms-hero">
      <div className="ms-hero-art" aria-hidden="true">
        <HeroArt />
      </div>
      <div className="ms-hero-body">
        <p className="ms-eyebrow">{eyebrow}</p>
        <h2 className="ms-headline">{story.headline}</h2>
        <span className="ms-rule" aria-hidden="true" />
        {story.paragraphs.map((p, i) => (
          <p key={i} className="ms-story">
            {p}
          </p>
        ))}
        {meta && <p className="ms-meta">{meta}</p>}
        {story.evidence.length > 0 && <Why items={story.evidence} span={span} label="What this is built from" tone="on-dark" />}
      </div>
      {aside && <div className="ms-hero-aside">{aside}</div>}
    </header>
  )
}

// A calm horizon, drawn rather than photographed: hills under a low sun, in
// the page's own colours. Decoration only.
function HeroArt() {
  return (
    <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">
      <circle cx="610" cy="190" r="46" className="ms-art-sun" />
      <path d="M0 230 L120 170 L210 205 L330 130 L450 200 L560 150 L690 210 L800 165 L800 300 L0 300 Z" className="ms-art-far" />
      <path d="M0 255 L150 215 L280 245 L420 205 L560 248 L700 222 L800 240 L800 300 L0 300 Z" className="ms-art-near" />
    </svg>
  )
}

export type Jump = { id: string; icon: IconName; tone: Tone; title: string; note: string }

// The quick ways into the page's main parts, under the story.
export function JumpRow({ jumps }: { jumps: Jump[] }) {
  if (jumps.length === 0) return null
  return (
    <nav className="ms-jumps" aria-label="In this Mirror">
      {jumps.map((j) => (
        <button key={j.id} type="button" className="ms-jump" onClick={() => scrollTo(j.id)}>
          <Disc icon={j.icon} tone={j.tone} size={40} />
          <span className="ms-jump-text">
            <span className="ms-jump-title">{j.title}</span>
            <span className="ms-jump-note">{j.note}</span>
          </span>
          <span className="ms-jump-chev" aria-hidden="true">
            <Icon name="chevron" size={16} />
          </span>
        </button>
      ))}
    </nav>
  )
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  el.focus?.({ preventScroll: true })
}

export function Section({
  id,
  icon,
  tone = 'green',
  title,
  note,
  action,
  children,
  className,
}: {
  id: string
  icon: IconName
  tone?: Tone
  title: string
  note?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={`ms-section${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`} tabIndex={-1}>
      <div className="ms-section-head">
        <Disc icon={icon} tone={tone} size={40} />
        <div className="ms-section-titles">
          <h3 id={`${id}-title`} className="ms-section-title">
            {title}
          </h3>
          {note && <p className="ms-section-note">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// "Why am I seeing this?": the answers, dates and words a line rests on.
export function Why({ items, span, label, tone }: { items: EvidenceItem[]; span: Span; label?: string; tone?: 'on-dark' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  if (items.length === 0) return null
  const shown = items.slice(0, 8)
  return (
    <div className={`ms-why${tone ? ` ${tone}` : ''}`}>
      <button type="button" className="ms-why-button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {label ?? (items.length === 1 ? 'Seen in 1 answer' : `Seen in ${items.length} answers`)}
        <span className={open ? 'ms-why-chev open' : 'ms-why-chev'} aria-hidden="true">
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div id={id} className="ms-why-list">
          <p className="ms-why-intro">Why am I seeing this? Because of these, from your own record:</p>
          <ul>
            {shown.map((e, i) => (
              <li key={`${e.date}-${i}`}>
                {e.date && <span className="ms-why-date">{whenSaid(e.date, span === 'week' ? 'week' : 'month')}</span>}
                {e.asked && <span className="ms-why-asked">{e.asked}</span>}
                {e.said && <span className="ms-why-said">You chose “{e.said}”.</span>}
              </li>
            ))}
          </ul>
          {items.length > shown.length && <p className="ms-why-more">And {items.length - shown.length} more.</p>}
        </div>
      )}
    </div>
  )
}

export type FitValue = 'me' | 'partly' | 'not_me'
const FIT_REPLY: Record<FitValue, string> = {
  me: 'Noted. You said this is you.',
  partly: 'Noted. You said it’s partly you.',
  not_me: 'Thank you. It won’t be read as you again unless new answers say otherwise.',
}

// "That's me", "Partly", "Not me": every interpretation can be challenged.
export function Fit({ value, onFit }: { value: FitValue | null; onFit: (v: FitValue) => void }) {
  const [said, setSaid] = useState<FitValue | null>(value)
  if (said) return <p className="ms-fit-reply">{FIT_REPLY[said]}</p>
  return (
    <div className="ms-fit" role="group" aria-label="Does this sound like you?">
      {(
        [
          ['me', 'That’s me'],
          ['partly', 'Partly'],
          ['not_me', 'Not me'],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          className="ms-chip"
          onClick={() => {
            onFit(v)
            setSaid(v)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// What the person tried and said about it: one row each, never a score.
export function HelpedList({ items, span }: { items: HelpedItem[]; span: Span }) {
  return (
    <ul className="ms-helped">
      {items.map((i) => (
        <li key={i.text} className="ms-helped-row">
          <span className="ms-helped-text">
            <span className="ms-helped-step">{i.text}</span>
            <span className="ms-helped-note">
              {HELPED_NOTE[i.outcome]}
              {i.times > 1 ? ` ${span === 'week' ? 'This week' : 'So far'}: ${i.times} times.` : ''}
            </span>
          </span>
          <span className={`ms-pill is-${i.outcome}`}>{HELPED_PILL[i.outcome]}</span>
        </li>
      ))}
    </ul>
  )
}

// You're not alone: real counts, past the privacy threshold, and a quiet
// bar for the share. It says the experience is shared, nothing more.
export function NotAloneView({ picks }: { picks: NotAlonePick[] }) {
  return (
    <ul className="ms-alone">
      {picks.map((p) => (
        <li key={p.questionId}>
          <p className="ms-alone-count">
            {p.same.toLocaleString('en-GB')} of {p.total.toLocaleString('en-GB')} people
          </p>
          <p className="ms-alone-what">
            chose “{p.label}” too, when asked: {p.prompt}
          </p>
          <span className="ms-bar" role="img" aria-label={`${p.same} of ${p.total}`}>
            <span style={{ width: `${Math.max(2, Math.round((p.same / Math.max(1, p.total)) * 100))}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function OthersView({ picks }: { picks: OthersPick[] }) {
  return (
    <>
      {picks.map((p) => (
        <div key={p.step} className="ms-others">
          <p className="ms-others-step">“{p.step}”</p>
          <dl className="ms-others-rows">
            {p.rows.map((r) => (
              <div key={r.label} className="ms-others-row">
                <dt>{r.label}</dt>
                <dd>
                  <span className="ms-bar small" aria-hidden="true">
                    <span style={{ width: `${r.count === null ? 3 : Math.round((r.count / Math.max(1, p.total)) * 100)}%` }} />
                  </span>
                  <span className="ms-others-n">{r.count === null ? 'a few' : r.count.toLocaleString('en-GB')}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="ms-others-line">{p.line}</p>
        </div>
      ))}
      <p className="ms-fine">Voluntary, self-reported outcomes from people who chose to report back. Not a promise that it will work for you.</p>
    </>
  )
}

// In your own words: off until the person lets their reflections in. The
// line is read on this phone and never sent.
export function OwnWordsView({
  pick,
  span,
  onChange,
}: {
  pick: { id: string; date: string; sentence: string } | null
  span: Span
  onChange: () => void
}) {
  const [on, setOn] = useState(() => reflectSettings().reflectionsInMirror)
  const [still, setStill] = useState<StillImportant | null>(() => (pick ? stillImportant(pick.id) : null))
  if (!on) {
    return (
      <div className="ms-words-off">
        <p>Your Mirror can bring back one line you wrote in Reflect and ask whether it still matters. It is read on this phone only.</p>
        <button
          type="button"
          className="ms-chip"
          onClick={() => {
            setReflectSettings({ reflectionsInMirror: true })
            setOn(true)
            onChange()
          }}
        >
          Bring my words back
        </button>
      </div>
    )
  }
  if (!pick) return <p className="ms-quiet">Nothing written in Reflect in this {span === 'week' ? 'week' : span} yet. When you write, a line can come back here.</p>
  return (
    <>
      <blockquote className="ms-quote">
        “{pick.sentence}”<span className="ms-quote-when">Written on {whenSaid(pick.date, span === 'week' ? 'week' : 'month')}</span>
      </blockquote>
      <div className="ms-ask">
        <p className="ms-ask-q">Does this still feel important to you?</p>
        {still ? (
          <p className="ms-fit-reply">
            {still === 'yes' ? 'You said it still matters.' : still === 'changing' ? 'You said it’s changing.' : 'You said it no longer feels important. That is allowed.'}
          </p>
        ) : (
          <div className="ms-fit" role="group" aria-label="Does this still feel important to you?">
            {(
              [
                ['yes', 'Yes'],
                ['changing', 'It’s changing'],
                ['no', 'Not any more'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="ms-chip"
                onClick={() => {
                  answerStillImportant(pick.id, v)
                  setStill(v)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// One gentle direction: "I'll try this", "My own idea" or "Not now". Taken
// up, it becomes an intention Reflect checks in on a week later.
export function DirectionBox({
  span,
  from,
  today,
  direction,
  title,
  allowOwn = false,
}: {
  span: Span
  from: string
  today: string
  direction: Direction | null
  title: string
  allowOwn?: boolean
}) {
  const [chosen, setChosen] = useState(() => directionChoice(span, from))
  const [own, setOwn] = useState<string | null>(null)
  if (!direction && !chosen && !allowOwn) return null
  function choose(choice: 'try' | 'own' | 'not_now', text?: string) {
    chooseDirection(span, from, choice, direction?.key ?? 'own', today, text)
    setChosen(directionChoice(span, from))
    setOwn(null)
  }
  return (
    <section id="ms-direction" className="ms-direction" aria-labelledby="ms-direction-title" tabIndex={-1}>
      <div className="ms-section-head">
        <Disc icon="arrow" tone="amber" size={40} />
        <div className="ms-section-titles">
          <h3 id="ms-direction-title" className="ms-section-title">
            {title}
          </h3>
          {direction && <p className="ms-direction-text">{direction.text}</p>}
          {direction && <p className="ms-section-note">{direction.why}</p>}
        </div>
      </div>
      {chosen ? (
        <p className="ms-fit-reply">
          {chosen.choice === 'try'
            ? 'Kept as an intention. Reflect will ask how it went in a week.'
            : chosen.choice === 'own'
              ? 'Your own idea is kept as an intention. Reflect will ask how it went in a week.'
              : 'Put away for now. Nothing else will be suggested in its place.'}{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              undoDirection(span, from)
              setChosen(null)
            }}
          >
            Change
          </button>
        </p>
      ) : own !== null ? (
        <form
          className="ms-own"
          onSubmit={(e) => {
            e.preventDefault()
            if (own.trim()) choose('own', own)
          }}
        >
          <label className="ms-own-label" htmlFor={`own-${span}`}>
            Your own idea, in a few words
          </label>
          <textarea id={`own-${span}`} rows={2} value={own} maxLength={200} onChange={(e) => setOwn(e.target.value)} />
          <div className="ms-direction-buttons">
            <button type="submit" className="btn" disabled={!own.trim()}>
              Keep it
            </button>
            <button type="button" className="ms-chip" onClick={() => setOwn(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="ms-direction-buttons">
          {direction && (
            <button type="button" className="btn" onClick={() => choose('try', direction.text)}>
              I’ll try this
            </button>
          )}
          <button type="button" className="ms-chip" onClick={() => setOwn('')}>
            My own idea
          </button>
          <button type="button" className="ms-chip" onClick={() => choose('not_now')}>
            Not now
          </button>
        </div>
      )}
    </section>
  )
}

// Two reading depths: the essential Mirror, and the whole of it.
export function DepthSwitch({ deep, onChange }: { deep: boolean; onChange: (deep: boolean) => void }) {
  return (
    <div className="ms-depth" role="group" aria-label="Reading depth">
      <button type="button" className="ms-depth-button" aria-pressed={!deep} onClick={() => onChange(false)}>
        Essential
      </button>
      <button type="button" className="ms-depth-button" aria-pressed={deep} onClick={() => onChange(true)}>
        Explore deeper
      </button>
    </div>
  )
}
