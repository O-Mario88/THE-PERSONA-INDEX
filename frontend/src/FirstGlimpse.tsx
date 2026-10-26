import { adviceFor } from './advice'
import { NEED_PHRASES, type Need } from './needs'
import type { AnswerRecord, History } from './profile'
import { sideOf, TRAITS } from './traits'
import { GLIMPSE_BALANCED, GLIMPSE_NEXT } from './words'

// The first glimpse (Edwin, 2026-10-26): after a person's first three
// answers, a few plain lines on what they hint at together, said to them by
// name, in the trait library's own warm words. Only the good in a leaning:
// the honest part waits until a pattern has earned it. One sitting is a
// hint, and it says so.

const MIN_SHARED_NEED = 2
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The need two or more answers reached for, if one did.
export function sharedNeed(answers: AnswerRecord[]): Need | null {
  const counts = new Map<Need, number>()
  for (const a of answers) if (a.need) counts.set(a.need, (counts.get(a.need) ?? 0) + 1)
  let best: Need | null = null
  for (const [need, n] of counts) if (n >= MIN_SHARED_NEED && (!best || n > (counts.get(best) ?? 0))) best = need
  return best
}

type Props = { answers: AnswerRecord[]; history: History; date: string; name: string | null }

export function FirstGlimpse({ answers, history, date, name }: Props) {
  if (answers.length === 0) return null
  const points = adviceFor(answers, history, date, 'morning').points
  const top = points[0] && TRAITS[points[0].trait] ? sideOf(TRAITS[points[0].trait], points[0].high) : null
  const need = sharedNeed(answers)
  return (
    <section className="glimpse" aria-labelledby="glimpse-title">
      <p className="eyebrow">Your first glimpse</p>
      <h3 id="glimpse-title" className="glimpse-title">
        {name ? `${name}, here’s what your first answers hint at.` : 'Here’s what your first answers hint at.'}
      </h3>
      {top && <p className="glimpse-quality">{cap(top.quality)}, with {top.with}.</p>}
      {points.length === 0 ? (
        <p>{GLIMPSE_BALANCED}</p>
      ) : (
        <ul className="glimpse-points">
          {points.map((p) => (
            <li key={p.trait}>
              <strong>You lean towards {p.lean}.</strong> {p.strength}
            </li>
          ))}
        </ul>
      )}
      {need && <p>What you reached for most: {NEED_PHRASES[need]}.</p>}
      <p className="muted">{GLIMPSE_NEXT}</p>
    </section>
  )
}
