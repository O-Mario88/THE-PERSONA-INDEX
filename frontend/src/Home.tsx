import { useEffect, useState, type ReactNode } from 'react'
import { clock, left, MORNING_CLOSES, useNow, WINDOW_INFO, WINDOWS, windowCloses, type OpenWindow, type Window } from './day'
import { Icon } from './ui/icons'
import { Ring } from './ui/Ring'
import { Avatar } from './ui/Avatar'
import { TapestryCard } from './TapestryViews'
import { windowsDone } from './windows'

// Today (Stage 5 screens, "Midday, Ama"): the hub of the five windows. One
// dark card for what is open now, with how long it has left; a short list of
// what arrived since the person last looked; the season tapestry; and the
// day's five windows at a glance. Nothing here asks for anything.

export type Progress = 'none' | 'started' | 'done'

export type Hero = {
  eyebrow: string
  title: string
  sub: string
  action?: string // the button's words; none when there is nothing to open
  closes?: number // ms, for the ring
  opened?: number // ms, when the window opened
}

export type FeedItem = { key: string; who?: string; icon?: 'globe' | 'heart' | 'together'; text: ReactNode; aside?: ReactNode }

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
const longDateOf = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

// greeting is the title (Edwin, 2026-10-25: "instead of using midday, use
// morning, afternoon and evening"): good morning, good afternoon through the
// midday and afternoon windows, good evening, and the night wind-down; after
// midnight, good night. The person's name once they gave one.
const GREETINGS: Record<Window, string> = {
  morning: 'Good morning',
  midday: 'Good afternoon',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Night wind-down',
  rest: 'Good night',
}

export function greeting(w: Window, name?: string | null): string {
  return name ? `${GREETINGS[w]}, ${name}.` : `${GREETINGS[w]}.`
}

export function Home({
  date,
  window: w,
  name,
  note,
  hero,
  onOpen,
  onAccount,
  since,
  feed,
  morning,
  evening,
  children,
  wide,
}: {
  date: string
  window: Window
  name?: string | null
  note?: string | null // a personal line under the greeting
  hero: Hero
  onOpen: () => void
  onAccount: () => void
  since: number | null
  feed: FeedItem[]
  morning: Progress
  evening: Progress | null
  children?: ReactNode // the rest of the day: reads, the install invite, the privacy line
  wide?: boolean
}) {
  const now = useNow()
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const items = dayItems(date, w, morning, evening, nowMin)
  const doneCount = items.filter((i) => i.state === 'done').length
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="wordmark-row">
        <span className="wordmark">The Persona Index</span>
        {!wide && (
          <button type="button" className="avatar-button" aria-label="Account and settings" onClick={onAccount}>
            <Avatar name={name || 'You'} size={36} />
          </button>
        )}
      </div>
      <header className="home-head">
        <div className="home-greeting">
          <p className="label home-date">
            {wide ? longDateOf(date) : weekdayOf(date)} · {clock(nowMin)}
          </p>
          <h2 id="home-title" className="display">
            {greeting(w, name)}
          </h2>
          {note && <p className="home-note">{note}</p>}
        </div>
        <Ring
          part={doneCount / items.length}
          label={`${doneCount} of ${items.length} windows done today`}
          big={String(doneCount)}
          small={`of ${items.length} today`}
          size={92}
        />
      </header>

      <HeroCard hero={hero} now={now} onOpen={onOpen} />

      {feed.length > 0 && (
        <section className="since" aria-label="Since you last looked">
          <p className="label">{since ? `Since ${clock(new Date(since).getHours() * 60 + new Date(since).getMinutes())}` : 'Today'}</p>
          <ul>
            {feed.map((f) => (
              <li key={f.key} className="since-row">
                {f.who ? (
                  <Avatar name={f.who} size={34} />
                ) : (
                  <span className="since-icon">
                    <Icon name={f.icon ?? 'globe'} size={16} />
                  </span>
                )}
                <span className="since-text">{f.text}</span>
                {f.aside && <span className="since-aside">{f.aside}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <TapestryCard today={date} cols={wide ? 30 : 18} note={wide} />

      <DayLine items={items} />

      {children}
    </section>
  )
}

function HeroCard({ hero, now, onOpen }: { hero: Hero; now: number; onOpen: () => void }) {
  const ring =
    hero.closes && hero.opened ? (
      (() => {
        const l = left(hero.closes - now)
        const part = (hero.closes - now) / (hero.closes - hero.opened)
        return (
          <Ring
            part={part}
            label={`${l.text} left`}
            big={l.hours > 0 ? `${l.hours}h` : `${l.minutes}m`}
            small={l.hours > 0 ? `${l.minutes}m` : undefined}
          />
        )
      })()
    ) : null
  const body = (
    <>
      {ring}
      <span className="hero-words">
        <span className="hero-eyebrow">{hero.eyebrow}</span>
        <span className="hero-title">{hero.title}</span>
        <span className="hero-sub">{hero.sub}</span>
      </span>
    </>
  )
  if (!hero.action) {
    return (
      <div className="hero-card" role="group" aria-label={hero.title}>
        {body}
      </div>
    )
  }
  return (
    <button type="button" className="hero-card" aria-label={`${hero.action}: ${hero.title}`} onClick={onOpen}>
      {body}
      <span className="hero-go" aria-hidden="true">
        <span className="hero-open">{hero.action}</span>
        <Icon name="chevron" />
      </span>
    </button>
  )
}

type DayItem = { k: OpenWindow; name: string; state: 'done' | 'now' | 'open' | 'missed' | 'later'; sub: string }

// dayItems: the five windows, which are done, which is open and when the rest open.
function dayItems(date: string, w: Window, morning: Progress, evening: Progress | null, nowMin: number): DayItem[] {
  const done = windowsDone(date)
  return WINDOWS.map((k) => {
    const info = WINDOW_INFO[k]
    const isDone =
      k === 'morning' ? morning === 'done' : k === 'evening' ? evening === 'done' : done[k] !== undefined
    const isNow = k === w
    // The morning three stay open until 5 pm, the evening three until midnight.
    const stillOpen =
      (k === 'morning' && morning !== 'done' && nowMin >= info.opens && nowMin < MORNING_CLOSES) ||
      (k === 'evening' && evening !== null && evening !== 'done' && nowMin >= info.opens)
    const past = nowMin >= info.closes
    const state = isDone ? 'done' : isNow ? 'now' : stillOpen ? 'open' : past ? 'missed' : 'later'
    const at = done[k]
    const sub =
      state === 'done'
        ? at !== undefined
          ? `done · ${clock(at)}`
          : 'done'
        : state === 'now'
          ? 'now'
          : state === 'open'
            ? 'still open'
            : state === 'missed'
              ? 'closed'
              : clock(info.opens)
    return { k, name: info.short, state, sub }
  })
}

// DayLine: "Today's ritual", the five windows as one stepper.
function DayLine({ items }: { items: DayItem[] }) {
  const doneCount = items.filter((i) => i.state === 'done').length
  return (
    <div className="dayline card" role="group" aria-label="Your day">
      <div className="row-between">
        <h3 className="card-title">Today’s ritual</h3>
        <span className="muted small">
          {doneCount} of {items.length} complete
        </span>
      </div>
      <ol>
        {items.map((i) => (
          <li key={i.k} className={`dayline-item is-${i.state}`}>
            <span className="dayline-dot" aria-hidden="true" />
            <span className="dayline-name">{i.name}</span>
            <span className="dayline-sub">{i.sub}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// heroFor says what Today's dark card offers in each window.
export function heroFor({
  date,
  window: w,
  review,
  morning,
  evening,
  pulse,
  friend,
}: {
  date: string
  window: Window
  review: boolean
  morning: Progress
  evening: Progress | null
  pulse: boolean
  friend?: string | null // today's friend, once the circle has three
}): Hero & { opens: OpenWindow | 'mirror' | null } {
  if (review) {
    return {
      eyebrow: 'Sunday · the day for looking back',
      title: 'Your Sunday Mirror is ready',
      sub: 'Your week, what you reached for and what to try next. Fresh questions arrive tomorrow at 05:00.',
      action: 'Open',
      opens: 'mirror',
    }
  }
  if (w === 'rest') {
    return { eyebrow: 'Rest', title: 'The night is yours', sub: 'Your morning three open at 05:00. Nothing to do until then but rest.', opens: null }
  }
  const info = WINDOW_INFO[w]
  const closes = windowCloses(date, w)
  const opened = closes - (info.closes - info.opens) * 60_000
  const timed = { closes, opened, eyebrow: `Open now · closes ${clock(info.closes % (24 * 60))}` }
  switch (w) {
    case 'morning':
      return morning === 'done'
        ? { eyebrow: 'Morning done', title: 'Your three are answered', sub: `Midday opens at ${clock(WINDOW_INFO.midday.opens)}: one tap on your step.`, action: 'See your morning', opens: 'morning' }
        : { ...timed, title: morning === 'started' ? 'Your morning three are waiting' : 'Three questions are ready', sub: 'Two minutes, then the day is yours.', action: 'Open', opens: 'morning' }
    case 'midday':
      return {
        ...timed,
        title: friend ? `Today's friend is ${friend}` : 'Your midday check',
        sub: friend ? 'One question, then a one-tap check on your step.' : 'One tap on your morning step, then today’s read.',
        action: 'Open',
        opens: 'midday',
      }
    case 'afternoon':
      return {
        ...timed,
        title: pulse ? 'The afternoon pulse' : 'A quiet afternoon',
        sub: pulse ? 'How everyone else handled this morning’s questions.' : 'Today’s read, and nothing else until 17:00.',
        action: 'Open',
        opens: 'afternoon',
      }
    case 'evening':
      if (!evening) return { ...timed, title: "That's today's questions", sub: 'Three good things open at 21:00.', opens: null }
      return evening === 'done'
        ? { eyebrow: 'Evening done', title: 'Your evening three are answered', sub: `The night wind-down opens at ${clock(WINDOW_INFO.night.opens)}.`, action: 'See your evening', opens: 'evening' }
        : { ...timed, title: 'Three evening questions', sub: 'One tap on this morning’s step, then three questions.', action: 'Open', opens: 'evening' }
    case 'night':
      return { ...timed, title: 'Three good things from today', sub: 'Then a quiet nod, if you like, and tomorrow.', action: 'Open', opens: 'night' }
  }
}

// useSince keeps the moment Today was last looked at before this visit.
export function useSince(note: (now: number) => void, last: () => number | null) {
  const [since] = useState(last)
  useEffect(() => {
    note(Date.now())
  }, [note])
  return since
}
