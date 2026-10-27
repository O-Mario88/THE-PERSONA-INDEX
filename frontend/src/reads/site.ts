// The public read pages (Phase 3 of the review of 2026-10-15): each read as
// its own page at /read/<slug>/, and a list of them at /read/, written as
// plain HTML at build time (vite.config.ts) so they load fast, work without
// the app's script and can be found by search. The build refuses to run if
// any read fails the gate. Reads on intimacy stay in the app only.
//
// No sources on the page (Edwin, 2026-10-15): they stay accurate in
// reads.json. No ads yet: when AdSense is set up, they go beside reading
// only, after the third paragraph and at the foot (docs/operations.md).

import library from '../../../backend/content/sources.json'
import { HELPLINE_LINE, HELPLINE_URL } from '../helplineText'
import { AREA_NAMES } from '../mirrorText'
import { THEMES } from '../themes'
import { readsProblems } from './gate'
import { appOnly, heavy, minutes, READS, related, topicOf } from './reads'
import type { Read } from './types'

export const ORIGIN = 'https://personaindex.com'
const APP_LINE = 'Three everyday questions in the morning and three in the evening, and what your answers say about you.'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const pathOf = (r: Read) => `/read/${r.slug}/`

function page({ title, description, path, body }: { title: string; description: string; path: string; body: string }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(ORIGIN + path)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(ORIGIN + path)}">
<meta name="theme-color" content="#013d5a">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="manifest" href="/manifest.webmanifest">
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="/">The Persona Index</a><a class="all" href="/read/">All reads</a></header>
<main>
${body}
</main>
<footer>
<p class="app">${esc(APP_LINE)} <a href="/">Open the app</a></p>
<p class="note">Something to think about, never a diagnosis.</p>
</footer>
</body>
</html>
`
}

// readPage writes one read's page.
export function readPage(r: Read, others: Read[]): string {
  const more = others.length
    ? `<nav class="more" aria-labelledby="more"><h2 id="more">More to read</h2><ul>${others
        .map((o) => `<li><a href="${esc(pathOf(o))}">${esc(o.title)}</a><span>${esc(topicOf(o))} · ${minutes(o)} min</span></li>`)
        .join('')}</ul></nav>`
    : ''
  const body = `<article>
<p class="topic">${esc(topicOf(r))} · ${minutes(r)} min read</p>
<h1>${esc(r.title)}</h1>
<p class="summary">${esc(r.summary)}</p>
${r.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n')}
<aside class="try" aria-label="Something to try"><p class="label">Something to try</p><p>${esc(r.try)}</p></aside>
${heavy(r) ? `<p class="help">${esc(HELPLINE_LINE)} <a href="${esc(HELPLINE_URL)}" rel="noreferrer">Find a helpline</a></p>` : ''}
</article>
${more}`
  return page({ title: `${r.title} · The Persona Index`, description: r.summary, path: pathOf(r), body })
}

// indexPage lists every public read, by life area, then about you.
export function indexPage(reads: Read[]): string {
  const list = (rs: Read[]) =>
    `<ul class="list">${rs
      .map(
        (r) =>
          `<li><a href="${esc(pathOf(r))}">${esc(r.title)}</a><p>${esc(r.summary)}</p><span>${esc(topicOf(r))} · ${minutes(r)} min</span></li>`,
      )
      .join('')}</ul>`
  const groups = Object.entries(AREA_NAMES)
    .map(([area, name]) => {
      const rs = reads.filter((r) => r.kind === 'theme' && THEMES[r.key]?.area === area)
      return rs.length ? `<section><h2>${esc(name)}</h2>${list(rs)}</section>` : ''
    })
    .join('\n')
  const traits = reads.filter((r) => r.kind === 'trait')
  const body = `<h1>Reads</h1>
<p class="summary">Short reads on everyday life and the ways people lean, about three minutes each.</p>
${groups}
${traits.length ? `<section><h2>About you</h2>${list(traits)}</section>` : ''}`
  return page({ title: 'Reads · The Persona Index', description: 'Short reads on everyday life and the ways people lean, about three minutes each.', path: '/read/', body })
}

// readSite checks every read and writes the public pages, by file name.
export function readSite(): { problems: string[]; files: Record<string, string> } {
  const problems = readsProblems(READS, library)
  const open = READS.filter((r) => !appOnly(r))
  const files: Record<string, string> = { 'read/index.html': indexPage(open) }
  for (const r of open) files[`read/${r.slug}/index.html`] = readPage(r, related(r, 3, open))
  files['read/sitemap.txt'] = [ORIGIN + '/read/', ...open.map((r) => ORIGIN + pathOf(r))].join('\n') + '\n'
  return { problems, files }
}

// The app's one typeface, Figtree, from the site itself (mobile/scripts/build-web.mjs copies it to /fonts/).
const FONT_FACES = [400, 600, 700].map((w) => `@font-face{font-family:Figtree;src:url(/fonts/figtree-${w}.ttf) format('truetype');font-weight:${w};font-display:swap}`).join('\n')
const SANS = "Figtree,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const CSS = `
${FONT_FACES}
/* Midnight & Cream, as in mobile/src/theme.tsx. */
:root{--bg:#fbf7f0;--panel:#fffdf9;--line:#ece3d4;--text:#12283a;--muted:#69737c;--accent:#0b4f70;--mark:#013d5a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b1a24;--panel:#102330;--line:#1d3545;--text:#f6efe3;--muted:#9eaab3;--accent:#f4a258;--mark:#f4a258;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.6 ${SANS};-webkit-text-size-adjust:100%}
a{color:var(--accent)}
.top,main,footer{max-width:40rem;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
.top{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding-block:1rem;font:600 .9rem/1.4 ${SANS}}
.top a{color:var(--text);text-decoration:none}.top .all{color:var(--muted)}
main{padding-block:1.5rem 2rem}
h1{font:700 clamp(1.9rem,6vw,2.6rem)/1.15 ${SANS};letter-spacing:-.01em;margin:.3rem 0 1rem;text-wrap:balance}
h2{font:600 .8rem/1.4 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:2.4rem 0 .8rem}
p{margin:0 0 1.1rem}
.topic,.list span,.more span{font:.85rem/1.4 ${SANS};color:var(--muted)}
.topic{border-left:3px solid var(--mark);padding-left:.6rem}
.summary{font-size:1.15rem;color:var(--muted)}
.try{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--mark);border-radius:12px;padding:1rem 1.2rem;margin:2rem 0}
.try p{margin:0}.try .label{font:600 .8rem/1.4 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:.4rem}
.help{font:.95rem/1.5 ${SANS};color:var(--muted)}
ul{list-style:none;margin:0;padding:0}
.list li,.more li{padding:.9rem 0;border-bottom:1px solid var(--line)}
.list a,.more a{font:600 1.05rem/1.35 ${SANS};display:block;margin-bottom:.25rem}
.list p{margin:.2rem 0;font-size:1rem;color:var(--muted)}
.more span{display:block}
footer{border-top:1px solid var(--line);padding-block:1.2rem 2.5rem;font:.9rem/1.5 ${SANS};color:var(--muted)}
footer .note{font-style:italic}
`
