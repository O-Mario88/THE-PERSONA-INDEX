import { BackupSettings } from './Backup'
import { CountrySelect } from './Country'
import { PeopleEditor } from './People'
import { LockSettings } from './pwa/Lock'
import { WORDS_DAYS, type Prefs, type WordsDays } from './prefs'
import { COUNTRY_SETTING } from './words'

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
}: {
  prefs: Prefs
  onChange: (p: Prefs) => void
  onOpenKept: () => void
  onBack: () => void
}) {
  return (
    <section className="screen settings" aria-labelledby="settings-title">
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      <h2 id="settings-title" className="done-title">
        Settings
      </h2>

      <fieldset className="notice">
        <legend className="eyebrow">Intimacy questions</legend>
        <p className="muted">
          Some questions are about intimacy and sex: frank, never graphic, and kept only as "a private answer".
        </p>
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
        <legend className="eyebrow">Your own words</legend>
        <p className="muted">
          They stay on this phone, and go in your backup only if you choose that below. Choose how long they stay.
        </p>
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
        <legend className="eyebrow">Where you live</legend>
        <p className="muted">{COUNTRY_SETTING}</p>
        <CountrySelect value={prefs.country ?? ''} withNone onChange={(country) => onChange({ ...prefs, country })} />
      </fieldset>

      <fieldset className="notice">
        <legend className="eyebrow">Your people</legend>
        <p className="muted">
          When an answer sounds heavy, I'll name them instead of giving you an insight. They stay on this phone, and go
          in your backup only if your own words do.
        </p>
        <PeopleEditor />
      </fieldset>

      <BackupSettings />

      <LockSettings />

      <button type="button" className="option" onClick={onOpenKept}>
        What I keep, and how to delete it
      </button>
    </section>
  )
}
