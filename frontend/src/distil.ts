// "Distil into a clear thought" (Edwin's brief, 2026-10-29), done on the
// phone with no model and no server: it keeps the person's own words, only
// fewer of them. First the "um"s, "you know"s, softeners and doubled words
// come out; then, from a longer ramble, it keeps the one or two sentences
// that say the most about what happened and how it felt, in the order they
// were said. It never adds a word the person didn't say.

// Sounds made only to keep talking.
const FILLERS = /\b(?:u+m+|u+h+|e+r+m*|a+h+|h+m+|m{2,})\b[,.]?\s*/gi
// Phrases that pad or soften a sentence; a clear thought does without them.
const PADDING = /,?\s*\b(?:you know|i mean|kind of|sort of|basically|literally|actually)\b,?/gi
// "like" said as a pause, between commas or before one.
const LIKE = /,?\s*\blike\b,\s*/gi
// Ways of starting a sentence that only lead in.
const LEAD = /^(?:(?:and\s+)?so|well|okay|ok|right|yeah|anyway|anyways|honestly)\b[,\s]*/i
// A word said twice in a row, as speech does ("I I"), except where English doubles it.
const DOUBLED = /\b(\w+)(?:\s+\1\b)+/gi
const KEEP_DOUBLED = new Set(['had', 'that'])

const FEELING =
  /\b(?:felt|feel|feeling|tired|exhausted|stretched|angry|annoyed|sad|happy|glad|worried|anxious|stressed|calm|lighter|heavy|proud|hurt|frustrated|overwhelmed|excited|scared|afraid|relieved|grateful|lonely|ashamed|guilty|nervous|upset|hopeful|confused)\b/i
const SELF = /\b(?:i|i'm|i’m|i've|i’ve|me|my|myself)\b/i
const WHY = /\b(?:because|since|after|when)\b/i

const SHORT_WORDS = 30 // a thought this short stays whole, only tidied
const MAX_WORDS = 45 // the most two kept sentences may run to
const CAP_WORDS = 35 // a stretch without full stops is cut near here
const MIN_CUT = 12 // never cut before this many words

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

function tidySentence(raw: string): string {
  let s = raw.trim()
  for (let prev = ''; prev !== s;) {
    prev = s
    s = s.replace(LEAD, '').trim()
  }
  s = s.replace(DOUBLED, (all, w: string) => (KEEP_DOUBLED.has(w.toLowerCase()) ? all : w))
  s = s
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,;:])(?=[,.!?;:])/g, '')
    .replace(/^[,;:\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!/[\p{L}\p{N}]/u.test(s)) return ''
  s = s.replace(/\bi\b/g, 'I').replace(/\bi(['’](?:m|ve|ll|d))\b/g, 'I$1')
  s = s.charAt(0).toUpperCase() + s.slice(1)
  return /[.!?…]$/.test(s) ? s : `${s.replace(/[,;:]+$/, '')}.`
}

// The sentences of what was said, tidied, the empty ones gone.
function sentencesOf(raw: string): string[] {
  const cleaned = raw.replace(/\s+/g, ' ').replace(FILLERS, ' ').replace(PADDING, '').replace(LIKE, ' ')
  return (cleaned.match(/[^.!?…]+[.!?…]*/g) ?? []).map(tidySentence).filter(Boolean)
}

// How much two sentences share, by their longer words (0 to 1).
const REPEAT = 0.4
const keyWords = (s: string) => new Set(s.toLowerCase().match(/[\p{L}'’]{4,}/gu) ?? [])
function overlap(a: string, b: string): number {
  const x = keyWords(a)
  const y = keyWords(b)
  const both = [...x].filter((w) => y.has(w)).length
  const either = new Set([...x, ...y]).size
  return either ? both / either : 0
}

function score(s: string): number {
  const n = wordCount(s)
  return (FEELING.test(s) ? 3 : 0) + (SELF.test(s) ? 1 : 0) + (WHY.test(s) ? 1 : 0) + Math.min(n, 20) / 20 - (n < 4 ? 2 : 0)
}

// A long stretch with no full stops, cut at the last natural break.
function cut(s: string): string {
  const ws = s.replace(/[.!?…]+$/, '').split(/\s+/)
  if (ws.length <= CAP_WORDS) return s
  const head = ws.slice(0, CAP_WORDS)
  let at = head.length
  for (let i = head.length - 1; i >= MIN_CUT; i--) {
    if (/,$/.test(head[i - 1]) || /^(?:and|but|because|so|then)$/i.test(head[i])) {
      at = i
      break
    }
  }
  return `${head
    .slice(0, at)
    .join(' ')
    .replace(/[,;:]+$/, '')}…`
}

export function distil(raw: string): string {
  const sentences = sentencesOf(raw)
  if (sentences.length === 0) return ''
  const all = sentences.join(' ')
  if (sentences.length === 1) return cut(sentences[0])
  if (sentences.length <= 2 && wordCount(all) <= SHORT_WORDS) return all
  const ranked = sentences.map((s, i) => ({ s, i, v: score(s) })).sort((a, b) => b.v - a.v || a.i - b.i)
  const kept = [ranked[0]]
  // The next best that adds something: never one that mostly repeats the first.
  const second = ranked.slice(1).find((r) => overlap(r.s, ranked[0].s) < REPEAT)
  if (second && wordCount(ranked[0].s) + wordCount(second.s) <= MAX_WORDS) kept.push(second)
  return kept
    .sort((a, b) => a.i - b.i)
    .map((k) => cut(k.s))
    .join(' ')
}
