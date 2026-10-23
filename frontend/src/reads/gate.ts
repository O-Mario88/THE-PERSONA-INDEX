// The quality gate for the reads (Phase 3 of the review of 2026-10-15): a
// short read for each life area and each trait side, in the companion voice,
// resting on research that stays out of sight. reads.test.ts runs it on the
// shipped reads, and the build refuses a read that fails it (vite.config.ts),
// the way the server refuses a card that fails the bank's gate.

import { THEMES } from '../themes'
import { TRAITS } from '../traits'
import { voiceProblems } from '../voice'
import type { Read, ReadSource } from './types'

// The citation library the cards use (backend/content/sources.json). A read
// that cites one of its keys must name it the same way.
export type Library = Record<string, { title: string; url: string; strength: string }>

export const WORDS_PER_MINUTE = 200
const LIMITS = {
  title: [10, 60],
  summary: [60, 170],
  try: [40, 240],
  paragraphs: [4, 9],
  paragraphWords: [25, 130],
  words: [350, 700],
  sources: [2, 6],
  supports: [20, 300],
} as const

// Research stays behind the words (Edwin, 2026-10-15: no evidence or sources
// on screen), and the app never sounds like a clinic.
const SHOWS_RESEARCH =
  /\b(stud(y|ies|ied)|research(ers?|ed)?|scientists?|scientific|experiments?|surveys?|percent|per cent|et al|according to|evidence|participants?|meta-analys\w*|data|statistic\w*|psycholog\w*|psychiatr\w*|therap(y|ies|ist|ists|eutic)|diagnos\w*|disorders?|clinical|symptoms?|patients?)\b|\d+\s*%|\b(19|20)\d\d\b/i

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const KEY = /^[a-z0-9_]+$/

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length
export const readWords = (r: Pick<Read, 'paragraphs'>) => r.paragraphs.reduce((n, p) => n + wordCount(p), 0)
export const minutes = (r: Pick<Read, 'paragraphs'>) => Math.max(1, Math.round(readWords(r) / WORDS_PER_MINUTE))

// sentences splits running text where a sentence ends.
const sentences = (s: string) => s.split(/(?<=[.!?])\s+(?=["“‘'A-Z0-9])/).filter(Boolean)

// The trait sides a read can be about: "rumination.high", "rumination.low"…
export const TRAIT_SIDES = Object.keys(TRAITS).flatMap((t) => [`${t}.high`, `${t}.low`])

// readProblems lists what one read gets wrong, as short notes.
export function readProblems(r: Read, library: Library): string[] {
  const out: string[] = []
  const where = r.slug || '(no slug)'
  const len = (field: string, s: unknown, [lo, hi]: readonly [number, number]) => {
    if (typeof s !== 'string') return out.push(`${where}: ${field} is missing`)
    if (s.length < lo || s.length > hi) out.push(`${where}: ${field} is ${s.length} characters, needs ${lo} to ${hi}`)
  }

  if (typeof r.slug !== 'string' || !SLUG.test(r.slug) || r.slug.length > 60) out.push(`${where}: slug must be lowercase words joined by dashes`)
  len('title', r.title, LIMITS.title)
  if (typeof r.title === 'string' && (/[.!]$/.test(r.title) || !/^[A-Z]/.test(r.title))) {
    out.push(`${where}: title starts with a capital and has no full stop`)
  }
  if (r.kind === 'theme') {
    if (!THEMES[r.key]) out.push(`${where}: ${r.key} is not a life area`)
  } else if (r.kind === 'trait') {
    if (!TRAIT_SIDES.includes(r.key)) out.push(`${where}: ${r.key} is not a trait side (trait.high or trait.low)`)
  } else {
    out.push(`${where}: kind must be theme or trait`)
  }
  len('summary', r.summary, LIMITS.summary)
  if (typeof r.summary === 'string' && !/[.?]$/.test(r.summary)) out.push(`${where}: summary ends with a full stop`)
  len('try', r.try, LIMITS.try)

  const paras = Array.isArray(r.paragraphs) ? r.paragraphs : []
  const [pLo, pHi] = LIMITS.paragraphs
  if (paras.length < pLo || paras.length > pHi) out.push(`${where}: ${paras.length} paragraphs, needs ${pLo} to ${pHi}`)
  paras.forEach((p, i) => {
    const n = typeof p === 'string' ? wordCount(p) : 0
    const [lo, hi] = LIMITS.paragraphWords
    if (n < lo || n > hi) out.push(`${where}: paragraph ${i + 1} has ${n} words, needs ${lo} to ${hi}`)
  })
  const words = readWords({ paragraphs: paras.filter((p) => typeof p === 'string') })
  if (words < LIMITS.words[0] || words > LIMITS.words[1]) {
    out.push(`${where}: ${words} words, needs ${LIMITS.words[0]} to ${LIMITS.words[1]} (about three minutes)`)
  }

  const shown: [string, string][] = [
    ['title', r.title],
    ['summary', r.summary],
    ['try', r.try],
    ...paras.map((p, i): [string, string] => [`paragraph ${i + 1}`, p]),
  ]
  for (const [field, text] of shown) {
    if (typeof text !== 'string') continue
    const research = text.match(SHOWS_RESEARCH)
    if (research) out.push(`${where}: ${field} shows research or clinical words ("${research[0]}")`)
    if (text.includes('!')) out.push(`${where}: ${field} has an exclamation mark`)
    for (const s of sentences(text)) {
      for (const p of voiceProblems(s)) out.push(`${where}: ${field} ${p}: "${s}"`)
    }
  }

  const srcs: ReadSource[] = Array.isArray(r.sources) ? r.sources : []
  const [sLo, sHi] = LIMITS.sources
  if (srcs.length < sLo || srcs.length > sHi) out.push(`${where}: ${srcs.length} sources, needs ${sLo} to ${sHi}`)
  const seen = new Set<string>()
  for (const s of srcs) {
    const at = `${where}: source ${s.key}`
    if (typeof s.key !== 'string' || !KEY.test(s.key)) out.push(`${at}: key must be lowercase letters, digits and underscores`)
    if (seen.has(s.key)) out.push(`${at}: cited twice`)
    seen.add(s.key)
    if (typeof s.title !== 'string' || s.title.length < 4 || s.title.length > 80) out.push(`${at}: title needs 4 to 80 characters`)
    if (typeof s.url !== 'string' || !s.url.startsWith('https://') || /[\s"<>]/.test(s.url)) out.push(`${at}: url must be a plain https link`)
    if (!['strong', 'moderate', 'early'].includes(s.strength)) out.push(`${at}: strength must be strong, moderate or early`)
    len(`source ${s.key} supports`, s.supports, LIMITS.supports)
    const known = library[s.key]
    if (known && (known.title !== s.title || known.url !== s.url)) {
      out.push(`${at}: the card library names it "${known.title}" at ${known.url}; use the same title and link`)
    }
  }
  return out
}

// readsProblems checks every read, and that together they cover each life
// area and each trait side exactly once. partial skips the coverage, for a
// batch checked on its own.
export function readsProblems(reads: Read[], library: Library, partial = false): string[] {
  const out = reads.flatMap((r) => readProblems(r, library))
  const slugs = new Map<string, number>()
  const keys = new Map<string, number>()
  for (const r of reads) {
    slugs.set(r.slug, (slugs.get(r.slug) ?? 0) + 1)
    keys.set(`${r.kind}:${r.key}`, (keys.get(`${r.kind}:${r.key}`) ?? 0) + 1)
  }
  for (const [slug, n] of slugs) if (n > 1) out.push(`${slug}: slug used ${n} times`)
  for (const [key, n] of keys) if (n > 1) out.push(`${key}: ${n} reads, needs one`)
  if (!partial) {
    for (const theme of Object.keys(THEMES)) if (!keys.has(`theme:${theme}`)) out.push(`life area ${theme} has no read`)
    for (const side of TRAIT_SIDES) if (!keys.has(`trait:${side}`)) out.push(`trait side ${side} has no read`)
  }
  return out
}
