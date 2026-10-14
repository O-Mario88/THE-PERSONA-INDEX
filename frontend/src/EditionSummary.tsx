import { useState } from 'react'
import { playedDays } from './api'
import { daysPlayedThisWeek, SQUARE, themeName, type Outcome } from './crowd'

type Props = {
  date: string
  edition: number
  outcomes: Outcome[]
  tomorrowThemes: string[]
}

// The end of a session: the shareable edition squares, the week's rhythm and
// tomorrow's themes. Nothing here resets or punishes a missed day.
export function EditionSummary({ date, edition, outcomes, tomorrowThemes }: Props) {
  const [copied, setCopied] = useState(false)
  const squares = outcomes.map((o) => SQUARE[o]).join('')
  const played = daysPlayedThisWeek(playedDays(), date)
  const headingId = `edition-${edition}`

  async function share() {
    const url = window.location.origin
    const text = `Persona Index #${edition}\n${squares}\n🟩 with the crowd · 🟧 against it\n${url}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // the person closed the share sheet; nothing to do
    }
  }

  return (
    <section className="card summary" aria-labelledby={headingId}>
      <h2 id={headingId}>Edition #{edition} done</h2>
      <p className="squares" aria-label={`${outcomes.filter((o) => o === 'with').length} with the crowd`}>
        {squares}
      </p>
      <button type="button" className="option primary" onClick={share}>
        Share
      </button>
      {copied && <p className="muted">Copied. Paste it anywhere.</p>}
      <p className="muted">You played {played} of the last 7 days.</p>
      {tomorrowThemes.length > 0 && (
        <p>Tomorrow: {tomorrowThemes.map(themeName).join(' · ')}</p>
      )}
    </section>
  )
}
