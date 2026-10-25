import { useMemo, useState } from 'react'
import { countriesByName, guessCountry } from './country'
import { NO_COUNTRY } from './prefs'
import { COUNTRY_ASK, COUNTRY_KEEP, COUNTRY_NONE, COUNTRY_WHY } from './words'

// Where someone lives (the research of 2026-10-24): asked once, after a
// sitting, filled in from the phone's time zone, with "Prefer not to say".
// The answer is kept in the phone's settings and changed in Settings.

export function CountrySelect({
  value,
  onChange,
  withNone = false,
}: {
  value: string
  onChange: (country: string) => void
  withNone?: boolean
}) {
  const countries = useMemo(() => countriesByName(), [])
  return (
    <label className="field">
      Country
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">Choose a country</option>}
        {withNone && <option value={NO_COUNTRY}>{COUNTRY_NONE}</option>}
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function CountryAsk({ onAnswer }: { onAnswer: (country: string) => void }) {
  const [pick, setPick] = useState(() => guessCountry() ?? '')
  return (
    <section className="notice" aria-labelledby="country-title">
      <h2 id="country-title">{COUNTRY_ASK}</h2>
      <p className="muted">{COUNTRY_WHY}</p>
      <CountrySelect value={pick} onChange={setPick} />
      <div className="confirm">
        <button type="button" className="option" disabled={!pick} onClick={() => onAnswer(pick)}>
          {COUNTRY_KEEP}
        </button>
        <button type="button" className="option" onClick={() => onAnswer(NO_COUNTRY)}>
          {COUNTRY_NONE}
        </button>
      </div>
    </section>
  )
}
