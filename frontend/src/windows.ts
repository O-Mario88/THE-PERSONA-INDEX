// What each of the day's five windows has had: when it was done, kept on
// this phone for the day, and the moment Today was last looked at, for its
// "Since 07:51" line. Nothing here is sent.

import type { OpenWindow } from './day'
import { load, loadJSON, save, saveJSON } from './storage'

const doneKey = (date: string) => `pi.windows.${date}`

// windowsDone maps each window done today to the minute it was done.
export function windowsDone(date: string): Partial<Record<OpenWindow, number>> {
  const v = loadJSON(doneKey(date))
  return v && typeof v === 'object' ? (v as Partial<Record<OpenWindow, number>>) : {}
}

// markWindow notes a window as done at now, once.
export function markWindow(date: string, w: OpenWindow, now = new Date()) {
  const done = windowsDone(date)
  if (done[w] !== undefined) return
  done[w] = now.getHours() * 60 + now.getMinutes()
  saveJSON(doneKey(date), done)
}

const seenKey = 'pi.seen.v1'

// lastSeen is when Today was last opened before this visit, in ms, or null.
export function lastSeen(): number | null {
  const v = Number(load(seenKey))
  return Number.isFinite(v) && v > 0 ? v : null
}

export function noteSeen(now = Date.now()) {
  save(seenKey, String(now))
}
