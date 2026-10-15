import { useState } from 'react'
import { playedDays } from './api'
import { TRAIT_ADVICE } from './advice'
import { movesThisWeek } from './game'
import { daysPlayedThisWeek, themeName } from './themes'
import { loadHistory, lowMoodRepeated, readTraits, TRAIT_WORDS } from './profile'

// The weekly mirror: built from answers stored on this phone, never sent anywhere.
export function MyWeek({ today }: { today: string }) {
  const [, setVersion] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const history = loadHistory()
  const read = readTraits(history, today)
  const played = daysPlayedThisWeek([...playedDays(), ...history.answers.map((a) => a.date)], today)
  const themes = [...new Set(history.answers.map((a) => a.theme))]
  const moves = movesThisWeek(today)
  // One focus for next week: the clearest leaning of the week, and how to grow from it.
  const focus = read.traits.find((t) => t.direction !== 'middle' && TRAIT_ADVICE[t.trait] && TRAIT_WORDS[t.trait])

  function deleteAll() {
    try {
      // The device token stays: it holds nothing personal, and dropping it
      // would let this phone vote twice on today's questions.
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('pi.') && k !== 'pi.device.v1') localStorage.removeItem(k)
      }
    } catch {
      // nothing stored
    }
    setConfirming(false)
    setVersion((v) => v + 1)
  }

  return (
    <section className="card week" aria-labelledby="week-title">
      <h2 id="week-title">Your week</h2>
      <p className="muted">
        {read.label} · played {played} of the last 7 days
      </p>

      {read.traits.length === 0 ? (
        <p>Answer a few more questions this week and the patterns behind them will show here.</p>
      ) : (
        <ul className="traits">
          {read.traits.map((t) => {
            const words = TRAIT_WORDS[t.trait]
            if (!words) return null
            return (
              <li key={t.trait}>
                <p className="trait-name">{words.name}</p>
                <p>
                  {t.direction === 'middle'
                    ? 'Your answers sit in the middle here so far.'
                    : words[t.direction]}
                </p>
                <p className="muted">From {t.answers} answers</p>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted insight-note">
        For self-reflection, not a diagnosis. One week of answers gives a rough read, not a verdict.
      </p>

      <div className="steps">
        <h3>
          <span aria-hidden="true">🎯 </span>Your moves
        </h3>
        <p>
          {moves.picked === 0
            ? 'Pick a move after your morning questions, and the evening check-in will ask how it went.'
            : `Moves tried this week: ${moves.tried} of ${moves.picked}.`}
        </p>
      </div>

      {focus && focus.direction !== 'middle' && (
        <div className="advice" role="note" aria-label="Focus for next week">
          <h3>
            <span aria-hidden="true">🌱 </span>Focus for next week
          </h3>
          <p className="trait-name">{TRAIT_WORDS[focus.trait].name}</p>
          <p>{TRAIT_ADVICE[focus.trait][focus.direction].grow}</p>
        </div>
      )}

      {lowMoodRepeated(history, today) && (
        <div className="support" role="note" aria-label="Support">
          <p>
            A few of your answers this week sounded heavy. If things feel hard, talking to someone can help.
          </p>
          <a href="https://findahelpline.com" target="_blank" rel="noreferrer">
            Find a helpline in your country
          </a>
        </div>
      )}

      {themes.length > 0 && (
        <p className="muted">Themes you have explored: {themes.map(themeName).join(' · ')}</p>
      )}

      <div className="privacy">
        <p className="muted">
          Everything on this page lives only on this phone. The server only ever receives anonymous answer counts.
        </p>
        {!confirming ? (
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>
            Delete everything on this phone
          </button>
        ) : (
          <div className="confirm">
            <button type="button" className="option" onClick={deleteAll}>
              Yes, delete it all
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
