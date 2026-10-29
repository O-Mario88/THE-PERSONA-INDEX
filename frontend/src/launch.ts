// The launch (Edwin's design, 2026-10-29): the logo on midnight, then a calm
// loading page over a sunrise with a progress bar, then a short personal line
// while today is put together, then Welcome or Today
// (mobile/src/screens/Launch.tsx draws it). Each page stays long enough to be
// read and no longer than the app needs, and a slow network never keeps
// anyone on the loading page: after `wait` the app opens anyway and Today
// says what it is still fetching.

export type LaunchStage = 'launch' | 'loading' | 'personal' | 'gone'

export interface LaunchReady {
  // Fonts and what this phone kept are loaded, so the app can be drawn.
  app: boolean
  // Today's questions are in, or there was an answer saying why not.
  day: boolean
}

export const LAUNCH_MS = {
  launch: 850, // the logo settles into place (the phone's own splash came first)
  loading: 1100, // the logo glides up, then "Getting things ready…" long enough to read
  personal: 1000, // long enough to read the personal line
  fade: 350, // each page gives way to the next
  wait: 6000, // the longest the loading page waits for today's questions
} as const

export const LAUNCH_LINE = {
  loading: 'Getting things ready…',
  personal: 'Preparing a more personal experience for you…',
} as const

// How full the progress bar heads at each stage: it never claims the end
// before today is in.
export const BAR: Record<Exclude<LaunchStage, 'gone'>, number> = { launch: 0, loading: 0.6, personal: 1 }

// The stage after `stage`, which began at `since`, by `now` (both in ms).
// The same stage when it isn't time to move on yet.
export function nextStage(stage: LaunchStage, since: number, now: number, ready: LaunchReady): LaunchStage {
  const shown = now - since
  if (stage === 'launch') return ready.app && shown >= LAUNCH_MS.launch ? 'loading' : 'launch'
  if (stage === 'loading') return shown >= LAUNCH_MS.loading && (ready.day || shown >= LAUNCH_MS.wait) ? 'personal' : 'loading'
  if (stage === 'personal') return shown >= LAUNCH_MS.personal ? 'gone' : 'personal'
  return 'gone'
}
