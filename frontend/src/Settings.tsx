import { WORDS_DAYS, type Prefs, type WordsDays } from './prefs'

// Settings (review of 2026-10-15): the few choices a person can change
// later. The 18+ answer was a one-time tap; here it can be changed, and how
// long one's own words stay on the phone.

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
        <p className="muted">They never leave this phone. Choose how long they stay on it.</p>
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

      <button type="button" className="option" onClick={onOpenKept}>
        What I keep, and how to delete it
      </button>
    </section>
  )
}
