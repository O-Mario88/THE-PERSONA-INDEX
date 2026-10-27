// What Today's card offers in each window, and the greeting above it: shared
// by the app's Today screen (mobile/src/screens/Today.tsx and Shell.tsx).
import { clock, opensAt, WINDOW_INFO, windowCloses, type OpenWindow, type Window } from './day'
import { windowsDone } from './windows'

export type Progress = 'none' | 'started' | 'done'

export type Hero = {
  eyebrow: string
  title: string
  sub: string
  action?: string // the button's words; none when there is nothing to open
  closes?: number // ms, for the ring
  opened?: number // ms, when the window opened
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

// heroFor says what Today's dark card offers in each window.
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
      sub: 'Your week, what you reached for and what to try next. Fresh questions arrive tomorrow at 05:00.',
      action: 'Open',
      opens: 'mirror',
    }
  }
  if (w === 'rest') {
    return { eyebrow: 'Rest', title: 'The night is yours', sub: 'Your morning three open at 05:00. Nothing to do until then but rest.', opens: null }
  }
  const info = WINDOW_INFO[w]
  const closes = windowCloses(date, w)
  const opened = closes - (info.closes - info.opens) * 60_000
  const timed = { closes, opened, eyebrow: `Open now · closes ${clock(info.closes % (24 * 60))}` }
  switch (w) {
    case 'morning':
      return morning === 'done'
        ? { eyebrow: 'Morning done', title: 'Your three are answered', sub: `Midday opens at ${clock(WINDOW_INFO.midday.opens)}: one tap on your step.`, action: 'See your morning', opens: 'morning' }
        : { ...timed, title: morning === 'started' ? 'Your morning three are waiting' : 'Three questions are ready', sub: 'Two minutes, then the day is yours.', action: 'Open', opens: 'morning' }
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
        sub: pulse ? 'How everyone else handled this morning’s questions.' : 'Today’s read, and nothing else until 17:00.',
        action: 'Open',
        opens: 'afternoon',
      }
    case 'evening':
      if (!evening) return { ...timed, title: "That's today's questions", sub: 'Three good things open at 21:00.', opens: null }
      return evening === 'done'
        ? { eyebrow: 'Evening done', title: 'Your evening three are answered', sub: `The night wind-down opens at ${clock(WINDOW_INFO.night.opens)}.`, action: 'See your evening', opens: 'evening' }
        : { ...timed, title: 'Three evening questions', sub: 'One tap on this morning’s step, then three questions.', action: 'Open', opens: 'evening' }
    case 'night':
      if (windowsDone(date).night !== undefined)
        return { eyebrow: 'Night done', title: "That's your day", sub: `Sleep well. Your morning three open at ${opensAt('morning')}.`, opens: null }
      return { ...timed, title: 'Three good things from today', sub: 'Then a quiet nod, if you like, and tomorrow.', action: 'Open', opens: 'night' }
  }
}
