import { useState } from 'react'
import { Icon, type IconName } from './ui/icons'

// The one-time welcome (2026-10-25 redesign, "Onboarding"): what the app is,
// in three lines, before the very first sitting. It never shows again, and
// never to someone who has already answered on this phone.

export const WELCOMED = 'pi.welcomed'
// What the person asked to be called: on this phone only, never sent.
export const NAME_KEY = 'pi.name'
export const MAX_NAME = 30

const POINTS: { icon: IconName; title: string; line: string }[] = [
  { icon: 'insights', title: 'See your patterns', line: 'What you reached for and how you are changing, week by week.' },
  { icon: 'connect', title: 'Hear how others see you', line: 'Three friends, blended, so no single answer can be traced.' },
  { icon: 'heart', title: 'One small step at a time', line: 'No streaks, no scores. A missed day undoes nothing.' },
]

export function Welcome({ onBegin }: { onBegin: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <p className="wordmark">The Persona Index</p>
      <div className="welcome-words">
        <h2 id="welcome-title" className="display">
          A calmer you starts with reflection.
        </h2>
        <p className="welcome-lead">
          Three questions in the morning, three in the evening, and a mirror of your own answers on Sunday.
        </p>
      </div>
      <ul className="welcome-points">
        {POINTS.map((p) => (
          <li key={p.title}>
            <span className="icon-disc" aria-hidden="true">
              <Icon name={p.icon} size={24} />
            </span>
            <span>
              <strong>{p.title}</strong>
              <span className="muted">{p.line}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="welcome-foot">
        <label className="welcome-name">
          <span className="field-label">What should I call you? (optional)</span>
          <input
            className="field"
            value={name}
            maxLength={MAX_NAME}
            autoComplete="given-name"
            placeholder="Your first name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="button" className="btn wide" onClick={() => onBegin(name.trim())}>
          Begin your first reflection
        </button>
        <p className="muted small center">
          <Icon name="lock" size={14} /> Private to you. Your name stays on this phone. No account needed.
        </p>
      </div>
    </section>
  )
}
