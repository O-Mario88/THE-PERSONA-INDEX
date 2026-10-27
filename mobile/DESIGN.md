# The Persona Index: design system

One React Native app draws every platform: iPhone, Android, the Mac and the
website (React Native for Web). The tokens live in `src/theme.tsx`, the parts
in `src/ui/kit.tsx` and `src/ui/parts.tsx`, and the wide-screen sidebar in
`src/ui/Sidebar.tsx`. Change a colour, size or radius there, never in a
screen.

## Direction

Midnight & Cream (Edwin, 2026-10-26): a warm cream page, white cards on a
hairline with a soft lift, midnight primary buttons and chosen tabs, soft
celeste boxes, and pastel discs (herb, blue, lavender, terracotta, marigold)
behind line icons. Dark mode is a deep midnight, where the filled accent
turns marigold. Three rules hold everywhere: initials instead of photos, no
feed of shared moments, and only real counts (no invented numbers or
percentages).

## Colour

Midnight for trust and depth, cream like a notebook, herb for growth,
marigold for warmth and celebrating, terracotta for "the other side". Red is
for real warnings only. Every text pair is at least 4.5:1.

| Palette key | Light | Dark | Use |
|---|---|---|---|
| `bg`, `surface` | `#fbf7f0`, `#fffdf9` | `#0b1a24`, `#102330` | page, cards |
| `surface2`, `surface3` | `#f4ede1`, `#ebe2d3` | `#16303f`, `#1d3a4b` | chips, tracks, quiet buttons |
| `line`, `lineStrong` | `#ece3d4`, `#ddd1bd` | `#1d3545`, `#2a4759` | hairlines, empty rings |
| `text`, `text2`, `muted` | `#12283a`, `#3d4f5c`, `#69737c` | `#f6efe3`, `#d6d2c9`, `#9eaab3` | words |
| `lime` / `onLime` | midnight `#013d5a` / white | marigold `#f4a258` / `#1d1206` | the filled accent: chosen options, chips, progress |
| `btn` / `onBtn` | midnight / white | marigold / dark ink | primary buttons |
| `brandLime` | `#f4a258` | same | the leaf and active icon on the sidebar |
| `leaf`, `leafSoft` | `#5f7d58`, `#b5c7ae` | `#a9c3a1`, `#7c9a74` | icons, checks, progress |
| `accentInk`, `accentWash`, `accentLine` | `#0b4f70`, `#e7f0ed`, `#bdd3ce` | marigold, `#183242`, `#2a4a5c` | links, celeste boxes |
| `amber`, `rose`, `blue`, `purple` + `Wash` | ink on a pale wash | darker washes | discs and tinted boxes |
| `navy`, `onNavy`, `onNavy2` | midnight, white, `#c7d8e2` | `#133246`, white, `#c2d2dc` | hero cards, the close |
| `side`, `sideInk`, `sideOn`, `sideOnInk` | midnight, `#d7e4ec`, `#0d5275`, white | `#08151d`, `#cdd7de`, `#15303f`, marigold | the wide-screen sidebar |
| `danger` | `#b42318` | `#ff8a7a` | warnings only |

The key names `lime` and `navy` are kept from earlier palettes. Read them as
"the filled accent" and "the hero surface".

## Type

X-style (Edwin, 2026-10-27): one face, few sizes, heavy headings with tight
tracking, compact body lines, labels in sentence case. Figtree, bundled (400
to 800). `T` variants: `display` 31/36 at 800 (-0.6), `title` 23/28, `h2`
20/24 at 800, `h3` 17/22 at 700, `body` 16/22, `small` 14/19, `tiny` 13, and
`label`/`eyebrow` 13 at 700 in sentence case ("Morning · 1 of 3"). A
question is 30 at 800.

## Shape and space

A 4px grid (`space`), a 24px gutter on a phone and 40px beside the sidebar,
radii of 10 / 14 / 18 / 24 (small, controls, cards, sheets) and pills.
Elevation is a hairline plus `lift()` (a soft 4% shadow) in light, and none
in dark.

## Parts

- **Buttons** (`Button`): primary is midnight (marigold in dark), 48px tall,
  56px when `wide`; `soft` is celeste, `ghost` and `outline` are quieter,
  `danger` is outlined red, `text` is a 14px link. `small` is a 40px pill.
- **Options** (`Option`): a card per answer, 64px tall with a 1.5px
  hairline, and an empty ring that fills with the accent and a dot when chosen.
- **Chips** (`Chip`): 40px pills on `surface2`; a chosen one takes the
  filled accent.
- **Fields** (`Field`): white with a 1.5px hairline, regular weight.
- **Cards** (`Card`): Facebook-style. Every section of a page is a white card
  on the cream page, with a hairline and `lift()`; `Tinted` boxes are for the
  few highlights.
- **Progress**: segments under a sitting, the five-dot "Today's ritual",
  rings for the day and countdowns.

## Layout

Facebook-style (Edwin, 2026-10-27). Below 900px wide: a tab bar (Today,
Reflect, Connect, Insights, You). From 900px (a browser or a Mac window): the
midnight sidebar with Today, Reflect, Connect, Insights, Mirrors and Saved,
then Profile and Settings at the foot, and a 680px feed column (`FEED`). From
1340px Today adds a 300px right-hand column with the season tapestry and
today's read.

## On the website

React Native for Web writes the app's styles into the page as it draws, so
the site's policy allows inline styles (scripts never; `frontend/public/_headers`).
The page itself (`public/index.html`, `public/app.css`) carries no inline
style. The lock screen and the add-to-home-screen invite exist only there
(`src/screens/Browser.tsx`).

## What the references show that the app does not

The reference designs include a streak ring, mood percentages, averages, an
archetype badge, named friends' moods, profile photos and a "suggested by
school/company" list. The writing guide forbids streaks, scores and
comparison, and the circle shows who answered, never what. Those places show
the day's "N of 5" ring, the person's own words and patterns, initials on a
tint, and suggestions from shared circles only.
