// The conversation sheet (Edwin's brief, 2026-10-29: "Bring to a
// Conversation"). One page of someone's recent days to bring to a
// counsellor, a mentor, a pastor or a friend, so the conversation starts
// from the whole fortnight and not just this morning.
//
// It is made on the phone from what the phone already keeps: answers,
// readings, steps and their check-ins, good things and, only when the person
// turns them on and ticks them one by one, their own words. Nothing is sent
// anywhere; the person shares the page if and when they choose. An intimacy
// answer never appears, and a heavy one is never quoted.

import { stepWords, type CheckIn, type Feeling } from './growthJourney'
import type { CardText } from './insights'
import { dateOf, locale } from './locale'
import type { Move } from './moves'
import { isNeed, NEED_PHRASES, type Need } from './needs'
import type { GoodThings, Reflection } from './notebook'
import { freeLeft, isPatron } from './patron'
import type { AnswerRecord, History } from './profile'
import { AREA_NAMES, areaOf } from './reflect'
import { splitReveal } from './reveal'
import { addDays } from './storage'

export type SheetRange = 7 | 14 | 30
export const SHEET_RANGES: readonly SheetRange[] = [7, 14, 30]

// What goes in. Own words start off: they come in only one by one.
export type SheetParts = { patterns: boolean; steps: boolean; good: boolean; words: boolean }
export const DEFAULT_PARTS: SheetParts = { patterns: true, steps: true, good: true, words: false }

export type SheetInput = {
  today: string
  range: SheetRange
  parts: SheetParts
  history: History
  moves: Move[]
  checks: CheckIn[]
  textOf: (questionId: string) => CardText | null
  good: GoodThings[]
  written: Reflection[]
  picked: string[] // the ids of the reflections and moments the person ticked
  name?: string
}

export type SheetSide = { label: string; text: string }
export type SheetWords = { date: string; question: string | null; text: string }

// A part the person left out is null; a part with nothing in it yet is empty.
export type Sheet = {
  from: string
  to: string
  range: SheetRange
  name: string | null
  energy: { areas: string[]; line: string } | null
  sides: SheetSide[] | null
  tried: string[] | null
  talk: string[]
  good: string | null
  words: SheetWords[] | null
}

export const BOX_TITLES = {
  energy: 'Where my energy went',
  tried: 'What I tried in real life',
  talk: 'Worth talking through',
  good: 'Good things',
  words: 'In my own words',
} as const

export const SHEET_EMPTY = {
  sides: 'Not enough readings from these days yet.',
  tried: 'No steps checked in on in these days yet.',
} as const

export const SHEET_FOOTER = 'Made on my phone with The Persona Index. The readings are things to think about, never a diagnosis. Nothing on this page was sent anywhere.'

const WORDS_MAX = 600
const TRIED_MAX = 4
const CHOICES_MAX = 20

export function sheetTitles(range: SheetRange): { title: string; sides: string } {
  const sides = range === 7 ? 'Both sides of my week' : range === 14 ? 'Both sides of my last two weeks' : 'Both sides of my month'
  return { title: `My last ${range} days`, sides }
}

// "23–29 October 2026" (or "October 23 – 29, 2026"), as the phone writes a span of days.
export function sheetDates(s: Pick<Sheet, 'from' | 'to'>): string {
  try {
    const f = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) as Intl.DateTimeFormat & {
      formatRange?: (a: Date, b: Date) => string
    }
    if (typeof f.formatRange === 'function') return f.formatRange(new Date(`${s.from}T00:00:00Z`), new Date(`${s.to}T00:00:00Z`))
  } catch {
    // an engine without ranges writes both days in full
  }
  return `${dateOf(s.from, { day: 'numeric', month: 'long' })} to ${dateOf(s.to, { day: 'numeric', month: 'long', year: 'numeric' })}`
}

// ---- who can make which sheet ----

// open: anyone may make it; trial: it uses the one free longer sheet;
// patron: across 14 or 30 days it is part of Patron.
export type SheetGate = 'open' | 'trial' | 'patron'

export function sheetGate(range: SheetRange, today: string): SheetGate {
  if (range === 7 || isPatron(today)) return 'open'
  return freeLeft('sheet') > 0 ? 'trial' : 'patron'
}

// ---- making it ----

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const listOf = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The keys that came up most, then the most recent, then by name.
function topBy<T extends { date: string }>(xs: T[], key: (x: T) => string, n: number): string[] {
  const seen = new Map<string, { count: number; latest: string }>()
  for (const x of xs) {
    const k = key(x)
    const s = seen.get(k)
    seen.set(k, { count: (s?.count ?? 0) + 1, latest: s && s.latest > x.date ? s.latest : x.date })
  }
  return [...seen.entries()]
    .sort(([ka, a], [kb, b]) => b.count - a.count || b.latest.localeCompare(a.latest) || ka.localeCompare(kb))
    .slice(0, n)
    .map(([k]) => k)
}

const needsOf = (answers: AnswerRecord[]): Need[] =>
  topBy(
    answers.filter((a) => isNeed(a.need)),
    (a) => a.need as Need,
    2,
  ) as Need[]

// The sheet is in the person's own voice, so "yourself" becomes "myself".
const NEED_MINE: Record<Need, string> = { ...NEED_PHRASES, freedom: 'choosing for myself' }
const areaMine = (theme: string) => (areaOf(theme) === 'self' ? 'Myself' : AREA_NAMES[areaOf(theme)])

function energyOf(answers: AnswerRecord[]): NonNullable<Sheet['energy']> {
  if (answers.length === 0) return { areas: [], line: 'No answers in these days yet.' }
  const areas = topBy(answers, (a) => areaMine(a.theme), 3)
  const needs = needsOf(answers).map((n) => NEED_MINE[n])
  const days = new Set(answers.map((a) => a.date)).size
  const count = `From ${plural(answers.length, 'answer')} on ${plural(days, 'day')}.`
  return { areas, line: needs.length ? `${count} What I reached for most was ${listOf(needs)}.` : count }
}

// The ones the person said sound like them first, then partly, then the rest.
const rankOf = (a: AnswerRecord) => (a.verdict === 'me' ? 0 : a.verdict === 'partly' ? 1 : 2)

// Readings from these days, never one the person said wasn't them or a
// heavy one, the closest first and then the newest.
function readingsOf(answers: AnswerRecord[], textOf: SheetInput['textOf']) {
  return answers
    .filter((a) => a.verdict !== 'not_me' && !a.heavy)
    .flatMap((a) => {
      const t = textOf(a.questionId)
      return t?.reveal ? [{ a, t, reveal: t.reveal }] : []
    })
    .sort((x, y) => rankOf(x.a) - rankOf(y.a) || y.a.date.localeCompare(x.a.date))
}

function sidesOf(answers: AnswerRecord[], textOf: SheetInput['textOf']): SheetSide[] {
  const readings = readingsOf(answers, textOf)
  const first = readings[0]
  if (!first) return []
  const label = first.a.verdict === 'me' ? 'What sounded like me' : first.a.verdict === 'partly' ? 'What partly sounded like me' : 'One reading from these days'
  const out: SheetSide[] = [{ label, text: splitReveal(first.reveal).headline }]
  const other = readings.find((x) => x.t.otherSide)
  if (other?.t.otherSide) out.push({ label: 'The other side of it', text: other.t.otherSide })
  return out
}

const FELT: Record<Feeling, string> = {
  lighter: 'I felt a little lighter',
  same: 'I felt about the same',
  unsettled: 'I felt more unsettled',
  unsure: 'I wasn’t sure yet how I felt',
}

type TriedLine = { date: string; line: string; harder: string | null }

// The steps that helped or made things harder in these days, in the
// person's own check-in terms; a step that made no difference stays out.
function triedOf(moves: Move[], checks: CheckIn[], inRange: (d: string) => boolean): TriedLine[] {
  const out: TriedLine[] = []
  for (const m of moves) {
    const step = stepWords(m.step)
    const c = checks.find((x) => x.questionId === m.questionId)
    if (c) {
      if (!inRange(c.date)) continue
      if (c.outcome === 'helped' || c.outcome === 'helped_little') {
        const how = c.outcome === 'helped' ? 'it helped' : 'it helped a little'
        out.push({ date: c.date, line: `Tried “${step}”: ${how}${c.feeling ? `, and ${FELT[c.feeling]}` : ''}.`, harder: null })
      } else if (c.outcome === 'harder') {
        out.push({ date: c.date, line: `Tried “${step}”: it made things harder.`, harder: m.step })
      }
    } else if (m.status === 'helped' && inRange(m.date)) {
      out.push({ date: m.date, line: `Tried “${step}”: it helped.`, harder: null })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

const FALLBACK_TALK = ['What would make the coming week feel a little lighter?', 'What would I most like this conversation to help me with?']

// Two open questions from what is still unresolved: a step that made things
// harder, a reading the person said only partly fits (or doesn't), the need
// that kept coming up; then two that fit any week.
function talkOf(i: SheetInput, answers: AnswerRecord[], tried: TriedLine[]): string[] {
  const out: string[] = []
  const harder = i.parts.steps ? tried.find((t) => t.harder)?.harder : null
  if (harder) out.push(`Trying “${stepWords(harder)}” made things harder. What got in the way?`)
  if (i.parts.patterns) {
    const unsure = answers
      .filter((a) => (a.verdict === 'partly' || a.verdict === 'not_me') && !a.heavy)
      .flatMap((a) => {
        const t = i.textOf(a.questionId)
        return t?.reveal ? [{ a, headline: stepWords(splitReveal(t.reveal).headline) }] : []
      })
      .sort((x, y) => y.a.date.localeCompare(x.a.date))[0]
    if (unsure)
      out.push(
        unsure.a.verdict === 'partly'
          ? `A reading said “${unsure.headline}”, and I said it only partly fits. Which part doesn’t?`
          : `A reading said “${unsure.headline}”, and I said it isn’t me. What would be closer?`,
      )
    const need = needsOf(answers)[0]
    if (need) out.push(`${cap(NEED_MINE[need])} kept coming up. Where would I like more of it right now?`)
  }
  return [...out, ...FALLBACK_TALK].slice(0, 2)
}

// Good things, by the words in them, only to say what they were mostly
// about. The lines themselves never go on the sheet.
const GOOD_KINDS: [string, RegExp][] = [
  [
    'time with people',
    /\b(friends?|family|mum|mom|mother|dad|father|sister|brother|son|daughter|kids?|children|child|wife|husband|partner|colleagues?|grandma|grandpa|aunt|uncle|cousin|neighbou?rs?|called|visited|chat|chatted|laughed|together)\b/i,
  ],
  ['rest', /\b(sleep|slept|nap|napped|rest|rested|quiet|bath|relaxed?)\b/i],
  ['being outdoors', /\b(walk|walked|park|garden|sunshine|sun|rain|sky|sea|beach|trees?|nature|outside|hike|hiked)\b/i],
  ['food', /\b(lunch|dinner|breakfast|meal|food|coffee|tea|cake|cooked|cooking|ate)\b/i],
  ['getting things done', /\b(finished|done|completed|project|report|task|progress|passed|fixed|cleaned)\b/i],
  ['faith', /\b(church|mosque|prayer|prayed|pray|worship|temple)\b/i],
]

function goodOf(entries: GoodThings[], range: SheetRange): string {
  const lines = entries.flatMap((g) => g.lines.map((l) => l.trim()).filter(Boolean))
  const days = entries.filter((g) => g.lines.some((l) => l.trim())).length
  if (days === 0) return 'No good things noted in these days.'
  const kinds = GOOD_KINDS.map(([name, re]) => ({ name, n: lines.filter((l) => re.test(l)).length }))
    .filter((k) => k.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 2)
    .map((k) => k.name)
  return `I noted good things on ${days} of these ${range} days${kinds.length ? `, most often about ${listOf(kinds)}` : ''}.`
}

const clip = (s: string, n: number) => {
  if (s.length <= n) return s
  const cut = s.slice(0, n)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 20)).trimEnd()}…`
}

// The reflections and moments of those days, to tick one by one.
export function wordsChoices(written: Reflection[], from: string, to: string): Reflection[] {
  return written
    .filter((r) => r.date >= from && r.date <= to && r.answer.trim())
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
    .slice(0, CHOICES_MAX)
}

export function makeSheet(i: SheetInput): Sheet {
  const from = addDays(i.today, -(i.range - 1))
  const to = i.today
  const inRange = (d: string) => d >= from && d <= to
  const answers = i.history.answers.filter((a) => inRange(a.date) && a.theme !== 'intimacy')
  const tried = triedOf(i.moves, i.checks, inRange)
  const picked = new Set(i.picked)
  return {
    from,
    to,
    range: i.range,
    name: i.name?.trim() || null,
    energy: i.parts.patterns ? energyOf(answers) : null,
    sides: i.parts.patterns ? sidesOf(answers, i.textOf) : null,
    tried: i.parts.steps ? tried.slice(0, TRIED_MAX).map((t) => t.line) : null,
    talk: talkOf(i, answers, tried),
    good: i.parts.good
      ? goodOf(
          i.good.filter((g) => inRange(g.date)),
          i.range,
        )
      : null,
    words: i.parts.words
      ? wordsChoices(i.written, from, to)
          .filter((r) => picked.has(r.id))
          .map((r) => ({ date: r.date, question: r.source === 'moment' || r.free || !r.question.trim() ? null : r.question, text: clip(r.answer.trim(), WORDS_MAX) }))
      : null,
  }
}

// ---- the page ----

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

// The sprout, from mobile/assets/brand/mark.svg, in flat colours for print.
const SPROUT =
  '<svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true"><path d="M48 94 C47 82 47.5 70 50.5 60" fill="none" stroke="#5ba539" stroke-width="3.6" stroke-linecap="round"/><path d="M46.5 63 C28 68 4 52 4 19 C26 18 44 36 46.5 63 Z" fill="#2f7334"/><path d="M49.5 76 C79 70 96 42 94 4 C63 12 44 42 49.5 76 Z" fill="#c1e863"/><path d="M51.5 71 C55 54 65 36 80 21" fill="none" stroke="#0b1c2c" stroke-width="1.9" stroke-linecap="round"/></svg>'

// A font's address goes inside the page's style as it is, so only a plain
// one is used: no quote, bracket, backslash or angle bracket can get in.
const cssUrl = (u: string | undefined): boolean => !!u && /^[\w\-.:/?&=%+,;~#]+$/.test(u)

const box = (title: string, body: string, n?: number, wide = false) => `<section class="box${wide ? ' wide' : ''}"><h2>${n ? `<span class="num">${n}</span>` : ''}${esc(title)}</h2>${body}</section>`

// sheetHTML writes the sheet as one printable page, in Midnight & Cream.
// fonts: Geist's files as URLs or data URIs; without them the phone's own
// face is used. Every word is escaped.
export function sheetHTML(s: Sheet, fonts?: { regular?: string; bold?: string }): string {
  const t = sheetTitles(s.range)
  let n = 0
  const boxes: string[] = []
  if (s.energy) {
    const tags = s.energy.areas.length ? `<div class="tags">${s.energy.areas.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : ''
    boxes.push(box(BOX_TITLES.energy, `${tags}<p>${esc(s.energy.line)}</p>`, ++n))
  }
  if (s.sides) {
    const body = s.sides.length ? s.sides.map((x) => `<div class="label">${esc(x.label)}</div><p class="quote">“${esc(x.text)}”</p>`).join('') : `<p class="muted">${esc(SHEET_EMPTY.sides)}</p>`
    boxes.push(box(t.sides, body, ++n))
  }
  if (s.tried) {
    const body = s.tried.length ? `<ul>${s.tried.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : `<p class="muted">${esc(SHEET_EMPTY.tried)}</p>`
    boxes.push(box(BOX_TITLES.tried, body, ++n))
  }
  boxes.push(box(BOX_TITLES.talk, `<ol>${s.talk.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>`, ++n))
  if (s.good) boxes.push(box(BOX_TITLES.good, `<p>${esc(s.good)}</p>`, undefined, true))
  if (s.words?.length) {
    const body = s.words
      .map((w) => `<div class="label">${esc(dateOf(w.date, { day: 'numeric', month: 'long' }))}${w.question ? ` · ${esc(w.question)}` : ''}</div><p class="quote">${esc(w.text)}</p>`)
      .join('')
    boxes.push(box(BOX_TITLES.words, body, undefined, true))
  }
  const face = [
    cssUrl(fonts?.regular) ? `@font-face{font-family:'Geist';src:url('${fonts?.regular}');font-weight:400}` : '',
    cssUrl(fonts?.bold) ? `@font-face{font-family:'Geist';src:url('${fonts?.bold}');font-weight:700}` : '',
  ].join('')
  const who = s.name ? ` · ${esc(s.name)}` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.title)}</title><style>${face}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#f6f1e8}
body{font-family:Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c2c;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{background:#0b1c2c;color:#f6f1e8;padding:24px 32px 20px;display:flex;gap:14px;align-items:center}
.eyebrow{color:#c1e863;font-size:11px;font-weight:700}
h1{margin:4px 0 2px;font-size:25px;line-height:1.15;letter-spacing:-0.4px}
.meta{color:#b9c6d0;font-size:12px}
main{padding:20px 32px 0;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{background:#fffefa;border:1px solid #e4dccd;border-radius:12px;padding:14px 16px;break-inside:avoid}
.box.wide{grid-column:1/-1}
h2{margin:0 0 8px;font-size:13.5px;color:#013d5a;display:flex;gap:8px;align-items:center}
.num{display:inline-block;width:18px;height:18px;border-radius:9px;background:#0b1c2c;color:#c1e863;font-size:11px;line-height:18px;text-align:center;flex:none}
p,li{font-size:12.5px;line-height:1.45}
p{margin:0 0 6px}
ul,ol{margin:0;padding-left:18px}
li{margin-bottom:4px}
.tags span{display:inline-block;background:#eef3e0;color:#24420f;border-radius:6px;padding:3px 8px;margin:0 6px 6px 0;font-size:11.5px;font-weight:700}
.label{font-size:10.5px;font-weight:700;color:#6f6556;margin:6px 0 2px}
.quote{border-left:3px solid #f4a258;padding-left:9px}
.muted{color:#6f6556}
footer{padding:14px 32px 24px;color:#6f6556;font-size:10.5px}
</style></head><body><header>${SPROUT}<div><div class="eyebrow">To bring to a conversation</div><h1>${esc(t.title)}</h1><div class="meta">${esc(sheetDates(s))}${who}</div></div></header><main>${boxes.join('')}</main><footer>${esc(SHEET_FOOTER)}</footer></body></html>`
}
