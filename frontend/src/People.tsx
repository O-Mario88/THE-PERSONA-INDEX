import { useState } from 'react'
import { loadPeople, MAX_HELPS, MAX_NAME, MAX_PEOPLE, savePeople } from './people'

// Your people: up to three names and what helps on a hard day, in the
// person's own words (people.ts). Edited in Settings, and offered on the card
// of a heavy answer when none are kept yet. Nothing here is sent.
export function PeopleEditor({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const [names, setNames] = useState(() => [...(loadPeople()?.names ?? []), '', '', ''].slice(0, MAX_PEOPLE))
  const [helps, setHelps] = useState(() => loadPeople()?.helps ?? '')
  const [saved, setSaved] = useState(false)
  return (
    <form
      className="people"
      aria-label="Your people"
      onSubmit={(e) => {
        e.preventDefault()
        savePeople(names, helps)
        setSaved(true)
        onSaved?.()
      }}
    >
      <p className="muted">Who would you want to hear from on a hard day? First names are enough.</p>
      {names.map((n, i) => (
        <input
          key={i}
          className="own-line"
          aria-label={`Person ${i + 1}`}
          value={n}
          maxLength={MAX_NAME}
          onChange={(e) => {
            setNames(names.map((x, j) => (j === i ? e.target.value : x)))
            setSaved(false)
          }}
        />
      ))}
      <label className="plan-field people-helps">
        <span>What helps when things are heavy</span>
        <input
          className="own-line"
          value={helps}
          maxLength={MAX_HELPS}
          placeholder="A walk, a call, an early night"
          onChange={(e) => {
            setHelps(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <p className="own-meta">
        <span>
          <span aria-hidden="true">🔒 </span>Kept on this phone only. The app never sends it.
        </span>
      </p>
      <div className="own-buttons">
        <button type="submit" className="pill-button">
          Keep them
        </button>
        {onCancel && (
          <button type="button" className="text-button" onClick={onCancel}>
            Not now
          </button>
        )}
      </div>
      {saved && !onSaved && (
        <p className="muted" role="status">
          Kept.
        </p>
      )}
    </form>
  )
}
