import type { Mirror, Option, Question } from './api'
import { splitReveal } from './reveal'
import type { OutsideMirror } from './social'
import { TRAITS } from './traits'
import type { Reflection, ReflectionArea, ReflectionGroup, ReflectionPeriod, ReflectionSource } from './notebook'

// Reflect (Edwin, 2026-10-25): what the person learnt about themselves,
// what's going well and where they could grow, across the parts of a life,
// from their own answers, their week's earned reads and, once three friends
// have answered, their circle's blended view. Each item becomes a question
// answered in their own words, and earlier answers come back later. No
// scores, no labels. The same rules as the native app (apple/PersonaKit).

export const AREA_NAMES: Record<ReflectionArea, string> = {
  work: 'Work',
  school: 'School',
  family: 'Family',
  culture: 'Culture and faith',
  social: 'Friends and social',
  health: 'Health',
  money: 'Money',
  self: 'Yourself',
}

export const SOURCE_NAMES: Record<ReflectionSource, string> = {
  answers: 'From your answers',
  week: 'From your week',
  circle: 'From your circle, blended',
}

// Circle-based reflection needs this many friends behind the blended view
// (Reflect), more than the Outside Mirror's three, so no one stands out.
export const CIRCLE_MIN = 5

export const PERIOD_NAMES: Record<ReflectionPeriod, string> = { day: 'Today', week: 'This week', month: 'This month' }
const THIS: Record<ReflectionPeriod, string> = { day: 'today', week: 'this week', month: 'this month' }
const NEXT: Record<ReflectionPeriod, string> = { day: 'tomorrow', week: 'next week', month: 'next month' }

const AREAS: Record<string, ReflectionArea> = {
  'work-career': 'work', colleagues: 'work',
  school: 'school', learning: 'school',
  family: 'family', relatives: 'family', parenting: 'family', partnership: 'family', dating: 'family', home: 'family', intimacy: 'family',
  faith: 'culture', celebrations: 'culture',
  friendship: 'social', neighbours: 'social', helping: 'social',
  'sleep-health': 'health', food: 'health', body: 'health', 'getting-around': 'health',
  money: 'money', 'wealth-luxury': 'money',
}

export const areaOf = (theme?: string): ReflectionArea => (theme && AREAS[theme]) || 'self'

export type ReflectionItem = { id: string; area: ReflectionArea; group: ReflectionGroup; source: ReflectionSource; text: string }
export type ReflectionPrompt = ReflectionItem & { question: string; followsUp?: string }

export function reflectionItems(
  period: ReflectionPeriod,
  answered: { question: Question; option: Option }[],
  mirror: Pick<Mirror, 'traits'> | null,
  outside: OutsideMirror | null,
): ReflectionItem[] {
  const out: ReflectionItem[] = []
  for (const { question: q, option: o } of answered) {
    if (q.care === 'intimate' || o.heavy || !o.insight) continue
    const area = areaOf(q.theme)
    out.push({ id: `${q.id}-learnt`, area, group: 'learnt', source: 'answers', text: splitReveal(o.insight.reveal).headline })
    if (o.insight.otherSide) out.push({ id: `${q.id}-grow`, area, group: 'grow', source: 'answers', text: o.insight.otherSide })
  }
  if (period !== 'day' && mirror) {
    const earned = mirror.traits
      .filter((t) => t.level !== 'hint' && TRAITS[t.trait] && Math.abs(t.score - 50) >= 10)
      .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
      .slice(0, 3)
    for (const t of earned) {
      const side = t.score >= 50 ? TRAITS[t.trait].high : TRAITS[t.trait].low
      out.push({ id: `${t.trait}-well`, area: 'self', group: 'strength', source: 'week', text: side.strength })
      out.push({ id: `${t.trait}-grow`, area: 'self', group: 'grow', source: 'week', text: side.grow })
    }
  }
  // The circle's blended view, only once the Outside Mirror is open.
  if (period !== 'day' && outside?.open && outside.friends >= CIRCLE_MIN) {
    for (const t of outside.traits.filter((t) => TRAITS[t.trait] && Math.abs(t.position - 50) >= 15).slice(0, 3)) {
      const side = t.position >= 50 ? TRAITS[t.trait].high : TRAITS[t.trait].low
      out.push({ id: `circle-${t.trait}`, area: 'social', group: 'strength', source: 'circle', text: side.strength })
    }
  }
  const order: ReflectionGroup[] = ['learnt', 'strength', 'grow']
  return order.flatMap((g) => out.filter((i) => i.group === g))
}

const QUESTION: Record<ReflectionGroup, (p: ReflectionPeriod) => string> = {
  learnt: (p) => `Where did you see this in yourself ${THIS[p]}?`,
  strength: (p) => `Where did this strength help you ${THIS[p]}?`,
  grow: (p) => `What is one small thing you could do differently ${NEXT[p]}?`,
}

// The questions to answer: first a follow-up on the newest earlier answer
// about growing (from another day, not yet followed up), then one per item.
export function reflectionPrompts(items: ReflectionItem[], period: ReflectionPeriod, past: Reflection[], today: string): ReflectionPrompt[] {
  const out: ReflectionPrompt[] = []
  const followed = new Set(past.map((r) => r.followsUp).filter(Boolean))
  const earlier = past
    .filter((r) => r.group === 'grow' && r.date < today && !r.followsUp && !followed.has(r.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (earlier) {
    out.push({
      id: `follow-${earlier.id}`,
      area: earlier.area,
      group: 'grow',
      source: earlier.source,
      text: earlier.answer,
      question: `On ${dayMonth(earlier.date)} you wrote: “${earlier.answer}” How has it gone since?`,
      followsUp: earlier.id,
    })
  }
  for (const i of items) out.push({ ...i, question: QUESTION[i.group](period) })
  return out
}

// "24 October": the day first, whatever the phone's locale.
export const dayMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
