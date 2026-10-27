import type { Option, Question } from './api'
import type { Intention, KeptCard, Reflection, ReflectionArea, ReflectionPeriod } from './notebook'
import { areaOf, CIRCLE_MIN, dayMonth } from './reflect'
import type { OutsideMirror } from './social'
import { TRAITS } from './traits'

// "A thought for you" (Reflect, Edwin, 2026-10-25): one question at a
// time, built on this phone from templates and the person's own answers,
// kept cards, Mirrors and past reflections. No server and no AI sees what
// they write. Each question says why it appeared ("From your answers on
// Tuesday") and never claims more than that evidence. Today is for noticing
// now; the week for what repeated, helped or changed; the month for what was
// learnt and which intentions matter. The circle's view appears only once
// enough friends have answered that no one can be picked out.

export { CIRCLE_MIN }

export type ThoughtSource = 'general' | 'answers' | 'kept' | 'week' | 'circle' | 'reflections' | 'intention'
export type Thought = {
  id: string
  question: string
  lead: string
  why: string
  source: ThoughtSource
  area: ReflectionArea
  followsUp?: string
  intention?: string
}

export type Answered = { question: Question; option: Option; date: string }
export type ThoughtInput = {
  period: ReflectionPeriod
  today: string
  answered: Answered[]
  kept: KeptCard[]
  traits: { trait: string; score: number; level?: string }[] | null
  outside: OutsideMirror | null
  past: Reflection[]
  due: Intention[]
}

const LEAD: Record<ReflectionPeriod, string> = {
  day: 'What felt meaningful to you today, or hard, or different? There’s no right answer, just yours.',
  week: 'Looking back over your week: what kept coming up for you, what helped, what changed?',
  month: 'Looking at your month: what did it teach you, and what do you want to carry on?',
}

const GENERAL: Record<ReflectionPeriod, string[]> = {
  day: ['Where did you feel most like yourself today?', 'What took more out of you today than you expected?', 'What is one moment from today you want to remember?'],
  week: ['What kept coming up for you this week?', 'What helped you most this week?', 'What changed for you this week, even a little?'],
  month: ['What did this month teach you about yourself?', 'Which intentions matter to you going into next month?', 'What are you glad you let go of this month?'],
}

const WHY_GENERAL: Record<ReflectionPeriod, string> = { day: 'A question for any day', week: 'A question for looking back on a week', month: 'A question for looking back on a month' }
const THIS: Record<ReflectionPeriod, string> = { day: 'today', week: 'this week', month: 'this month' }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS = 86_400_000

// "today", "on Tuesday" within the week, else "on 6 October".
export function whenSaid(date: string, today: string): string {
  if (date === today) return 'today'
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY_MS
  if (days > 0 && days < 7) return `on ${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}`
  return `on ${dayMonth(date)}`
}

// Imperatives that read well as "Did asking for help earlier make any difference?".
const VERBS = new Set(['ask', 'take', 'try', 'say', 'call', 'write', 'go', 'walk', 'sleep', 'eat', 'pause', 'listen', 'leave', 'put', 'keep', 'stop', 'start', 'make', 'give', 'spend', 'turn', 'set', 'read', 'plan', 'rest', 'breathe', 'check', 'text', 'tell', 'share', 'let', 'do', 'get', 'find', 'choose', 'notice', 'speak'])
const DOUBLED = new Set(['put', 'stop', 'set', 'plan', 'let', 'get'])

export function gerund(text: string): string | null {
  const [first, ...rest] = text.trim().split(/\s+/)
  const verb = first.toLowerCase()
  if (!VERBS.has(verb)) return null
  const ing = DOUBLED.has(verb) ? `${verb}${verb.slice(-1)}ing` : verb.endsWith('e') && !verb.endsWith('ee') ? `${verb.slice(0, -1)}ing` : `${verb}ing`
  return [ing, ...rest].join(' ').replace(/[.!]+$/, '')
}

function fromIntentions(due: Intention[], today: string): Thought[] {
  return due.map((i) => {
    const g = gerund(i.text)
    return {
      id: `intention-${i.id}`,
      question: g ? `Did ${g} make any difference?` : `Did “${i.text}” make any difference?`,
      lead: 'No right answer. It may have helped, a little, not yet, or you may want to let it go.',
      why: `From something you wanted to try, ${whenSaid(i.date, today)}`,
      source: 'intention' as const,
      area: 'self' as const,
      intention: i.id,
    }
  })
}

function fromAnswers(answered: Answered[], period: ReflectionPeriod, today: string): Thought[] {
  return answered
    .filter((a) => a.question.care !== 'intimate' && !a.option.heavy)
    .slice(0, 3)
    .map((a) => ({
      id: `answer-${a.question.id}`,
      question: `You chose “${a.option.label}”. Where did that show up for you ${THIS[period]}?`,
      lead: a.question.prompt,
      why: `From your answers ${whenSaid(a.date, today)}`,
      source: 'answers' as const,
      area: areaOf(a.question.theme),
    }))
}

function fromKept(kept: KeptCard[], period: ReflectionPeriod, today: string): Thought[] {
  return kept
    .filter((c) => !c.private && c.headline)
    .slice(0, 1)
    .map((c) => ({
      id: `kept-${c.questionId}`,
      question: `You kept “${c.headline}” Did you see it in yourself ${THIS[period]}?`,
      lead: 'A card you chose to keep.',
      why: `From a card you kept ${whenSaid(c.date, today)}`,
      source: 'kept' as const,
      area: areaOf(c.theme),
    }))
}

function fromTraits(traits: ThoughtInput['traits'], period: ReflectionPeriod): Thought[] {
  if (period === 'day' || !traits) return []
  const t = traits.filter((x) => x.level !== 'hint' && TRAITS[x.trait] && Math.abs(x.score - 50) >= 10).sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))[0]
  if (!t) return []
  const side = t.score >= 50 ? TRAITS[t.trait].high : TRAITS[t.trait].low
  return [{ id: `week-${t.trait}`, question: `Your answers leaned towards ${side.lean}. Where did you notice it ${THIS[period]}?`, lead: LEAD[period], why: 'From your Mirror this week', source: 'week', area: 'self' }]
}

function fromCircle(outside: OutsideMirror | null, period: ReflectionPeriod): Thought[] {
  if (period === 'day' || !outside?.open || outside.friends < CIRCLE_MIN) return []
  const t = outside.traits.filter((x) => TRAITS[x.trait] && Math.abs(x.position - 50) >= 15)[0]
  if (!t) return []
  const side = t.position >= 50 ? TRAITS[t.trait].high : TRAITS[t.trait].low
  return [
    {
      id: `circle-${t.trait}`,
      question: `Your circle, blended, sees ${side.quality} in you. Where do you see it yourself?`,
      lead: 'No single friend’s answer can be picked out, and nothing you write goes back to them.',
      why: `From your Circle, blended from ${CIRCLE_MIN} or more friends`,
      source: 'circle',
      area: 'social',
    },
  ]
}

function fromPast(past: Reflection[], period: ReflectionPeriod, today: string): Thought[] {
  if (period === 'day') return []
  const days = period === 'week' ? 7 : 31
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
  const earlier = past.filter((r) => r.date < today && r.date >= from && r.answer.length <= 160).sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!earlier) return []
  return [
    {
      id: `past-${earlier.id}`,
      question: `You wrote: “${earlier.answer}” How does that sit with you now?`,
      lead: 'Your own words, brought back.',
      why: `From your reflection ${whenSaid(earlier.date, today)}`,
      source: 'reflections',
      area: earlier.area ?? 'self',
      followsUp: earlier.id,
    },
  ]
}

function general(period: ReflectionPeriod): Thought[] {
  return GENERAL[period].map((q, i) => ({ id: `general-${period}-${i}`, question: q, lead: LEAD[period], why: WHY_GENERAL[period], source: 'general' as const, area: 'self' as const }))
}

// thoughtsFor lists the questions in the order "Another" walks through them:
// a due check-in first, then the period's first general question, then what
// the person's own data suggests, then the rest.
export function thoughtsFor(input: ThoughtInput): Thought[] {
  const { period, today } = input
  const [firstGeneral, ...moreGeneral] = general(period)
  return [
    ...fromIntentions(input.due, today),
    firstGeneral,
    ...fromAnswers(input.answered, period, today),
    ...fromKept(input.kept, period, today),
    ...fromTraits(input.traits, period),
    ...fromCircle(input.outside, period),
    ...fromPast(input.past, period, today),
    ...moreGeneral,
  ]
}
