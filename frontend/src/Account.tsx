import { blackOn, connectOn, pulseOn, type Prefs } from './prefs'

// Account (the Stage 5 screens, "Ama · @ama"): the person's choices in one
// place, what is kept and for how long, and the ways out. Signing in and the
// devices come with accounts; until then the app keeps everything on this
// phone.

function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: string
  note: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        <span className="toggle-note">{note}</span>
      </span>
      <input type="checkbox" role="switch" className="switch-input" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Choices({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const without = <K extends keyof Prefs>(k: K): Prefs => {
    const next = { ...prefs }
    delete next[k]
    return next
  }
  return (
    <section className="group" aria-labelledby="choices-title">
      <h3 id="choices-title" className="label">
        Choices
      </h3>
      <Toggle
        label="Dark mode · pure black"
        note="Evening and night windows use true #000, kinder on OLED and at 22:00."
        on={blackOn(prefs)}
        onChange={(on) => onChange(on ? without('black') : { ...prefs, black: false })}
      />
      <Toggle
        label="Show me the Human Pulse"
        note="Anonymous totals of how others answered. Off hides every number."
        on={pulseOn(prefs)}
        onChange={(on) => onChange({ ...prefs, pulse: on })}
      />
      <Toggle
        label="Quiet nods & Answer Together"
        note="Off means friends can't send you either. They won't be told."
        on={connectOn(prefs)}
        onChange={(on) => onChange(on ? without('connect') : { ...prefs, connect: false })}
      />
      {prefs.adult === true && (
        <Toggle
          label="Keep it mild (no intimacy questions)"
          note="Leaves intimacy questions out of every sitting not yet started."
          on={prefs.mild}
          onChange={(on) => onChange({ ...prefs, mild: on })}
        />
      )}
      <Toggle
        label="Reduce motion"
        note="Cards appear at once instead of unfolding in three beats."
        on={prefs.still === true}
        onChange={(on) => onChange(on ? { ...prefs, still: true } : without('still'))}
      />
    </section>
  )
}

export function AccountScreen({
  prefs,
  onChange,
  onOpenSettings,
  onOpenKept,
}: {
  prefs: Prefs
  onChange: (p: Prefs) => void
  onOpenSettings: () => void
  onOpenKept: () => void
}) {
  return (
    <section className="account" aria-labelledby="account-title">
      <header className="page-head">
        <p className="label">Account</p>
        <h2 id="account-title" className="display">
          This phone
        </h2>
      </header>
      <div className="two-col">
        <div className="col">
          <Choices prefs={prefs} onChange={onChange} />
          <section className="group" aria-label="More">
            <button type="button" className="row-button" onClick={onOpenSettings}>
              Settings: intimacy questions, your words, where you live, your people, backup and lock
            </button>
          </section>
        </div>
        <div className="col">
          <button type="button" className="btn wide outline" onClick={onOpenKept}>
            What I keep, and how to delete it
          </button>
        </div>
      </div>
    </section>
  )
}
