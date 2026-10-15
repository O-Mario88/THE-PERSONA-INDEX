// The on-phone profile: answer history, interest per theme, the weekly trait
// read and the low-mood check. None of it is ever sent to the server.
//
// Scoring rules, version 2 (change SCORING_VERSION when they change, so old
// reads are never silently reinterpreted):
// - Interest per theme: each answer adds (depth - 2.5) / 1.5, from -1 for the
//   lightest option to +1 for the deepest; each skip adds -1. Every event
//   halves in weight each week, so interests fade over about two weeks.
// - Trait read: answers from the last 7 days. For each trait, the mean of the
//   weights of the options chosen; shown only with 2+ answers touching it.
//   A mean above +0.25 reads "higher", below -0.25 "lower", else "middle".
//   Under 21 morning answers (one full week of play) the read is labelled "Early".
// - Evening follow-up answers (version 2) count towards the trait read only:
//   they carry trait weights but no depth, so they never move interest.

import type { FollowUpOption, Question } from './api'

export const SCORING_VERSION = 2

export type AnswerRecord = {
  date: string
  questionId: string
  theme: string
  depth: number
  traits: Record<string, number>
  evening?: true
}
export type History = { answers: AnswerRecord[]; skips: { date: string; theme: string }[] }

const DAY = 86400_000
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY

const historyKey = 'pi.history.v1'
const KEEP_DAYS = 60

export function loadHistory(): History {
  try {
    const raw = JSON.parse(localStorage.getItem(historyKey) ?? 'null')
    if (raw && Array.isArray(raw.answers) && Array.isArray(raw.skips)) return raw
  } catch {
    // unreadable or blocked storage: start fresh
  }
  return { answers: [], skips: [] }
}

function saveHistory(h: History, today: string) {
  const keep = <T extends { date: string }>(xs: T[]) => xs.filter((x) => days(x.date, today) <= KEEP_DAYS)
  try {
    localStorage.setItem(historyKey, JSON.stringify({ answers: keep(h.answers), skips: keep(h.skips) }))
  } catch {
    // private mode: the profile lasts for this visit only
  }
}

export function recordAnswer(q: Question, optionId: string, date: string) {
  const o = q.options.find((x) => x.id === optionId)
  if (!o || !q.theme) return
  const h = loadHistory()
  if (h.answers.some((a) => a.questionId === q.id)) return
  h.answers.push({ date, questionId: q.id, theme: q.theme, depth: o.depth ?? 1, traits: o.traits ?? {} })
  saveHistory(h, date)
}

// recordEvening keeps an evening answer, under the morning question's id plus '#evening'.
export function recordEvening(q: Question, o: FollowUpOption, date: string) {
  if (!q.theme) return
  const h = loadHistory()
  const questionId = `${q.id}#evening`
  if (h.answers.some((a) => a.questionId === questionId)) return
  h.answers.push({ date, questionId, theme: q.theme, depth: 0, traits: o.traits ?? {}, evening: true })
  saveHistory(h, date)
}

export function recordSkip(q: Question, date: string) {
  if (!q.theme) return
  const h = loadHistory()
  h.skips.push({ date, theme: q.theme })
  saveHistory(h, date)
}

export function interestScores(h: History, today: string): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (theme: string, v: number, date: string) => {
    out[theme] = (out[theme] ?? 0) + v * 0.5 ** (Math.max(0, days(date, today)) / 7)
  }
  for (const a of h.answers) if (!a.evening) add(a.theme, (a.depth - 2.5) / 1.5, a.date)
  for (const s of h.skips) add(s.theme, -1, s.date)
  return out
}

// pickThree chooses this phone's three questions: the two highest-interest
// themes, then the theme seen least in two weeks, never two from one theme.
// A phone with no history gets the shared default three.
export function pickThree(pool: Question[], defaults: Question[], h: History, today: string, adult: boolean): Question[] {
  if (h.answers.length === 0 && h.skips.length === 0) return defaults
  const eligible = pool.filter((q) => q.care !== 'intimate' || adult)
  const interest = interestScores(h, today)
  const seen: Record<string, number> = {}
  for (const a of h.answers) if (!a.evening && days(a.date, today) <= 14) seen[a.theme] = (seen[a.theme] ?? 0) + 1

  const picked: Question[] = []
  const usedThemes = new Set<string>()
  const take = (q: Question | undefined) => {
    if (!q) return
    picked.push(q)
    usedThemes.add(q.theme ?? q.id)
  }
  const fresh = () => eligible.filter((q) => !usedThemes.has(q.theme ?? q.id))
  const byInterest = (a: Question, b: Question) => (interest[b.theme ?? ''] ?? 0) - (interest[a.theme ?? ''] ?? 0)
  const bySeen = (a: Question, b: Question) => (seen[a.theme ?? ''] ?? 0) - (seen[b.theme ?? ''] ?? 0)

  take([...fresh()].sort(byInterest)[0])
  take([...fresh()].sort(byInterest)[0])
  take([...fresh()].sort(bySeen)[0])
  return picked.length === 3 ? picked : defaults
}

// The day's pick is fixed at first sight, so the three don't change while
// someone is answering them.
export function todaysPick(pool: Question[], defaults: Question[], today: string, adult: boolean): Question[] {
  const key = `pi.pick.${today}`
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (Array.isArray(ids)) {
      const qs = ids.map((id) => pool.find((q) => q.id === id) ?? defaults.find((q) => q.id === id))
      if (qs.every(Boolean)) return qs as Question[]
    }
  } catch {
    // fall through and pick again
  }
  const qs = pickThree(pool.length ? pool : defaults, defaults, loadHistory(), today, adult)
  try {
    localStorage.setItem(key, JSON.stringify(qs.map((q) => q.id)))
  } catch {
    // memory only
  }
  return qs
}

export function forgetPick(today: string) {
  try {
    localStorage.removeItem(`pi.pick.${today}`)
  } catch {
    // nothing to do
  }
}

export type TraitRead = { trait: string; direction: 'higher' | 'lower' | 'middle'; answers: number }

export const SOLID_READ_ANSWERS = 21 // a full week of three a day

export function readTraits(h: History, today: string): { label: string; traits: TraitRead[] } {
  const week = h.answers.filter((a) => days(a.date, today) >= 0 && days(a.date, today) < 7)
  const sums: Record<string, { sum: number; n: number }> = {}
  for (const a of week) {
    for (const [trait, w] of Object.entries(a.traits)) {
      const s = (sums[trait] ??= { sum: 0, n: 0 })
      s.sum += w
      s.n++
    }
  }
  const traits = Object.entries(sums)
    .filter(([, s]) => s.n >= 2)
    .map(([trait, s]): TraitRead => {
      const mean = s.sum / s.n
      return { trait, answers: s.n, direction: mean > 0.25 ? 'higher' : mean < -0.25 ? 'lower' : 'middle' }
    })
    .sort((a, b) => b.answers - a.answers)
  const n = week.filter((a) => !a.evening).length
  const label =
    n === 0
      ? 'No answers this week yet'
      : `${n < SOLID_READ_ANSWERS ? 'Early read' : 'Solid read'}, ${n} ${n === 1 ? 'answer' : 'answers'}`
  return { label, traits }
}

// Repeated deep answers about sadness and stress within a week bring a calm
// note with support contacts. One answer never does.
export function lowMoodRepeated(h: History, today: string): boolean {
  return (
    h.answers.filter((a) => !a.evening && a.theme === 'sadness-stress' && a.depth >= 3 && days(a.date, today) >= 0 && days(a.date, today) < 7)
      .length >= 3
  )
}

// What each trait means in plain words, for each direction. Every line must be
// one a sizeable share of people would say is not them.
export const TRAIT_WORDS: Record<string, { name: string; higher: string; lower: string }> = {
  conscientiousness: {
    name: 'Getting things done',
    higher: 'You tend to finish the task before you rest, even small ones.',
    lower: 'You keep plans loose and are comfortable leaving things for later.',
  },
  openness: {
    name: 'Openness to new things',
    higher: 'You reach for the unfamiliar option more often than the safe one.',
    lower: 'You prefer what you know works over trying something new.',
  },
  extraversion: {
    name: 'Energy from people',
    higher: 'Time with people tends to charge you up rather than drain you.',
    lower: 'You recharge alone and choose company carefully.',
  },
  agreeableness: {
    name: 'Keeping the peace',
    higher: 'You often give way to keep things smooth with others.',
    lower: 'You say what you think, even when it causes friction.',
  },
  neuroticism: {
    name: 'Worry and tension',
    higher: 'Things tend to stay on your mind after the moment has passed.',
    lower: 'Setbacks tend to roll off you quickly.',
  },
  honesty_humility: {
    name: 'Fairness',
    higher: 'You hold to fair play even when bending it would cost no one you know.',
    lower: 'You treat rules as flexible when the cost lands on no one in particular.',
  },
  attachment_anxiety: {
    name: 'Reading closeness',
    higher: 'You watch for signs that people are drifting away from you.',
    lower: 'You rarely read silence or distance as being about you.',
  },
  attachment_avoidance: {
    name: 'Keeping space',
    higher: 'You keep some distance, even from people you are close to.',
    lower: 'You let people in close without much hesitation.',
  },
  present_bias: {
    name: 'Now versus later',
    higher: 'The reward in front of you tends to win over the bigger one later.',
    lower: 'You will wait for the better result, even when now is tempting.',
  },
  rumination: {
    name: 'Replaying',
    higher: 'You replay hard moments long after they end.',
    lower: 'Once something is over, you tend to let it go.',
  },
  materialism: {
    name: 'Things or experiences',
    higher: 'Owning something you want tends to matter more to you than doing something.',
    lower: 'You would rather spend on doing something than on owning something.',
  },
}
