// What Today's card offers in each window, and the greeting above it: shared
// by the app's Today screen (mobile/src/screens/Today.tsx and Shell.tsx).
import { clock, MORNING_CLOSES, opensAt, WINDOW_INFO, type OpenWindow, type Window } from './day'
import { windowsDone } from './windows'

export type Progress = 'none' | 'started' | 'done'

export type Hero = {
  eyebrow: string
  title: string
  sub: string
  action?: string // the button's words; none when there is nothing to open
}

// greeting is the title (Edwin, 2026-10-25: "instead of using midday, use
// morning, afternoon and evening"): good morning, good afternoon through the
// midday and afternoon windows, good evening, and the night wind-down; after
// midnight, good night. The person's name once they gave one.
const GREETINGS: Record<Window, string> = {
  morning: 'Good morning',
  midday: 'Good afternoon',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Night wind-down',
  rest: 'Good night',
}

export function greeting(w: Window, name?: string | null): string {
  return name ? `${GREETINGS[w]}, ${name}.` : `${GREETINGS[w]}.`
}

// A sitting's three questions, in its own window or still open after it:
// the button says start, or carry on once one is answered.
function sitting(which: 'morning' | 'evening', eyebrow: string, started: boolean): Hero & { opens: OpenWindow } {
  const morning = which === 'morning'
  return {
    eyebrow,
    title: `Your ${which} three are ${started ? 'waiting' : 'ready'}`,
    sub: morning ? 'Two minutes, then the day is yours.' : 'One tap on this morning’s step, then three questions.',
    action: started ? 'Carry on' : morning ? 'Start today’s questions' : 'Start your evening three',
    opens: which,
  }
}

// heroFor says what Today's main card offers: the open sitting first, even
// after its own window (the morning three stay open until the evening, the
// evening three until midnight), then whatever the hour brings.
export function heroFor({
  date,
  window: w,
  review,
  morning,
  evening,
  pulse,
  friend,
}: {
  date: string
  window: Window
  review: boolean
  morning: Progress
  evening: Progress | null
  pulse: boolean
  friend?: string | null // today's friend, once the circle has three
}): Hero & { opens: OpenWindow | 'mirror' | null } {
  if (review) {
    return {
      eyebrow: 'Sunday · the day for looking back',
      title: 'Your Sunday Mirror is ready',
      sub: `Your week, what you reached for and what to try next. Fresh questions arrive tomorrow at ${clock(5 * 60)}.`,
      action: 'Open',
      opens: 'mirror',
    }
  }
  if (w === 'rest') {
    return { eyebrow: 'Rest', title: 'The night is yours', sub: `Your morning three open at ${clock(5 * 60)}. Nothing to do until then but rest.`, opens: null }
  }
  const info = WINDOW_INFO[w]
  const timed = { eyebrow: `Open now · closes ${clock(info.closes % (24 * 60))}` }
  if ((w === 'midday' || w === 'afternoon') && morning !== 'done') return sitting('morning', `Still open · until ${clock(MORNING_CLOSES)}`, morning === 'started')
  if (w === 'night' && evening && evening !== 'done') return sitting('evening', 'Still open · until midnight', evening === 'started')
  switch (w) {
    case 'morning':
      return morning === 'done'
        ? { eyebrow: 'Morning done', title: 'Your three are answered', sub: `Midday opens at ${clock(WINDOW_INFO.midday.opens)}: one tap on your step.`, action: 'See your morning', opens: 'morning' }
        : sitting('morning', `Today’s questions · closes ${clock(info.closes)}`, morning === 'started')
    case 'midday':
      return {
        ...timed,
        title: friend ? `Today's friend is ${friend}` : 'Your midday check',
        sub: friend ? 'One question, then a one-tap check on your step.' : 'One tap on your morning step, then today’s read.',
        action: 'Open',
        opens: 'midday',
      }
    case 'afternoon':
      return {
        ...timed,
        title: pulse ? 'The afternoon pulse' : 'A quiet afternoon',
        sub: pulse ? 'How everyone else handled this morning’s questions.' : `Today’s read, and nothing else until ${clock(17 * 60)}.`,
        action: 'Open',
        opens: 'afternoon',
      }
    case 'evening':
      if (!evening) return { ...timed, title: "That's today's questions", sub: `Three good things open at ${clock(21 * 60)}.`, opens: null }
      return evening === 'done'
        ? { eyebrow: 'Evening done', title: 'Your evening three are answered', sub: `The night wind-down opens at ${clock(WINDOW_INFO.night.opens)}.`, action: 'See your evening', opens: 'evening' }
        : sitting('evening', `This evening’s questions · closes ${clock(info.closes)}`, evening === 'started')
    case 'night':
      if (windowsDone(date).night !== undefined)
        return { eyebrow: 'Night done', title: "That's your day", sub: `Sleep well. Your morning three open at ${opensAt('morning')}.`, opens: null }
      return { ...timed, title: 'Three good things from today', sub: 'Then a quiet nod, if you like, and tomorrow.', action: 'Open', opens: 'night' }
  }
}
