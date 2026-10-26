import { BackupSettings } from './Backup'
import { CountrySelect } from './CountryViews'
import { PeopleEditor } from './PeopleEditor'
import { LockSettings } from './pwa/LockGate'
import { countryOf, WORDS_DAYS, type Prefs, type WordsDays } from './prefs'
import { regionOf } from './regions'
import { REGIONAL_SWITCH } from './words'
import { MAX_NAME } from './Welcome'

// Settings (review of 2026-10-15): the few choices a person can change
// later. The 18+ answer was a one-time tap; here it can be changed, and how
// long one's own words stay on the phone, the people a heavy answer points
// to (People.tsx), the backup (Backup.tsx) and the lock (pwa/Lock.tsx).

const WORDS_NAMES: Record<WordsDays, string> = { 7: 'One week', 35: 'Five weeks', 90: 'Three months' }

export function SettingsScreen({
  prefs,
  onChange,
  onOpenKept,
  onBack,
  name = '',
  onName,
  onShowAll,
}: {
  prefs: Prefs
  onChange: (p: Prefs) => void
  onOpenKept: () => void
  onBack: () => void
  name?: string // what the greeting calls the person, kept on this phone
  onName?: (name: string) => void
  onShowAll?: () => void // in the first week: show every section now (firstWeek.ts)
}) {
  return (
    <section className="screen settings" aria-labelledby="settings-title">
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      <h2 id="settings-title" className="done-title">
        Settings
      </h2>
      <p className="muted settings-lead">Everything here is optional. Change it whenever you like.</p>

      {onName && (
        <fieldset className="notice">
          <legend className="eyebrow">Your name</legend>
          <label className="field-label">
            <span className="small muted">For the greeting. It stays on this phone.</span>
            <input className="field" defaultValue={name} maxLength={MAX_NAME} autoComplete="given-name" onBlur={(e) => onName(e.target.value.trim())} />
          </label>
        </fieldset>
      )}

      <fieldset className="notice">
        <legend className="eyebrow">Intimacy questions</legend>
        <p className="muted small">Frank, never graphic, and always kept private.</p>
        <label className="switch">
          <input
            type="radio"
            name="adult"
            checked={prefs.adult === true}
            onChange={() => onChange({ ...prefs, adult: true })}
          />
          I'm 18 or older
        </label>
        <label className="switch">
          <input
            type="radio"
            name="adult"
            checked={prefs.adult === false}
            onChange={() => onChange({ ...prefs, adult: false })}
          />
          I'm under 18, or I'd rather not have them
        </label>
        {prefs.adult === true && (
          <label className="switch">
            <input type="checkbox" checked={prefs.mild} onChange={(e) => onChange({ ...prefs, mild: e.target.checked })} />
            Keep it mild (no intimacy questions)
          </label>
        )}
      </fieldset>

      <fieldset className="notice">
        <legend className="eyebrow">Where you live</legend>
        <p className="muted small">So I can point you to the right helpline on a hard day. It stays on this phone.</p>
        <CountrySelect value={prefs.country ?? ''} withNone onChange={(country) => onChange({ ...prefs, country })} />
        {regionOf(countryOf(prefs)) && (
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.regional !== false}
              onChange={(e) => {
                const { regional: _, ...rest } = prefs
                onChange(e.target.checked ? rest : { ...rest, regional: false })
              }}
            />
            {REGIONAL_SWITCH}
          </label>
        )}
      </fieldset>

      <details className="settings-more">
        <summary>More settings</summary>
      <fieldset className="notice">
        <legend className="eyebrow">Your own words</legend>
        <p className="muted small">How long the words you type stay on this phone.</p>
        {WORDS_DAYS.map((d) => (
          <label key={d} className="switch">
            <input
              type="radio"
              name="words-days"
              checked={prefs.wordsDays === d}
              onChange={() => onChange({ ...prefs, wordsDays: d })}
            />
            {WORDS_NAMES[d]}
          </label>
        ))}
      </fieldset>

      <fieldset className="notice">
        <legend className="eyebrow">Your people</legend>
        <p className="muted small">People I'll point you to if an answer sounds heavy. They stay on this phone.</p>
        <PeopleEditor />
      </fieldset>

      {onShowAll && (
        <fieldset className="notice">
          <legend className="eyebrow">Your first week</legend>
          <p className="muted small">
            For your first week the app keeps to Today, Reflect and Insights. Connect and your Mirrors arrive as they fill in.
          </p>
          <button type="button" className="btn small soft" onClick={onShowAll}>
            Show every section now
          </button>
        </fieldset>
      )}

      <BackupSettings />

      <LockSettings />

      </details>

      <button type="button" className="option" onClick={onOpenKept}>
        What I keep, and how to delete it
      </button>
    </section>
  )
}
