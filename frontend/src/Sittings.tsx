import { useState } from 'react'
import { opensAt } from './day'
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

// The rest hours, midnight to 5 am: nothing to answer, just what the
// morning holds, and three good things from the day just gone, if they are
// not written yet.
export function RestScreen({ date, morningThemes }: { date: string; morningThemes: string[] }) {
  const yesterday = addDays(date, -1)
  const [ask] = useState(() => !goodThings(yesterday))
  return (
    <section className="card rest" aria-label="The night is yours">
      <Upcoming label={`Your morning three · ${opensAt('morning')}`} themes={morningThemes} />
      {ask && <GoodThings date={yesterday} label="Before you sleep: three good things from your day" />}
    </section>
  )
}

// The quiet promise under every screen of the day.
export function PrivacyLine({ onOpenKept, onOpenSettings }: { onOpenKept: () => void; onOpenSettings: () => void }) {
  return (
    <div className="privacy-line">
      <p>
        <span aria-hidden="true">🔒</span> Private to you. I never show your answers to anyone, and the words you type
        stay on this phone.
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
