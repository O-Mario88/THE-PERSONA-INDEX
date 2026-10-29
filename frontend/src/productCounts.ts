// Anonymous product counts (Edwin, 2026-10-29; docs/first-release.md): a
// useful first result, a brief being used, a return for another Mirror and a
// step that helped. Sent only once the person said yes to "Count how I use
// the app" (prefs.countUse), and only the event's name: no pass, words,
// answers or question (backend/productcounts.go refuses anything else).
import { postCount } from './api'
import { countUseOn, loadPrefs } from './prefs'
import { loadJSON, saveJSON } from './storage'

export type ProductEvent = 'first_result' | 'brief_used' | 'second_mirror' | 'step_helped'
type Send = (e: ProductEvent) => Promise<unknown>

// What this phone has already counted: the events sent once, the Mirror
// weeks opened since the person said yes (two at most are needed), and the
// first result when it came before the question about counting: it waits
// here, on the phone, and is sent once only if the person says yes.
const KEY = 'pi.counted.v1'
const ONCE: ProductEvent[] = ['first_result', 'second_mirror']
type Counted = { once: string[]; weeks: string[]; waiting: string[] }

function counted(): Counted {
  const v = loadJSON(KEY) as Partial<Counted> | null
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])
  return { once: list(v?.once), weeks: list(v?.weeks), waiting: list(v?.waiting) }
}

const quietly = (send: Send, e: ProductEvent) => {
  send(e).catch(() => {
    // a count lost to a dropped connection is not worth bothering anyone about
  })
}

export function countEvent(e: ProductEvent, send: Send = postCount): void {
  if (!countUseOn(loadPrefs())) {
    const c = counted()
    if (e === 'first_result' && !c.once.includes(e) && !c.waiting.includes(e)) saveJSON(KEY, { ...c, waiting: [...c.waiting, e] })
    return
  }
  if (ONCE.includes(e)) {
    const c = counted()
    if (c.once.includes(e)) return
    saveJSON(KEY, { ...c, once: [...c.once, e] })
  }
  quietly(send, e)
}

// noteMirrorWeek counts a return for another Mirror: the second different
// week's Mirror opened, once.
export function noteMirrorWeek(from: string, send: Send = postCount): void {
  if (!countUseOn(loadPrefs())) return
  const c = counted()
  if (c.weeks.includes(from) || c.weeks.length >= 2) return
  const weeks = [...c.weeks, from]
  saveJSON(KEY, { ...c, weeks })
  if (weeks.length === 2) countEvent('second_mirror', send)
}

// flushCounts sends what waited for a yes, once, now that the person said it.
export function flushCounts(send: Send = postCount): void {
  if (!countUseOn(loadPrefs())) return
  const c = counted()
  if (!c.waiting.length) return
  saveJSON(KEY, { ...c, waiting: [] })
  for (const e of c.waiting) if (e === 'first_result') countEvent(e, send)
}
