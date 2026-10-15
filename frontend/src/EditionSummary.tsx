import { useEffect, useState, type CSSProperties } from 'react'
import { CROWD_MIN_VOTES, getResults, playedDays, recalledChoice, SKIPPED, withCrowd, type Question } from './api'
import { adviceFor } from './advice'
import { encodeCompare } from './compare'
import { awardEdition, levelFor, loadGame, movesOn } from './game'
import { daysPlayedThisWeek, themeName, themeStyle, themeVars } from './themes'

// When the evening check-in comes, as the morning summary tells it.
export type CheckIn = 'later' | 'open' | 'tomorrow'

type Props = {
  date: string
  edition: number
  questions: Question[]
  checkIn: CheckIn
  answers: [string, string][] // what a compare link may carry: no intimate answers
  tomorrowThemes: string[]
}

const CHECK_IN_LINE: Record<CheckIn, string> = {
  later: "Your evening check-in opens at 5 pm. I'll ask how the day went.",
  open: 'Your evening check-in is open.',
  tomorrow: 'Answer before 5 pm tomorrow and the evening check-in will ask how your day went.',
}

// Your share of the crowd on each answered question, once it has enough votes.
type Share = { percent: number; with: boolean }

function useCrowdShares(questions: Question[]): Record<string, Share> {
  const [shares, setShares] = useState<Record<string, Share>>({})
  useEffect(() => {
    let live = true
    for (const q of questions) {
      const mine = recalledChoice(q.id)
      if (!q.options.some((o) => o.id === mine)) continue
      getResults(q.id).then(
        (r) => {
          const o = r.options.find((o) => o.optionId === mine)
          if (live && r.totalVotes >= CROWD_MIN_VOTES && o) {
            const share = { percent: o.percent, with: withCrowd(o.count, r.totalVotes, q.options.length) }
            setShares((s) => ({ ...s, [q.id]: share }))
          }
        },
        () => {
          // no share shown
        },
      )
    }
    return () => {
      live = false
    }
  }, [questions])
  return shares
}

// "Done for today.": what the day's answers add up to, the moves chosen, and
// what's next. The insight cards are not repeated here; they were just shown.
// Nothing here resets or punishes a missed day.
export function EditionSummary({ date, edition, questions, checkIn, answers, tomorrowThemes }: Props) {
  const [copied, setCopied] = useState<'compare' | 'share' | null>(null)
  const [bonus, setBonus] = useState(0)
  const shares = useCrowdShares(questions)
  const cards = questions
    .map((q) => ({ q, o: q.options.find((o) => o.id === recalledChoice(q.id)) }))
    .filter((c): c is { q: Question; o: NonNullable<typeof c.o> } => !!c.o?.insight)
  const advice = adviceFor(cards.map((c) => c.o))
  const moves = movesOn(date)
  const headingId = `done-${edition}`

  useEffect(() => {
    if (cards.length > 0) setBonus(awardEdition(date))
    // award once per edition, when the recap first opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function send(text: string, kind: 'compare' | 'share') {
    try {
      if (navigator.share) {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(kind)
    } catch {
      // the person closed the share sheet; nothing to do
    }
  }

  // Squares say only whether each answer went with the crowd: never the
  // question or the answer, and nothing at all about an intimate one.
  function square(q: Question): string {
    const c = recalledChoice(q.id)
    if (!c || c === SKIPPED) return '⬜'
    if (q.care === 'intimate' || shares[q.id] === undefined) return '⬛'
    return shares[q.id].with ? '🟪' : '🟧'
  }

  const share = () =>
    send(`The Persona Index #${edition}\n${questions.map(square).join('')}\n${window.location.origin}`, 'share')
  const compare = () =>
    send(
      `I answered today's Persona Index. Answer the same questions and see where we agree: ${window.location.origin}/#c=${encodeCompare({ e: edition, a: answers })}`,
      'compare',
    )

  return (
    <section className="screen done" aria-labelledby={headingId}>
      {bonus > 0 && <Confetti />}
      <h2 id={headingId} className="done-title">
        Done for today.
      </h2>
      <p className="muted">
        Edition #{edition} · {cards.length} {cards.length === 1 ? 'insight' : 'insights'} today
        {bonus > 0 && <span className="points-pill">+{bonus} bonus</span>}
      </p>

      <ul className="tiles" aria-label="Today's answers">
        {questions.map((q) => {
          const c = recalledChoice(q.id)
          const status =
            !c || c === SKIPPED
              ? 'skipped'
              : q.care === 'intimate'
                ? 'private'
                : shares[q.id] !== undefined
                  ? `with ${Math.round(shares[q.id].percent)}%`
                  : 'answered'
          return (
            <li key={q.id} className={c && c !== SKIPPED ? 'tile on' : 'tile'} style={themeVars(q.theme)}>
              <span className="tile-icon" aria-hidden="true">
                {themeStyle(q.theme).icon}
              </span>
              <span className="tile-theme">{q.theme ? themeName(q.theme) : 'Today'}</span>
              <span className="tile-status">{status}</span>
            </li>
          )
        })}
      </ul>

      {cards.length > 0 && (
        <div className="thread" role="note" aria-label="Today's thread">
          <p className="eyebrow">Today's thread</p>
          <p className="thread-headline">{advice.headline}</p>
          {advice.points.map((p) => (
            <div key={p.trait} className="thread-point">
              <p className="thread-name">{p.name}</p>
              <p>{p.strength}</p>
              <p>
                <strong>For the rest of today:</strong> {p.grow}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="moves" role="group" aria-label="Moves you'll try">
        <p className="eyebrow">Moves you'll try{checkIn === 'later' ? ' · check-in tonight' : ''}</p>
        {moves.length > 0 ? (
          <ul>
            {moves.map((m) => (
              <li key={m.questionId}>
                <span className="move-dot" aria-hidden="true" />
                {m.step}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No move picked today. That's okay; noticing is a step too.</p>
        )}
      </div>

      <div className="done-actions">
        <button type="button" className="pill-button" onClick={share}>
          Share #{edition}
        </button>
        {answers.length > 0 && (
          <button type="button" className="pill-button ghost" onClick={compare}>
            Compare with someone
          </button>
        )}
      </div>
      {copied && <p className="muted">Copied. Paste it anywhere.</p>}

      {tomorrowThemes.length > 0 && (
        <p className="tomorrow">
          <span className="eyebrow">Tomorrow</span> {tomorrowThemes.map(themeName).join(' · ')}
        </p>
      )}
      <p className="check-in">{CHECK_IN_LINE[checkIn]}</p>
      <LevelLine date={date} />
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

// The level, points and the week's play, all kept on this phone.
export function LevelLine({ date }: { date: string }) {
  const game = loadGame()
  const level = levelFor(game.insights)
  const played = daysPlayedThisWeek(playedDays(), date)
  return (
    <div className="level" aria-label="Your level">
      <p>
        <span aria-hidden="true">{level.icon} </span>
        {level.name} · {game.points} pts · played {played} of the last 7 days
      </p>
      <div className="level-bar" aria-hidden="true">
        <div className="level-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
      {level.next && (
        <p className="muted">
          {level.toNext} more {level.toNext === 1 ? 'insight' : 'insights'} to {level.next.name}
        </p>
      )}
    </div>
  )
}

export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties} />
      ))}
    </div>
  )
}
