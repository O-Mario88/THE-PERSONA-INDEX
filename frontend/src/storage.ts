// Everything the app keeps on this phone goes through here. Local storage
// can be missing, blocked (private mode) or full: then a value is kept in
// memory for the visit instead, and nothing ever throws. Every key starts
// with "pi.", so "Delete from this phone" can find them all.

export const PREFIX = 'pi.'

// Values that could not be written to local storage this visit.
const memory = new Map<string, string>()

// Listeners told of every key this tab writes or removes (the backup in
// vault.ts uses it to know when there is something new to back up).
const changed = new Set<(key: string) => void>()

export function onChange(fn: (key: string) => void): () => void {
  changed.add(fn)
  return () => changed.delete(fn)
}

function tell(key: string) {
  for (const fn of changed) {
    try {
      fn(key)
    } catch {
      // a listener's trouble is never the writer's
    }
  }
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function load(key: string): string | null {
  try {
    const v = store()?.getItem(key)
    if (v !== null && v !== undefined) return v
  } catch {
    // blocked: fall back to memory
  }
  return memory.get(key) ?? null
}

export function save(key: string, value: string) {
  try {
    const s = store()
    if (s) {
      s.setItem(key, value)
      memory.delete(key)
      tell(key)
      return
    }
  } catch {
    // full or blocked: keep it for this visit
  }
  memory.set(key, value)
  tell(key)
}

export function remove(key: string) {
  const had = load(key) !== null
  memory.delete(key)
  try {
    store()?.removeItem(key)
  } catch {
    // nothing to do
  }
  if (had) tell(key)
}

// keys lists every key kept under prefix, in local storage or memory.
export function keys(prefix = PREFIX): string[] {
  const out = new Set<string>()
  for (const k of memory.keys()) if (k.startsWith(prefix)) out.add(k)
  try {
    const s = store()
    if (s) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i)
        if (k?.startsWith(prefix)) out.add(k)
      }
    }
  } catch {
    // memory only
  }
  return [...out]
}

// loadJSON reads a JSON value, or null when it is missing or unreadable.
export function loadJSON(key: string): unknown {
  try {
    return JSON.parse(load(key) ?? 'null')
  } catch {
    return null
  }
}

export function saveJSON(key: string, value: unknown) {
  save(key, JSON.stringify(value))
}

// onOtherTab calls fn with the key another tab of the app changed (null when
// it cleared everything), so two tabs on one phone stay in step. It returns
// the function that stops listening.
export function onOtherTab(fn: (key: string | null) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) fn(e.key)
  }
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

// The date a question id starts with ("2026-10-12-..."), or null.
export function dateOf(questionId: string): string | null {
  return /^\d{4}-\d{2}-\d{2}-/.test(questionId) ? questionId.slice(0, 10) : null
}

// daysBetween counts whole days from one YYYY-MM-DD date to another.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000)
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
}
