// Keep a moment (Edwin's brief, 2026-10-28): something worth remembering that
// happened between the sittings (a hard conversation, a decision, a kindness,
// a quiet minute), kept in a sentence or two without opening the journal.
// A moment is private writing like any reflection (notebook.ts): only on the
// phone and in the encrypted backup, and back in a Mirror only when the person
// lets their reflections in (journal.ts reflectionsInMirror).

import { keepReflection, reflections, type Reflection } from './notebook'

export const MOMENT_QUESTION = 'A moment worth keeping'
export const MOMENT_MAX = 280

// keepMoment keeps the words as a moment of the day; empty words keep nothing.
export function keepMoment(text: string, today: string, now: number = Date.now()): void {
  keepReflection({
    id: `moment-${now}`,
    date: today,
    period: 'day',
    area: 'self',
    group: 'learnt',
    source: 'moment',
    about: '',
    question: MOMENT_QUESTION,
    answer: text.slice(0, MOMENT_MAX),
    free: true,
  })
}

// momentsBetween is the moments kept from one date to another, newest first.
export function momentsBetween(from: string, to: string, written: Reflection[] = reflections()): Reflection[] {
  return written.filter((r) => r.source === 'moment' && r.date >= from && r.date <= to).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
}
