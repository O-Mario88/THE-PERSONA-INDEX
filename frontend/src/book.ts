// "Download my book" (Phase 3 of the review of 2026-10-15, "Yours to keep"):
// everything a person kept, wrote and answered, as one page they can open
// in any browser, print or keep; and everything the app holds about them as
// a data file. Both are made on the phone. The server's copy is fetched
// with the phone's pass and nothing is sent anywhere else.
//
// The page is plain HTML with its style inside it: no script, no fonts or
// images from anywhere, so it opens the same way years from now. Every word
// that came from the person or the server is escaped.

import { getExport, wordsBetween, type OwnWords, type ServerExport } from './api'
import { HELPLINE_LINE } from './Helpline'
import {
  allGoodThings,
  keptCards,
  names,
  plans,
  practicesDone,
  sentencesBetween,
  type GoodThings,
  type KeptCard,
  type Name,
  type Plan,
  type Practised,
  type Revisit,
  type Sentence,
} from './notebook'
import { PRACTICES, type PracticeId } from './practices'
import { entryFor } from './registry'
import { helplineHere } from './prefs'
import { keys, load } from './storage'
import { THEMES, themeName } from './themes'
import { TRAITS } from './traits'
import { REVISIT_WORDS, STEP_STATUS_WORDS, VERDICT_WORDS } from './words'

export type Book = {
  made: string // the phone's date, YYYY-MM-DD
  mild: boolean // "Keep it mild": private entries stay out
  cards: KeptCard[]
  sentences: Sentence[]
  good: GoodThings[]
  plans: Plan[]
  names: Name[]
  practised: Practised[]
  words: OwnWords[]
  // The server's copy: null when this phone has nothing there, 'unreachable'
  // when it could not be fetched.
  server: ServerExport | null | 'unreachable'
}

// gatherBook reads everything the book holds from this phone.
export function gatherBook(made: string, mild: boolean, server: Book['server']): Book {
  return {
    made,
    mild,
    cards: keptCards(),
    sentences: sentencesBetween('0000-01-01', '9999-12-31').reverse(),
    good: allGoodThings(),
    plans: plans(),
    names: names(),
    practised: practicesDone(),
    words: wordsBetween('0000-01-01', '9999-12-31').reverse(),
    server,
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// "15 October 2026": a book is read across years, so the year is always there.
export function fullDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const AREA_ORDER = ['everyday', 'people', 'inner', 'desire']

function byArea(cards: KeptCard[]): [string, KeptCard[]][] {
  const groups = new Map<string, KeptCard[]>()
  for (const c of cards) groups.set(c.theme, [...(groups.get(c.theme) ?? []), c])
  const order = Object.keys(THEMES)
  const rank = (t: string) => (THEMES[t] ? AREA_ORDER.indexOf(THEMES[t].area) * 100 + order.indexOf(t) : 10_000)
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]))
}

function section(title: string, body: string): string {
  return body ? `<section><h2>${esc(title)}</h2>${body}</section>` : ''
}

// What the person said when Sunday brought an entry back, and what is different now.
function revisitsHTML(revisits: Revisit[] = []): string {
  return revisits
    .map(
      (r) =>
        `<p class="said">${esc(fullDate(r.date))}: ${esc(REVISIT_WORDS[r.verdict])}${
          r.note ? ` · What's different now: “${esc(r.note)}”` : ''
        }</p>`,
    )
    .join('')
}

function cardHTML(c: KeptCard): string {
  const color = THEMES[c.theme]?.from ?? '#6d5dfc'
  const answer = c.words
    ? `<p class="answer">In your words: “${esc(c.words)}” <span class="meta">· closest to ${esc(c.answer)}</span></p>`
    : `<p class="answer">You chose: ${esc(c.answer)}</p>`
  return `<article class="card" style="border-color:${esc(color)}">
<p class="meta">${esc(fullDate(c.date))}${c.private ? ' · private' : ''}</p>
<p class="prompt">${esc(c.prompt)}</p>
${answer}
<p class="headline">${esc(c.headline)}</p>
${c.body ? `<p>${esc(c.body)}</p>` : ''}
${c.otherSide ? `<p class="other"><span class="label">The other side</span> ${esc(c.otherSide)}</p>` : ''}
${c.step ? `<p class="meta">Small step: ${esc(c.step)}</p>` : ''}
${c.verdict ? `<p class="said">${esc(VERDICT_WORDS[c.verdict])}</p>` : ''}
${revisitsHTML(c.revisits)}
</article>`
}

function planHTML(p: Plan): string {
  const did = p.checks.filter((c) => c.status === 'did').length
  const notYet = p.checks.filter((c) => c.status === 'not_yet').length
  const side = TRAITS[p.trait] ? (p.high ? TRAITS[p.trait].high : TRAITS[p.trait].low) : null
  const record =
    did + notYet === 0 ? 'Not checked yet.' : `Did it ${plural(did, 'time')}, not yet ${plural(notYet, 'time')}.`
  return `<li><p class="meta">Made on ${esc(fullDate(p.made))}${side ? ` · ${esc(side.lean)}` : ''}${p.closed ? ' · finished' : ''}</p>
<p class="line">When ${esc(p.when)}, I will ${esc(p.will)}.</p><p class="meta">${esc(record)}</p></li>`
}

function practisedHTML(list: Practised[]): string {
  const by = new Map<string, Practised[]>()
  for (const p of list) by.set(p.practice, [...(by.get(p.practice) ?? []), p])
  return [...by.entries()]
    .map(([id, done]) => {
      const name = PRACTICES[id as PracticeId]?.name ?? id
      const last = done.map((d) => d.date).sort().at(-1)!
      return `<li><p class="line">${esc(name)}</p><p class="meta">${esc(plural(done.length, 'time'))}, last on ${esc(fullDate(last))}</p></li>`
    })
    .join('')
}

function serverHTML(s: ServerExport, mild: boolean): { answers: string; steps: string; left: number } {
  const shown = mild ? s.answers.filter((a) => !a.private) : s.answers
  const days = new Map<string, ServerExport['answers']>()
  for (const a of [...shown].sort((x, y) => y.date.localeCompare(x.date))) days.set(a.date, [...(days.get(a.date) ?? []), a])
  const answers = [...days.entries()]
    .map(
      ([date, list]) => `<h3>${esc(fullDate(date))}</h3><ul>${list
        .sort((x, y) => (x.sitting === y.sitting ? 0 : x.sitting === 'morning' ? -1 : 1))
        .map(
          (a) => `<li><p class="meta">${a.sitting === 'evening' ? 'Evening' : 'Morning'}${a.theme ? ` · ${esc(themeName(a.theme))}` : ''}</p>
<p class="prompt">${esc(a.question)}</p><p class="answer">${esc(a.answer)}</p>${a.verdict ? `<p class="said">${esc(VERDICT_WORDS[a.verdict])}</p>` : ''}</li>`,
        )
        .join('')}</ul>`,
    )
    .join('')
  const steps = s.steps.length
    ? `<ul>${s.steps
        .map(
          (st) => `<li><p class="meta">Started on ${esc(fullDate(st.started))} · ${esc(STEP_STATUS_WORDS[st.status] ?? st.status)}</p>
<p class="line">${esc(st.step)}</p><p class="meta">After: ${esc(st.question)}</p></li>`,
        )
        .join('')}</ul>`
    : ''
  return { answers, steps, left: s.answers.length - shown.length }
}

// bookHTML writes the book as one page.
export function bookHTML(b: Book): string {
  const cards = b.mild ? b.cards.filter((c) => !c.private) : b.cards
  const words = b.mild ? b.words.filter((w) => !w.private) : b.words
  const server = b.server && b.server !== 'unreachable' ? serverHTML(b.server, b.mild) : null
  const left = b.cards.length - cards.length + (b.words.length - words.length) + (server?.left ?? 0)

  const body = [
    section(
      'Cards you kept',
      byArea(cards)
        .map(([theme, list]) => `<h3>${esc(theme ? themeName(theme) : 'Today')}</h3>${list.map(cardHTML).join('')}`)
        .join(''),
    ),
    section(
      'What you learned, week by week',
      b.sentences.length
        ? `<ul>${b.sentences.map((s) => `<li><p class="meta">Week of ${esc(fullDate(s.week))}</p><p class="line">${esc(s.text)}</p>${revisitsHTML(s.revisits)}</li>`).join('')}</ul>`
        : '',
    ),
    section(
      'Three good things',
      b.good.length
        ? `<ul>${b.good
            .map((g) => `<li><p class="meta">${esc(fullDate(g.date))}</p><ol>${g.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ol></li>`)
            .join('')}</ul>`
        : '',
    ),
    section('Your plans', b.plans.length ? `<ul>${b.plans.map(planHTML).join('')}</ul>` : ''),
    section(
      'The names you gave your weeks',
      b.names.length
        ? `<ul>${b.names
            .map((n) => `<li><p class="meta">Week of ${esc(fullDate(n.week))}</p><p class="line">${esc(n.name)}</p><p class="meta">I suggested ${esc(n.suggested)}.</p></li>`)
            .join('')}</ul>`
        : '',
    ),
    section('Practices you did', b.practised.length ? `<ul>${practisedHTML(b.practised)}</ul>` : ''),
    section(
      'In your own words',
      words.length
        ? `<ul>${words
            .map(
              (w) => `<li><p class="meta">${esc(fullDate(w.date))}${w.theme ? ` · ${esc(themeName(w.theme))}` : ''}</p>
<p class="prompt">${esc(w.prompt)}</p><p class="answer">“${esc(w.words)}”${w.closest ? ` <span class="meta">· closest to ${esc(w.closest)}</span>` : ''}</p></li>`,
            )
            .join('')}</ul>`
        : '',
    ),
    section('Your answers', server?.answers ?? ''),
    section('Your small steps', server?.steps ?? ''),
  ].join('\n')

  const notes: string[] = []
  if (b.server === 'unreachable')
    notes.push("I couldn't reach the server, so the answers it keeps for your mirror aren't in this book. Make it again when you're online.")
  else if (!b.server || b.server.answers.length + b.server.steps.length === 0)
    notes.push('The server keeps no answers for this phone, so this book holds only what is on it.')
  if (left > 0) notes.push(`${plural(left, 'private entry', 'private entries')} left out while "Keep it mild" is on.`)
  notes.push(
    'Your own words stay on your phone only as long as your setting says, so older ones are no longer there. The server keeps your answers for your mirror for a limited time too; "What I keep" in the app says how long.',
  )

  const empty = !body.replace(/\s/g, '')
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>My notebook · ${esc(fullDate(b.made))}</title>
<style>${BOOK_CSS}</style>
</head>
<body>
<main>
<header>
<p class="brand">The Persona Index</p>
<h1>My notebook</h1>
<p class="meta">Made on ${esc(fullDate(b.made))}, on your phone. Nobody else has a copy unless you share it.</p>
</header>
${empty ? '<p>Nothing kept yet. Tap “Keep this” under any card in the app and it will be here next time.</p>' : body}
<footer>
${notes.map((n) => `<p class="meta">${esc(n)}</p>`).join('\n')}
<p class="note">For self-reflection, not a diagnosis.</p>
<p class="meta">${esc(HELPLINE_LINE)} ${esc(helplineHere().replace(/^https:\/\//, ''))}</p>
</footer>
</main>
</body>
</html>
`
}

const BOOK_CSS = `
:root{--bg:#fbfaf7;--fg:#1f2430;--muted:#5d6475;--rule:#e4e1d8;--card:#fff;--accent:#5b4bd6;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0f1424;--fg:#ebe9f3;--muted:#a8adc0;--rule:#283050;--card:#161c31;--accent:#a99cff;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 Georgia,'Times New Roman',serif}
main{max-width:40rem;margin:0 auto;padding:2.5rem max(16px,env(safe-area-inset-right)) 3rem max(16px,env(safe-area-inset-left))}
h1{font-size:2.2rem;line-height:1.15;margin:.2rem 0 .4rem;text-wrap:balance}
h2{font:600 .8rem/1.4 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:2.6rem 0 1rem;padding-top:1rem;border-top:1px solid var(--rule)}
h3{font:600 1rem/1.4 system-ui,sans-serif;margin:1.6rem 0 .6rem}
p{margin:.3rem 0}
ul{list-style:none;padding:0;margin:0}
ul>li{padding:.7rem 0;border-bottom:1px solid var(--rule)}
ol{margin:.3rem 0;padding-left:1.4rem}
.brand,.meta,.label{font:.85rem/1.5 system-ui,sans-serif;color:var(--muted)}
.brand{letter-spacing:.06em;text-transform:uppercase}
.label{font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-right:.3rem}
.card{background:var(--card);border-left:4px solid var(--accent);border-radius:6px;padding:1rem 1.1rem;margin:0 0 1rem;break-inside:avoid}
.prompt{font-weight:600}
.headline{font-size:1.1rem;margin-top:.6rem}
.answer{font-style:italic}
.other{margin-top:.6rem}
.said{font:.9rem/1.5 system-ui,sans-serif}
.line{font-size:1.05rem}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--rule)}
.note{font-style:italic;margin-top:1rem}
@media print{body{background:#fff;color:#000}.card{border:1px solid #ccc;border-left-width:4px}h2{color:#000}}
`

// dataFile is everything the app holds about this person, as data: every
// key on this phone the registry offers for download, and the server's copy.
export function dataFile(made: string, server: Book['server']): string {
  const phone: Record<string, unknown> = {}
  for (const k of keys().sort()) {
    if (!entryFor(k)?.download) continue
    const raw = load(k)
    if (raw === null) continue
    let v: unknown = raw
    try {
      v = JSON.parse(raw)
    } catch {
      // a plain string
    }
    // A removed notebook entry leaves only a mark; there is nothing in it.
    if (v && typeof v === 'object' && (v as { removed?: unknown }).removed === true) continue
    phone[k] = v
  }
  return JSON.stringify(
    {
      about:
        'Everything The Persona Index keeps about you: what is on this phone, and what the server keeps for your mirror. Made on your phone; nobody else has a copy unless you share it.',
      made,
      phone,
      server: server === 'unreachable' ? 'The server could not be reached when this was made.' : server,
    },
    null,
    2,
  )
}

// saveFile hands the browser a file to save. It says whether it could.
export function saveFile(name: string, text: string, type: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch {
    return false
  }
}

async function serverCopy(): Promise<Book['server']> {
  try {
    return await getExport()
  } catch {
    return 'unreachable'
  }
}

export type Made = 'saved' | 'phone-only' | 'failed'

// What a download holds, made on this phone; phoneOnly says the server
// couldn't be reached, so its copy is missing. The phone app saves these its
// own way (as a PDF and a shared file); the browser saves them below.
export type Download = { name: string; text: string; phoneOnly: boolean }

export async function makeBook(today: string, mild: boolean): Promise<Download> {
  const server = await serverCopy()
  return { name: `my-notebook-${today}.html`, text: bookHTML(gatherBook(today, mild, server)), phoneOnly: server === 'unreachable' }
}

export async function makeData(today: string): Promise<Download> {
  const server = await serverCopy()
  return { name: `persona-index-data-${today}.json`, text: dataFile(today, server), phoneOnly: server === 'unreachable' }
}

// downloadBook makes the book and saves it.
export async function downloadBook(today: string, mild: boolean): Promise<Made> {
  const b = await makeBook(today, mild)
  return !saveFile(b.name, b.text, 'text/html') ? 'failed' : b.phoneOnly ? 'phone-only' : 'saved'
}

// downloadData makes the data file and saves it.
export async function downloadData(today: string): Promise<Made> {
  const d = await makeData(today)
  return !saveFile(d.name, d.text, 'application/json') ? 'failed' : d.phoneOnly ? 'phone-only' : 'saved'
}
