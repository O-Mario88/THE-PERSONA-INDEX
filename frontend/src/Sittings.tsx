import { useState } from 'react'
import { opensAt, type Sitting } from './day'
import { GoodThings } from './Keep'
import { goodThings } from './notebook'
import { addDays } from './storage'
import { themeName, themeStyle, themeVars } from './themes'

// The shape of the day around the questions: what comes next and when, the
// quiet screens between sittings and the plan of the day. It keeps people
// looking forward to their next three without asking anything of them now.

// How far one sitting's three questions have got.
export type Progress = 'none' | 'started' | 'done'

// Upcoming names the themes of the next three, as a small row of chips.
export function Upcoming({ label, themes, note }: { label: string; themes: string[]; note?: string }) {
  if (themes.length === 0 && !note) return null
  return (
    <div className="upcoming" role="group" aria-label={label}>
      <p className="eyebrow">{label}</p>
      {themes.length > 0 && (
        <ul className="upcoming-themes">
          {themes.map((t) => (
            <li key={t} className="upcoming-theme" style={themeVars(t)}>
              <span aria-hidden="true">{themeStyle(t).icon}</span> {themeName(t)}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="muted">{note}</p>}
    </div>
  )
}

// The night, until 5 am: nothing to answer, just what the morning holds, and
// three good things from the day just gone, if they are not written yet.
export function NightScreen({ date, morningThemes }: { date: string; morningThemes: string[] }) {
  const yesterday = addDays(date, -1)
  const [ask] = useState(() => !goodThings(yesterday))
  return (
    <section className="screen rest" aria-labelledby="night-title">
      <p className="rest-mark" aria-hidden="true">
        ☾
      </p>
      <h2 id="night-title" className="done-title">
        The night is yours.
      </h2>
      <p className="muted">Your morning three open at {opensAt('morning')}. Nothing to do until then but rest.</p>
      <Upcoming label={`Your morning three · ${opensAt('morning')}`} themes={morningThemes} />
      {ask && <GoodThings date={yesterday} label="Before you sleep: three good things from your day" />}
    </section>
  )
}

// The half hour from 4:30 pm, between the morning closing and the evening opening.
export function PauseScreen({ morning, eveningThemes }: { morning: Progress; eveningThemes: string[] | null }) {
  if (!eveningThemes) {
    return (
      <section className="screen rest" aria-labelledby="pause-title">
        <h2 id="pause-title" className="done-title">
          That's today's questions.
        </h2>
        <p className="muted">Your next three open tomorrow at {opensAt('morning')}.</p>
      </section>
    )
  }
  return (
    <section className="screen rest" aria-labelledby="pause-title">
      <p className="rest-mark" aria-hidden="true">
        ◐
      </p>
      <h2 id="pause-title" className="done-title">
        Your evening three open at {opensAt('evening')}.
      </h2>
      <p className="muted">
        {morning === 'done'
          ? 'Your morning is done. This half hour is yours.'
          : "This morning's questions have closed. That's fine: the evening is a fresh start."}
      </p>
      <Upcoming label="This evening" themes={eveningThemes} />
    </section>
  )
}

type PlanState = 'done' | 'open' | 'closed' | 'later'
const STATE_WORDS: Record<PlanState, string> = { done: 'Done', open: 'Open now', closed: 'Closed', later: '' }

// DayPlan is the day at a glance: the two sittings, when they open and how far each has got.
export function DayPlan({
  sitting,
  morning,
  evening,
}: {
  sitting: Sitting
  morning: Progress
  evening: Progress | null // null: no evening questions today
}) {
  const morningState: PlanState =
    sitting === 'night' ? 'later' : morning === 'done' ? 'done' : sitting === 'morning' ? 'open' : 'closed'
  const eveningState: PlanState = sitting !== 'evening' ? 'later' : evening === 'done' ? 'done' : 'open'
  const rows = [
    { key: 'morning', name: 'Morning three', hours: '5 am to 4:30 pm', state: morningState, opens: opensAt('morning') },
    ...(evening
      ? [{ key: 'evening', name: 'Evening three', hours: '5 pm to midnight', state: eveningState, opens: opensAt('evening') }]
      : []),
  ]
  return (
    <div className="day-plan" role="group" aria-label="Your day">
      <p className="eyebrow">Your day</p>
      <ol>
        {rows.map((r) => (
          <li key={r.key} className={`plan-row is-${r.state}`}>
            <span className="plan-dot" aria-hidden="true" />
            <span className="plan-name">{r.name}</span>
            <span className="plan-hours">{r.hours}</span>
            <span className="plan-state">{r.state === 'later' ? `Opens at ${r.opens}` : STATE_WORDS[r.state]}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// The quiet promise under every screen of the day.
export function PrivacyLine({ onOpenKept, onOpenSettings }: { onOpenKept: () => void; onOpenSettings: () => void }) {
  return (
    <div className="privacy-line">
      <p>
        <span aria-hidden="true">🔒</span> Private to you: no name, no email, no account. I never show your answers to
        anyone, and the words you type stay on this phone.
      </p>
      <p className="privacy-links">
        <button type="button" className="text-button" onClick={onOpenKept}>
          What I keep
        </button>
        <button type="button" className="text-button" onClick={onOpenSettings}>
          Settings
        </button>
      </p>
    </div>
  )
}
