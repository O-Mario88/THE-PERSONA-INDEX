// The words of the mirrors: which readings are named, the title they give
// a week, and the sentences around them. Every number on the mirror comes
// from the server; this file only turns those numbers into plain, human
// sentences. The trait words themselves, and the research behind them, are in
// traits.ts, out of sight in the app (Edwin, 2026-10-15).

import type { Level, Mirror, Period, PeriodMirror, TraitRead } from './api'
import { an, TRAITS, type Trait, type TraitSide } from './traits'

// A read leans one way from these scores; between them it sits in the middle.
export const HIGH = 60
export const LOW = 40

// A trait read of any length: a week's, or a month's, quarter's or year's.
type Read = { trait: string; score: number; level?: Level }

export type Lean<R extends Read = TraitRead> = { read: R; text: Trait; side: TraitSide; high: boolean }

// leanings lists the traits that clearly lean one way and have earned a name:
// a pattern at least, never a hint (the review of 2026-10-15, "How readings
// build"). They come in the server's order: the most earned first, then the
// clearest. notMe lists the sides the person said are not them
// ("trait.high"), which are left out.
export function leanings<R extends Read>(traits: R[], notMe: string[] = []): Lean<R>[] {
  return traits.flatMap((read) => {
    const text = TRAITS[read.trait]
    if (!text || (read.score > LOW && read.score < HIGH) || read.level === 'hint') return []
    const high = read.score >= HIGH
    if (notMe.includes(`${read.trait}.${high ? 'high' : 'low'}`)) return []
    return [{ read, text, side: high ? text.high : text.low, high }]
  })
}

// title names a span from its two clearest leanings, the strength and the
// cost together: "a steady finisher, and you may let rest wait too long".
// The first leaning gives the adjective and the edge, the second the noun.
export function title(traits: Read[], notMe: string[] = []): string | null {
  const l = leanings(traits, notMe)
  if (l.length === 0) return null
  return `${an(l[0].side.adj)} ${(l[1] ?? l[0]).side.noun}, and ${l[0].side.edge}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The starter for the Sunday sentence: the week's clearest leaning, for the
// person to finish or change.
export const sentenceStarter = (lean?: string) =>
  lean ? `This week I learned that I lean towards ${lean}, and ` : 'This week I learned that I '

// identityName is the name the identity card suggests for a span, from the
// same two leanings as its title: "The Steady Noticer" (Edwin's mockups).
export function identityName(traits: Read[], notMe: string[] = []): string | null {
  const l = leanings(traits, notMe)
  if (l.length === 0) return null
  const words = `${l[0].side.adj} ${(l[1] ?? l[0]).side.noun}`.split(' ').map(cap).join(' ')
  return `The ${words}`
}

// tagline: one leaning gives "{Q1}, with {w1}."; two "{Q1}, with {w2}.";
// three "{Q1} and {q2}, with {w3}."; four or more "{Q1} and {q2}, with {w3} and {w4}."
export function tagline(traits: Read[], notMe: string[] = []): string | null {
  const s = leanings(traits, notMe).map((l) => l.side)
  switch (s.length) {
    case 0:
      return null
    case 1:
      return `${cap(s[0].quality)}, with ${s[0].with}.`
    case 2:
      return `${cap(s[0].quality)}, with ${s[1].with}.`
    case 3:
      return `${cap(s[0].quality)} and ${s[1].quality}, with ${s[2].with}.`
    default:
      return `${cap(s[0].quality)} and ${s[1].quality}, with ${s[2].with} and ${s[3].with}.`
  }
}

const LEVEL_NAMES: Record<Level, string> = { hint: 'A hint', pattern: 'A pattern', steady: 'Steady', changing: 'Shifting' }

// levelMeta is the short line under a trait's score: how far it is earned.
export function levelMeta(r: { level: Level; answers: number }): string {
  return `${LEVEL_NAMES[r.level]} · ${plural(r.answers, 'answer', 'answers')}`
}

// levelLine says what a named leaning rests on, and how to hold it, for a
// week, month, quarter or year.
export function levelLine(r: { level: Level; answers: number; days: number; weeks: number }, span: string): string {
  switch (r.level) {
    case 'changing':
      return `This is shifting: from ${plural(r.answers, 'answer', 'answers')}, and the newest point the other way. Watch which way it goes.`
    case 'steady':
      return `This keeps showing up: ${plural(r.answers, 'answer', 'answers')} over ${plural(r.weeks, 'week', 'weeks')}. Worth testing against your real ${span}.`
    case 'pattern':
      return `A pattern is forming: ${plural(r.answers, 'answer', 'answers')} over ${plural(r.days, 'day', 'days')}. Worth testing against your real ${span}.`
    default:
      return `Only a hint so far, from ${plural(r.answers, 'answer', 'answers')}.`
  }
}

// "15 October": the day first, whatever the phone's locale.
export const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// weekRange is the question days of a week: "12 to 17 October", or "28
// September to 3 October" across two months. Sunday is the review day.
export function weekRange(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`)
  const sat = new Date(d.getTime() + 5 * 86400_000)
  const month = (x: Date) => MONTHS[x.getUTCMonth()]
  return month(d) === month(sat)
    ? `${d.getUTCDate()} to ${sat.getUTCDate()} ${month(sat)}`
    : `${d.getUTCDate()} ${month(d)} to ${sat.getUTCDate()} ${month(sat)}`
}

export const AREA_NAMES: Record<string, string> = {
  everyday: 'Everyday life',
  people: 'People',
  inner: 'Inner life',
  desire: 'Desire & lifestyle',
}

// quiet is said when nothing has earned a name: either the answers sit near
// the middle, or what leans has not come up often enough to call a pattern.
function quiet(traits: Read[], span: string): string {
  const leaning = traits.some((t) => TRAITS[t.trait] && (t.score <= LOW || t.score >= HIGH))
  return leaning
    ? `Nothing has come up often enough yet to call it a pattern. A few more days this ${span} will show what holds.`
    : 'Your answers sit close to the middle on everything so far, which is its own kind of balance.'
}

// summary is the hero's opening paragraph, spoken to the person.
export function summary(m: Mirror, notMe: string[] = []): string {
  const { daysActive, answers, daysSoFar } = m.stats
  if (answers === 0) {
    return m.weeksActive > 0
      ? "This week is quiet so far. That's fine; your read below still draws on the last three weeks, and it will sharpen as soon as you answer again."
      : 'Your mirror fills in as you answer. A few days of questions is enough for the first patterns to show.'
  }
  const days = daysActive === 1 ? 'one day' : `${daysActive} days`
  const l = leanings(m.traits, notMe)
  const lead =
    daysSoFar >= 6
      ? `You showed up on ${days} this week and gave ${answers} ${answers === 1 ? 'answer' : 'answers'}.`
      : `So far this week you've shown up on ${days} and given ${answers} ${answers === 1 ? 'answer' : 'answers'}.`
  if (l.length === 0) return `${lead} ${quiet(m.traits, 'week')}`
  return `${lead} What stood out most: ${l[0].side.headline.charAt(0).toLowerCase()}${l[0].side.headline.slice(1, -1)}. Here is what I noticed, and one thing to try next.`
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// periodName spells a period's label: "October 2026", "October to December
// 2026" or "2026". With year false it leaves the year off.
export function periodName(period: Period, label: string, year = true): string {
  const [y, rest] = label.split('-')
  const tail = year ? ` ${y}` : ''
  if (period === 'month') return `${MONTHS[Number(rest) - 1]}${tail}`
  if (period === 'quarter') {
    const first = (Number(rest.slice(1)) - 1) * 3
    return `${MONTHS[first]} to ${MONTHS[first + 2]}${tail}`
  }
  return y
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// periodSummary is the period's opening paragraph, spoken to the person.
export function periodSummary(p: PeriodMirror, notMe: string[] = []): string {
  const { answers, daysActive, weeksActive } = p.stats
  const noun = p.period
  if (answers === 0) {
    return `Nothing answered this ${noun} yet. It fills in week by week as you answer, and every week you come back adds to it.`
  }
  const last = p.weeks[p.weeks.length - 1]
  const over = p.weeks.length === p.weeksTotal && last?.daysSoFar >= 6
  const spread = `${plural(daysActive, 'day', 'days')} in ${plural(weeksActive, 'week', 'weeks')}`
  const lead = over
    ? `This ${noun} you showed up on ${spread} and gave ${plural(answers, 'answer', 'answers')}.`
    : `So far this ${noun} you've shown up on ${spread} and given ${plural(answers, 'answer', 'answers')}.`
  const l = leanings(p.traits, notMe)
  if (l.length === 0) return `${lead} ${quiet(p.traits, noun)}`
  const h = l[0].side.headline
  return `${lead} What stood out most: ${h.charAt(0).toLowerCase()}${h.slice(1, -1)}.`
}

// The closing line of each longer mirror (sources in traits.ts).
export const PERIOD_CLOSE: Record<Period, string> = {
  month: 'A month is long enough to see a pattern, and short enough to change one.',
  quarter: 'Many new habits take around two months to feel automatic, so a quarter is where small steps start to show.',
  year: 'Traits do shift over the years. A year is where the slow changes show, the ones you only notice looking back.',
}
