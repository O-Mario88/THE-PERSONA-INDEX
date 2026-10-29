// What Today's card offers in each window, and the greeting above it: shared
// by the app's Today screen (mobile/src/screens/Today.tsx and Shell.tsx).
import { clock, EVENING_OPENS, MORNING_CLOSES, opensAt, WINDOW_INFO, type OpenWindow, type Window } from './day'
import { windowsDone } from './windows'
import { dayName, mirrorName, SUNDAY } from './mirrorDay'

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
// the button says start, or carry on once one is answered. With a preview
// (the first question waiting, Edwin's brief, 2026-10-28), the card reads as
// today's reflection and shows that question.
function sitting(which: 'morning' | 'evening', eyebrow: string, started: boolean, preview?: string | null): Hero & { opens: OpenWindow } {
  const morning = which === 'morning'
  const action = started ? 'Carry on' : morning ? 'Begin today’s questions' : 'Begin your evening three'
  if (preview) {
    return {
      eyebrow: eyebrow.replace('Today’s questions', 'Today’s reflection').replace('This evening’s questions', 'This evening’s reflection'),
      title: preview,
      sub: started ? 'Pick up where you left off. A few minutes, just for you.' : 'Three thoughtful questions. A few minutes, just for you.',
      action,
      opens: which,
    }
  }
  return {
    eyebrow,
    title: `Your ${which} three are ${started ? 'waiting' : 'ready'}`,
    sub: morning ? 'Two minutes, then the day is yours.' : 'Three questions, then how today went.',
    action,
    opens: which,
  }
}

// heroFor says what Today's main card offers: the open sitting first, even
// after its own window (the morning three stay open until the evening, the
// evening three until midnight). Otherwise a calm day (Edwin's brief,
// 2026-10-29: a weekly benefit, not a daily obligation): nothing more is
// announced after the morning until the evening, except today's friend, and
// three good things wait at night without being asked for.
export function heroFor({
  date,
  window: w,
  review,
  morning,
  evening,
  friend,
  preview,
  mirrorOn = SUNDAY,
}: {
  date: string
  window: Window
  review: boolean
  morning: Progress
  evening: Progress | null
  friend?: string | null // today's friend, once the circle has three
  preview?: string | null // the open sitting's next question, never an intimate one
  mirrorOn?: number // the day the person chose for their Mirror (mirrorDay.ts)
}): Hero & { opens: OpenWindow | 'mirror' | null } {
  // Sunday brings no questions. When the Mirror comes on another day, Sunday
  // is simply quiet, with this week so far there to look at.
  if (review && mirrorOn !== SUNDAY) {
    return {
      eyebrow: 'Sunday · no questions today',
      title: 'A quiet day',
      sub: `Your ${mirrorName(mirrorOn)} comes on ${dayName(mirrorOn)}. Fresh questions arrive tomorrow at ${clock(5 * 60)}.`,
      action: 'See your week so far',
      opens: 'mirror',
    }
  }
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
  const morningDone = {
    eyebrow: 'Morning done',
    title: 'Your three are answered',
    sub: `Your evening three open at ${clock(EVENING_OPENS)}. Nothing else is asked of you before then.`,
    action: 'See your morning',
    opens: 'morning' as const,
  }
  const restOfDay = 'Nothing else is asked of you today.'
  const timed = { eyebrow: `Open now · closes ${clock(info.closes % (24 * 60))}` }
  if ((w === 'midday' || w === 'afternoon') && morning !== 'done') return sitting('morning', `Still open · until ${clock(MORNING_CLOSES)}`, morning === 'started', preview)
  if (w === 'night' && evening && evening !== 'done') return sitting('evening', 'Still open · until midnight', evening === 'started', preview)
  switch (w) {
    case 'morning':
      return morning === 'done' ? morningDone : sitting('morning', `Today’s questions · closes ${clock(info.closes)}`, morning === 'started', preview)
    case 'midday':
      return friend ? { ...timed, title: `Today’s friend is ${friend}`, sub: 'One question, then a reminder of your step.', action: 'Open', opens: 'midday' } : morningDone
    case 'afternoon':
      return morningDone
    case 'evening':
      if (!evening) return { eyebrow: 'Evening', title: 'That’s today’s questions', sub: restOfDay, opens: null }
      return evening === 'done'
        ? { eyebrow: 'Evening done', title: 'Your evening three are answered', sub: restOfDay, action: 'See your evening', opens: 'evening' }
        : sitting('evening', `This evening’s questions · closes ${clock(info.closes)}`, evening === 'started', preview)
    case 'night':
      if (windowsDone(date).night !== undefined)
        return { eyebrow: 'Night done', title: "That's your day", sub: `Sleep well. Your morning three open at ${opensAt('morning')}.`, opens: null }
      return { eyebrow: 'Evening done', title: 'That’s today’s questions', sub: restOfDay, action: 'Three good things, if you like', opens: 'night' }
  }
}
