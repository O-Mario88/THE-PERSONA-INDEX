# The Persona Index — design system

The redesign of 2026-10-25, built from Edwin's 18 reference screens. One
stylesheet entry (`src/styles/index.css`) loads, in order: `tokens.css`,
`base.css` (shared parts), `shell.css` (page, tabs, flow) and one file per
area in `styles/screens/`. Change a colour, size or radius in `tokens.css`,
never in a screen file.

## Direction

Since 2026-10-26 the app copies Edwin's second set of references (Connect,
Your Circle, Insights and Reflect, light and dark). A warm cream page,
white cards on a hairline with a soft lift, a deep midnight sidebar on a wide
screen, midnight primary buttons and chosen tabs, soft celeste boxes, and pastel
discs (green, blue, purple, rose, amber) behind line icons. Dark mode is a
deep midnight, where the filled accent turns marigold. Three rules stay
where the references differ: initials instead of photos, no feed of shared
moments, and only real counts (no invented numbers or percentages).

## Colour

Midnight & Cream (Edwin chose it 2026-10-26 14:40, replacing green, lime and
teal): midnight for trust and depth, a warm cream page like a notebook, herb
for growth, marigold for warmth and celebrating, terracotta for "the other
side". Red is for real warnings only.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg`, `--surface` | `#fbf7f0`, `#fffdf9` | `#0b1a24`, `#102330` | page (cream / deep midnight) |
| `--surface-2`, `--surface-3` | `#f4ede1`, `#ebe2d3` | `#16303f`, `#1d3a4b` | fields, tracks |
| `--text`, `--text-2`, `--muted` | `#12283a`, `#3d4f5c`, `#69737c` | `#f6efe3`, `#d6d2c9`, `#9eaab3` | words |
| `--forest`, `--forest-2` | `#013d5a` (Midnight), `#0d5275` | same, `#13506f` | sidebar, primary buttons, chosen tabs |
| `--lime` | midnight (the filled accent) | `#f4a258` (Marigold) | filled accents, always under `--on-lime` |
| `--brand-lime` | `#f4a258` | same | the leaf and active icon on the midnight sidebar |
| `--leaf` | `#5f7d58` (Herb) | `#a9c3a1` | icons, checks, progress |
| `--accent-ink`, `--accent-wash`, `--accent-line` | `#0b4f70`, `#e7f0ed`, `#bdd3ce` (Celeste) | marigold, `#183242`, `#2a4a5c` | links, soft boxes, tags |
| `--amber` (Marigold), `--rose` (Terracotta), `--blue`, `--purple` (Lavender) + `-wash` | ink on a pale wash | darker washes | discs and tinted boxes |
| `--danger` | `#b42318` | `#ff8a7a` | warnings only |

Every text pair is at least 4.5:1. Discs carry a line icon in the tone's ink
on its wash (`ui/Disc.tsx`). Shared reference styles live last, in
`styles/screens/reference.css`.

## Type

Figtree (variable, self-hosted). Titles 800 weight with tight tracking
(`-0.025em`); card titles 800 at 20px; options and row names 700 at 17px;
body 16px at 1.5; captions 14px. Labels are 12px, 700, uppercase, tracked
`0.2em` ("THE PERSONA INDEX", "MORNING SITTING").

## Shape and space

A 4px grid (`--s-1` to `--s-10`), a 24px page gutter, radii of 10 / 14 / 18
/ 24px (small, controls, cards, sheets) and pills. Elevation is a hairline
plus a soft 4% lift in light, and none in dark.

## Parts

- **Buttons**: `.btn` is the midnight primary (marigold in dark), 48px tall; `.btn.soft` is celeste; `.btn.wide` and `.next` fill the
  width at 56px; `.ghost`, `.outline` and `.danger` are quieter.
- **Options**: a card per answer with an empty ring that fills on choice
  (`.options .option`). Plain `.option` rows elsewhere end in a chevron.
- **Chips**: quiet 40px pills on `--surface-2`; pressed ones take the filled accent (midnight, marigold in dark).
- **Progress**: segments under a sitting, the five-dot "Today's ritual", the
  three-step unlock track, rings for the day and countdowns.
- **Insight mark**: three rising bars in the accent before an insight, a thread or
  a quick read.

## What the references show that the app does not

The references include a streak ring, mood percentages, averages, an
archetype badge, named friends' moods, profile photos and a QR "suggested
by school/company" list. The writing guide forbids streaks, scores and
comparison, and the circle shows who answered, never what. Those places
show the day's "N of 5" ring, the person's own words and patterns, initials
on a tint, and suggestions from shared circles only.


Most of the page sits on the background with hairlines; only a few highlights keep a tinted box. Settings shows three everyday choices and folds the rest under "More settings".

## The phone and Mac app

The Expo app (`mobile/`) draws the same parts from `mobile/src/theme.tsx`
(the same colours, type sizes, radii and lift as `tokens.css`) and
`mobile/src/ui/kit.tsx` (buttons, options, chips, fields). Change a token or
a part in both places together.
