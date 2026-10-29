// What a person chooses inside the Mirrors, kept on this phone: the gentle
// direction they took up (or put away), the month's theme, and whether a
// line from their own words still feels important. Only the choice is kept
// here, under pi.mirror. (registry.ts); anything they write goes into the
// notebook's intentions and reflections, which travel only in the
// end-to-end journal backup.

import { keepIntention, keepReflection } from './notebook'
import { load, loadJSON, remove, save, saveJSON } from './storage'

const PREFIX = 'pi.mirror.'

export type DirectionChoice = { choice: 'try' | 'own' | 'not_now'; date: string; key: string }

const directionKey = (span: string, from: string) => `${PREFIX}direction.${span}.${from}`

export function directionChoice(span: string, from: string): DirectionChoice | null {
  const v = loadJSON(directionKey(span, from)) as DirectionChoice | null
  return v && (v.choice === 'try' || v.choice === 'own' || v.choice === 'not_now') && typeof v.date === 'string' ? v : null
}

// "I'll try this" keeps the direction as an intention, which Reflect checks
// in on a week later; "My own idea" keeps the person's words instead.
export function chooseDirection(span: string, from: string, choice: DirectionChoice['choice'], key: string, today: string, text?: string) {
  saveJSON(directionKey(span, from), { choice, date: today, key } satisfies DirectionChoice)
  if ((choice === 'try' || choice === 'own') && text?.trim()) {
    keepIntention({ id: `mirror-${span}-${from}`, date: today, text: text.trim(), from: `mirror.${span}` })
  }
}

export function undoDirection(span: string, from: string) {
  remove(directionKey(span, from))
}

// "Does this still feel important to you?" about a line from Reflect.
export type StillImportant = 'yes' | 'changing' | 'no'
const stillKey = (id: string) => `${PREFIX}still.${id}`

export function stillImportant(id: string): StillImportant | null {
  const v = load(stillKey(id))
  return v === 'yes' || v === 'changing' || v === 'no' ? v : null
}

export function answerStillImportant(id: string, v: StillImportant) {
  save(stillKey(id), v)
}

// A reading the person had a say on: "That's me", "Partly" or "Not me", for
// a finding with no other home (a life-area pattern in the month).
export type Fit = 'me' | 'partly' | 'not_me'
const fitKey = (key: string) => `${PREFIX}fit.${key}`
export const fitOf = (key: string): Fit | null => {
  const v = load(fitKey(key))
  return v === 'me' || v === 'partly' || v === 'not_me' ? v : null
}
export const rememberFit = (key: string, v: Fit) => save(fitKey(key), v)

// The Yearly Mirror's two pieces of the person's own writing go to the
// journal (encrypted in the backup), never here: "What you're proud of"
// and a letter to their future self.
const JOURNAL = 'pi.reflect.'
const proudKey = (year: string) => `${JOURNAL}proud.${year}`

export const proudOf = (year: string) => load(proudKey(year)) ?? ''

export function keepProud(year: string, text: string) {
  if (text.trim()) save(proudKey(year), text.trim())
  else remove(proudKey(year))
}

export function keepLetter(year: string, text: string, today: string) {
  keepReflection({
    id: `letter-${year}`,
    date: today,
    period: 'month',
    area: 'self',
    group: 'learnt',
    source: 'week',
    about: `A letter to myself, from ${year}`,
    question: 'A letter to your future self',
    answer: text,
    free: true,
  })
}

// The reading depth, Essential or Explore deeper, is one choice for every
// page now (depth.ts), still kept under pi.mirror.depth.
