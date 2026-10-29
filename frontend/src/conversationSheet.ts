// Bring to a Conversation (Edwin's brief, 2026-10-29): a short brief to take
// into a conversation with a partner, a manager, a mentor or coach, a
// counsellor or a friend, so it starts from what matters and not from a
// blank. Five parts: what I want to discuss, the moments I chose, what I felt
// or needed, what I tried and what happened, and the questions or requests I
// want to bring. The person reads and edits every part before anything is
// printed or shared, and nothing is ever sent by itself.
//
// It is made on the phone from what the phone already keeps: answers and the
// needs behind them, steps and how they went, the hard moments made sense of
// (makeSense.ts), and only the reflections and moments the person ticks. An
// intimacy answer never appears, a heavy one is never quoted, and a brief for
// a manager carries nothing personal unless the person writes it in.
// One complete brief is free; after that, briefs are part of Patron.

import { stepWords, type CheckIn, type Feeling } from './growthJourney'
import type { CardText } from './insights'
import { dateOf, locale } from './locale'
import type { Move } from './moves'
import { isNeed, NEED_PHRASES, type Need } from './needs'
import type { Intention, Reflection } from './notebook'
import { freeLeft, isPatron } from './patron'
import type { AnswerRecord, History } from './profile'
import { AREA_NAMES, areaOf } from './reflect'
import { splitReveal } from './reveal'
import { addDays } from './storage'

export type SheetRange = 7 | 14 | 30
export const SHEET_RANGES: readonly SheetRange[] = [7, 14, 30]

export type BriefFor = 'partner' | 'manager' | 'mentor' | 'counsellor' | 'friend'
export const BRIEF_FOR: { id: BriefFor; label: string; purpose: string; placeholder: string }[] = [
  { id: 'partner', label: 'My partner', purpose: 'Help me explain this to my partner.', placeholder: 'Lately I’ve been feeling…' },
  { id: 'manager', label: 'My manager', purpose: 'Help me prepare for my manager.', placeholder: 'I’d like to talk about…' },
  { id: 'mentor', label: 'A mentor or coach', purpose: 'Help me get the most from my next session.', placeholder: 'I’d like to work on…' },
  { id: 'counsellor', label: 'A counsellor or therapist', purpose: 'Help me remember what to discuss in my session.', placeholder: 'Since we last spoke…' },
  { id: 'friend', label: 'A friend', purpose: 'Help me say what’s been on my mind.', placeholder: 'There’s something I’ve been thinking about…' },
]

const TITLES: Record<BriefFor, string> = {
  partner: 'To talk through with my partner',
  manager: 'To talk through with my manager',
  mentor: 'For my next mentoring session',
  counsellor: 'For my next session',
  friend: 'To talk through with a friend',
}
export const briefTitle = (f: BriefFor): string => TITLES[f]

export type SheetInput = {
  today: string
  range: SheetRange
  for: BriefFor
  discuss: string
  history: History
  moves: Move[]
  checks: CheckIn[]
  intentions: Intention[]
  textOf: (questionId: string) => CardText | null
  written: Reflection[]
  picked: string[] // the ids of the reflections and moments the person ticked
  name?: string
}

export type SheetWords = { date: string; question: string | null; text: string }

export type Sheet = {
  from: string
  to: string
  range: SheetRange
  for: BriefFor
  name: string | null
  discuss: string
  moments: SheetWords[]
  felt: string[]
  tried: string[]
  bring: string[]
}

export const SECTION_TITLES = ['What I want to discuss', 'Moments I chose', 'What I felt or needed', 'What I tried, and what happened', 'Questions or requests I want to bring'] as const

export const SHEET_EMPTY = {
  discuss: 'Nothing written yet.',
  moments: 'No moments chosen.',
  felt: 'Nothing noted from these days yet.',
  tried: 'Nothing tried in these days yet.',
  bring: 'No questions yet.',
} as const

export const SHEET_FOOTER = 'Made on my phone with The Persona Index. Anything it noticed is something to think about, never a diagnosis. Nothing on this page was sent anywhere.'

const WORDS_MAX = 600
const TRIED_MAX = 4
const BRING_MAX = 3
const CHOICES_MAX = 20

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

// ---- who can make a brief ----

// trial: the one free brief; patron: briefs are part of Patron.
export type SheetGate = 'open' | 'trial' | 'patron'

export function sheetGate(today: string): SheetGate {
  if (isPatron(today)) return 'open'
  return freeLeft('sheet') > 0 ? 'trial' : 'patron'
}

// ---- making it ----

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

// The steps they kept from hard moments or Reflect, as they said they went,
// and one not reported on yet as just that.
function keptOf(intentions: Intention[], inRange: (d: string) => boolean): TriedLine[] {
  return intentions.flatMap((i) => {
    const on = i.checkedOn ?? i.date
    if (!inRange(on)) return []
    const step = stepWords(i.text)
    if (!i.check) return [{ date: on, line: `Chose to try “${step}”: too soon to say how it went.`, harder: null }]
    if (i.check === 'helped') return [{ date: on, line: `Tried “${step}”: it helped.`, harder: null }]
    if (i.check === 'some') return [{ date: on, line: `Tried “${step}”: it helped a little.`, harder: null }]
    if (i.check === 'not_yet') return [{ date: on, line: `Planned “${step}”: I haven’t managed it yet.`, harder: null }]
    return []
  })
}

// What came up most, in the person's own voice.
function feltOf(i: SheetInput, answers: AnswerRecord[], inRange: (d: string) => boolean): string[] {
  const out: string[] = []
  const starts = i.written.filter((r) => r.source === 'sense' && r.start !== 'reflect' && inRange(r.date) && r.question.trim()).map((r) => r.question.trim())
  out.push(...[...new Set(starts)].slice(0, 2))
  if (answers.length) {
    const areas = topBy(answers, (a) => areaMine(a.theme), 3).map((a) => a.charAt(0).toLowerCase() + a.slice(1))
    out.push(`Where my energy went: ${areas.join(', ')}.`)
    const needs = needsOf(answers).map((n) => NEED_MINE[n])
    if (needs.length) out.push(`What I reached for most was ${listOf(needs)}.`)
  }
  return out
}

const FOR_QUESTION: Record<BriefFor, string> = {
  partner: 'What would help us both feel heard this week?',
  manager: 'What would make my work feel more manageable right now?',
  mentor: 'What should I focus on before we next meet?',
  counsellor: 'What would I most like this session to help me with?',
  friend: 'Can I tell you what’s been on my mind lately?',
}

// Questions from what is still unresolved: a step that made things harder,
// then (for a counsellor or a mentor) a reading that only partly fits, then
// (for anyone but a manager) the need that kept coming up; then one that
// suits who it's for.
function bringOf(i: SheetInput, answers: AnswerRecord[], tried: TriedLine[]): string[] {
  const out: string[] = []
  const harder = tried.find((t) => t.harder)?.harder
  if (harder) out.push(`Trying “${stepWords(harder)}” made things harder. What got in the way?`)
  if (i.for === 'counsellor' || i.for === 'mentor') {
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
  }
  if (i.for !== 'manager') {
    const need = needsOf(answers)[0]
    if (need) out.push(`${cap(NEED_MINE[need])} kept coming up. Where would I like more of it right now?`)
  }
  return (out.length < BRING_MAX ? [...out, FOR_QUESTION[i.for]] : out).slice(0, BRING_MAX)
}

// The person's edits to a part, one item a line.
export const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

export function makeSheet(i: SheetInput): Sheet {
  const from = addDays(i.today, -(i.range - 1))
  const to = i.today
  const inRange = (d: string) => d >= from && d <= to
  const answers = i.history.answers.filter((a) => inRange(a.date) && a.theme !== 'intimacy')
  const fromMoves = triedOf(i.moves, i.checks, inRange)
  const tried = [...keptOf(i.intentions, inRange), ...fromMoves].sort((a, b) => b.date.localeCompare(a.date))
  const picked = new Set(i.picked)
  return {
    from,
    to,
    range: i.range,
    for: i.for,
    name: i.name?.trim() || null,
    discuss: i.discuss.trim(),
    moments: wordsChoices(i.written, from, to)
      .filter((r) => picked.has(r.id))
      .map((r) => ({ date: r.date, question: r.source === 'moment' || r.free || !r.question.trim() ? null : r.question, text: clip(r.answer.trim(), WORDS_MAX) })),
    felt: i.for === 'manager' ? [] : feltOf(i, answers, inRange),
    tried: tried.slice(0, TRIED_MAX).map((t) => t.line),
    bring: bringOf(i, answers, fromMoves),
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

const box = (n: number, title: string, body: string) => `<section class="box"><h2><span class="num">${n}</span>${esc(title)}</h2>${body}</section>`
const empty = (text: string) => `<p class="muted">${esc(text)}</p>`
const list = (items: string[], tag: 'ul' | 'ol') => `<${tag}>${items.map((l) => `<li>${esc(l)}</li>`).join('')}</${tag}>`

// sheetHTML writes the brief, as the person left it, as one printable page
// in Midnight & Cream. fonts: Geist's files as URLs or data URIs; without
// them the phone's own face is used. Every word is escaped.
export function sheetHTML(s: Sheet, fonts?: { regular?: string; bold?: string }): string {
  const [t1, t2, t3, t4, t5] = SECTION_TITLES
  const moments = s.moments.length
    ? s.moments.map((w) => `<div class="label">${esc(dateOf(w.date, { day: 'numeric', month: 'long' }))}${w.question ? ` · ${esc(w.question)}` : ''}</div><p class="quote">${esc(w.text)}</p>`).join('')
    : empty(SHEET_EMPTY.moments)
  const boxes = [
    box(1, t1, s.discuss.trim() ? `<p class="lead">${esc(s.discuss)}</p>` : empty(SHEET_EMPTY.discuss)),
    box(2, t2, moments),
    box(3, t3, s.felt.length ? list(s.felt, 'ul') : empty(SHEET_EMPTY.felt)),
    box(4, t4, s.tried.length ? list(s.tried, 'ul') : empty(SHEET_EMPTY.tried)),
    box(5, t5, s.bring.length ? list(s.bring, 'ol') : empty(SHEET_EMPTY.bring)),
  ]
  const face = [
    cssUrl(fonts?.regular) ? `@font-face{font-family:'Geist';src:url('${fonts?.regular}');font-weight:400}` : '',
    cssUrl(fonts?.bold) ? `@font-face{font-family:'Geist';src:url('${fonts?.bold}');font-weight:700}` : '',
  ].join('')
  const who = s.name ? ` · ${esc(s.name)}` : ''
  const title = briefTitle(s.for)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${face}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#f6f1e8}
body{font-family:Geist,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1c2c;-webkit-print-color-adjust:exact;print-color-adjust:exact}
header{background:#0b1c2c;color:#f6f1e8;padding:24px 32px 20px;display:flex;gap:14px;align-items:center}
.eyebrow{color:#c1e863;font-size:11px;font-weight:700}
h1{margin:4px 0 2px;font-size:25px;line-height:1.15;letter-spacing:-0.4px}
.meta{color:#b9c6d0;font-size:12px}
main{padding:20px 32px 0;display:grid;grid-template-columns:1fr;gap:12px}
.box{background:#fffefa;border:1px solid #e4dccd;border-radius:12px;padding:14px 16px;break-inside:avoid}
h2{margin:0 0 8px;font-size:13.5px;color:#013d5a;display:flex;gap:8px;align-items:center}
.num{display:inline-block;width:18px;height:18px;border-radius:9px;background:#0b1c2c;color:#c1e863;font-size:11px;line-height:18px;text-align:center;flex:none}
p,li{font-size:12.5px;line-height:1.45}
p{margin:0 0 6px}
.lead{font-size:14px;line-height:1.5}
ul,ol{margin:0;padding-left:18px}
li{margin-bottom:4px}
.label{font-size:10.5px;font-weight:700;color:#6f6556;margin:6px 0 2px}
.quote{border-left:3px solid #f4a258;padding-left:9px}
.muted{color:#6f6556}
footer{padding:14px 32px 24px;color:#6f6556;font-size:10.5px}
</style></head><body><header>${SPROUT}<div><div class="eyebrow">To bring to a conversation</div><h1>${esc(title)}</h1><div class="meta">${esc(sheetDates(s))}${who}</div></div></header><main>${boxes.join('')}</main><footer>${esc(SHEET_FOOTER)}</footer></body></html>`
}
