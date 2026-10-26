import { useState } from 'react'
import { NEED_NAMES, NEED_PHRASES, type Need } from './needs'
import { checkPattern, patternCheckOf, patternsFor, type Pattern, type PatternCheck } from './patterns'
import { loadHistory } from './profile'
import { dayMonth } from './reflect'

// The longer Mirrors' patterns (Insights Release 3, patterns.ts): what
// Insights calls a pattern or something noticed in the person's own answers,
// with the counts behind it, and "Does this still feel true?". No retires it.

const REPLIES: Record<PatternCheck, string> = {
  yes: 'Kept. You said it still feels true.',
  partly: 'Kept. You said it’s partly true.',
  no: 'Retired. It won’t be called a pattern again unless new answers build it up.',
}

const LABELS: Record<Pattern['evidence'], string> = {
  pattern: 'A pattern worth exploring',
  noticing: 'Something you’ve been noticing',
}

export function MirrorPatterns({ today }: { today: string }) {
  // Read once, so a pattern retired here stays on the page with its reply.
  const [patterns] = useState(() => patternsFor(loadHistory(), today))
  return (
    <>
      <ul className="m-who">
        {patterns.map((p) => (
          <PatternCard key={p.need} pattern={p} today={today} />
        ))}
      </ul>
      <p className="m-note">Worked out on this phone from your own answers of the last 30 days. Nothing here is sent.</p>
    </>
  )
}

function PatternCard({ pattern: p, today }: { pattern: Pattern; today: string }) {
  const [said, setSaid] = useState<PatternCheck | null>(() => patternCheckOf(p.need)?.check ?? null)
  const [asking, setAsking] = useState(said === null)
  function tap(check: PatternCheck) {
    checkPattern(p.need as Need, check, today)
    setSaid(check)
    setAsking(false)
  }
  return (
    <li>
      <article className="m-card m-who-card" aria-label={NEED_NAMES[p.need]}>
        <p className="m-step-meta">{LABELS[p.evidence]}</p>
        <p className="m-who-headline">{NEED_NAMES[p.need]}</p>
        <p>
          In {p.answers} of your answers, on {p.days} days since {dayMonth(p.since)}, what you chose reached for {NEED_PHRASES[p.need]}.
        </p>
        {asking ? (
          <div className="m-verdict" role="group" aria-label="Does this still feel true?">
            <p className="m-who-kind">Does this still feel true?</p>
            {(['yes', 'partly', 'no'] as const).map((c) => (
              <button key={c} type="button" className="m-chip" onClick={() => tap(c)}>
                {c === 'yes' ? 'Yes' : c === 'partly' ? 'Partly' : 'No'}
              </button>
            ))}
          </div>
        ) : (
          said && (
            <p className="m-note">
              {REPLIES[said]}{' '}
              {said !== 'no' && (
                <button type="button" className="text-button" onClick={() => setAsking(true)}>
                  Change
                </button>
              )}
            </p>
          )
        )}
      </article>
    </li>
  )
}
