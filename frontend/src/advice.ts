// The advice at the close of a sitting: what its answers lean towards, the
// strength in it, what it can honestly cost and one way to grow. Built on
// this phone from the person's own answers; nothing is sent anywhere.
//
// A leaning is named for what it has earned (the review of 2026-10-15, "How
// readings build"). One sitting is only a hint, so a hint gets the good in it
// and a way to grow; the honest part waits until the same leaning has shown up
// as a pattern, so one "drink some water" answer can never bring a hard line
// about losing a job.

import { earned, traitsOf, type AnswerRecord, type Earned, type History } from './profile'
import { honestLine, TRAITS, type Slot } from './traits'

export type Point = {
  trait: string
  name: string
  lean: string
  earned: Earned
  strength: string
  grow: string
  honest: string | null // only once the leaning is a pattern
}

export type TodaysAdvice = { headline: string; points: Point[] }

export const BALANCED =
  'Your answers today were balanced, with no single pattern standing out. Notice which moments feel easy today and which feel heavy; tomorrow will sharpen the picture.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// adviceFor reads the sitting's answers and speaks to their two clearest
// leanings, each as far as the person's last three weeks have earned it.
export function adviceFor(answers: AnswerRecord[], h: History, today: string, slot: Slot): TodaysAdvice {
  const sums: Record<string, number> = {}
  for (const a of answers) {
    for (const [t, w] of Object.entries(traitsOf(a))) sums[t] = (sums[t] ?? 0) + w
  }
  const points = Object.entries(sums)
    .filter(([t, s]) => s !== 0 && TRAITS[t])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([t, s]): Point => {
      const side = s > 0 ? TRAITS[t].high : TRAITS[t].low
      const e = earned(h, today, t, s > 0)
      return {
        trait: t,
        name: TRAITS[t].name,
        lean: side.lean,
        earned: e,
        strength: side.strength,
        grow: side.grow,
        honest: e.level === 'hint' ? null : honestLine(side, today, slot).text,
      }
    })

  if (points.length === 0) return { headline: BALANCED, points }
  const leaned = `Today your answers leaned towards ${points.map((p) => p.lean).join(', and towards ')}.`
  const first = points.find((p) => p.earned.level !== 'hint')
  if (!first) {
    return {
      headline: `${leaned} One day is only a hint, so here's what ${points.length === 1 ? 'it' : 'each'} could mean.`,
      points,
    }
  }
  return { headline: `${leaned} ${cap(first.lean)} ${earnedLine(first.earned)}`, points }
}

// earnedLine says what a leaning rests on, after its name.
function earnedLine(e: Earned): string {
  return e.level === 'steady'
    ? `keeps showing up: ${plural(e.answers, 'answer', 'answers')} over ${plural(e.weeks, 'week', 'weeks')}.`
    : `has come up in ${plural(e.answers, 'answer', 'answers')} over ${plural(e.days, 'day', 'days')}, so a pattern is forming.`
}

// levelLine is the short line under a leaning's name at the close.
export function levelLine(e: Earned): string {
  switch (e.level) {
    case 'hint':
      return `Only a hint so far, from ${plural(e.answers, 'answer', 'answers')}.`
    case 'pattern':
      return `A pattern is forming: ${plural(e.answers, 'answer', 'answers')} over ${plural(e.days, 'day', 'days')}.`
    case 'steady':
      return `This keeps showing up: ${plural(e.answers, 'answer', 'answers')} over ${plural(e.weeks, 'week', 'weeks')}.`
  }
}
