import { adviceFor } from './advice'
import { NEED_PHRASES, type Need } from './needs'
import type { AnswerRecord, History } from './profile'
import { sideOf, TRAITS } from './traits'

// The first glimpse (Edwin, 2026-10-26): the close of a person's first day
// says something about them, in the trait library's own warm words, instead
// of waiting a week for the mirror. Only the good in a leaning: the honest
// part waits until a pattern has earned it.

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six']
const MIN_SHARED_NEED = 2

const answersIn = (n: number) => `${COUNT_WORDS[n] ?? n} ${n === 1 ? 'answer' : 'answers'}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The need two or more answers reached for, if one did.
function sharedNeed(answers: AnswerRecord[]): Need | null {
  const counts = new Map<Need, number>()
  for (const a of answers) if (a.need) counts.set(a.need, (counts.get(a.need) ?? 0) + 1)
  let best: Need | null = null
  for (const [need, n] of counts) if (n >= MIN_SHARED_NEED && (!best || n > (counts.get(best) ?? 0))) best = need
  return best
}

type Glimpse = { headline: string; strength: string; need: Need | null }

// glimpseOf reads the day's answers through the same ranking as the thread,
// and keeps its clearest leaning. Null when nothing leans either way.
export function glimpseOf(answers: AnswerRecord[], h: History, date: string, name: string | null): Glimpse | null {
  const top = adviceFor(answers, h, date, 'morning').points[0]
  const trait = top && TRAITS[top.trait]
  if (!trait) return null
  const side = sideOf(trait, top.high)
  const lead = name ? `${name}, ${answersIn(answers.length)} in` : cap(`${answersIn(answers.length)} in`)
  return { headline: `${lead}: ${side.quality}, with ${side.with}.`, strength: side.strength, need: sharedNeed(answers) }
}

type Props = { answers: AnswerRecord[]; history: History; date: string; name: string | null }

export function FirstGlimpse({ answers, history, date, name }: Props) {
  const glimpse = glimpseOf(answers, history, date, name)
  if (!glimpse) return null
  return (
    <div className="thread glimpse" role="note" aria-label="A first glimpse of you">
      <p className="eyebrow">A first glimpse of you</p>
      <p className="thread-headline">{glimpse.headline}</p>
      <p>{glimpse.strength}</p>
      {glimpse.need && <p>What you reached for most: {NEED_PHRASES[glimpse.need]}.</p>}
      <p className="muted small">
        One day is only a hint. Each answer adds a thread, and on Sunday they become your first mirror.
      </p>
    </div>
  )
}
