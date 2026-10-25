import type { Reflection, ReflectionArea } from './notebook'
import { AREA_NAMES, type ReflectionItem } from './reflect'

// What you've noticed (Reflect): one line per area and group, each naming
// its source. The person's own reflections count only when they turn that on.

export type NoticedSource = 'answers' | 'week' | 'circle' | 'reflections'
export type Noticed = { area: ReflectionArea; group: 'strength' | 'grow'; text: string; source: NoticedSource }

const AREAS: ReflectionArea[] = ['work', 'school', 'family', 'culture', 'social', 'health', 'money', 'self']

// noticedFrom turns the reflection items into one line per area and group,
// adding the person's own reflections only when they chose that.
export function noticedFrom(items: ReflectionItem[], past: Reflection[], useReflections: boolean, from: string): Noticed[] {
  const out: Noticed[] = items.map((i) => ({
    area: i.area,
    group: i.group === 'grow' ? 'grow' : 'strength',
    text: i.text,
    source: i.source === 'circle' ? 'circle' : i.source === 'week' ? 'week' : 'answers',
  }))
  if (useReflections) {
    for (const area of AREAS) {
      const n = past.filter((r) => r.area === area && r.date >= from).length
      if (n >= 2) out.push({ area, group: 'strength', text: `You’ve come back to ${AREA_NAMES[area].toLowerCase()} in your writing ${n} times lately.`, source: 'reflections' })
    }
  }
  return out
}

