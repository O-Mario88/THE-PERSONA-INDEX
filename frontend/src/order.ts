import type { Option, Question } from './api'
import { load, save } from './storage'

// Answers are shown in an order of their own for each phone and question
// (the review of 2026-10-15, chosen 2026-10-16: shown shallow to deep, the
// first answer was nearly always the healthy one, which gave the game away).
// Depth stays in the data. The order is fixed for a phone, so a card never
// reshuffles while someone reads it, and a question that comes round again
// keeps its order.

const seedKey = 'pi.seed'

function seed(): string {
  let s = load(seedKey)
  if (!s) {
    s = Math.random().toString(36).slice(2, 10)
    save(seedKey, s)
  }
  return s
}

// fnv1a is a small, stable string hash.
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// The bank question behind a day's question id, "<date>-<bank id>".
const bankId = (id: string) => (/^\d{4}-\d{2}-\d{2}-/.test(id) ? id.slice(11) : id)

export function inOrder(q: Question): Option[] {
  const key = `${seed()}|${bankId(q.id)}|`
  const order = [...q.options]
    .map((o) => ({ o, h: fnv1a(key + o.id) }))
    .sort((a, b) => a.h - b.h || a.o.id.localeCompare(b.o.id))
    .map((x) => x.o)
  // A shuffle can land on shallow to deep by chance; then the first goes last.
  const depth = (o: Option) => o.depth ?? 1
  const shallowToDeep = order.every((o, i) => i === 0 || depth(order[i - 1]) <= depth(o))
  return shallowToDeep && order.some((o) => depth(o) !== depth(order[0])) ? [...order.slice(1), order[0]] : order
}
