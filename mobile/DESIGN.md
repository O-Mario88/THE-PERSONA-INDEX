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
turns marigold. Light or dark is one choice in Settings (Appearance:
Automatic, Light or Dark) that covers every page; Automatic is dark in the
evening and at night, and whenever the phone is set to dark. Three rules hold everywhere: initials instead of photos, no
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
tracking, compact body lines, labels in sentence case. Geist, bundled (400
to 700; nothing heavier than Bold), chosen 2026-10-28 because Figtree felt
imposing on a small phone. `T` variants (a step smaller since 2026-10-28, to fit every screen): `display` 27/32 at 700 (-0.6), `title` 20/25, `h2`
18/22 at 700, `h3` 16/20 at 700, `body` 15/20, `small` 13/18, `tiny` 12, and
`label`/`eyebrow` 12 at 700 in sentence case ("Morning · 1 of 3"), and
`quote` 19 at 600 for a line set apart. A question is 26 at 700. Geist is
the only face, in the app, on the read pages (served from `/fonts/`) and in
the downloadable notebook; no serif anywhere.

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
  on the cream page, with a hairline and `lift()`, the same as Today's cards
  on every page. `Tinted` draws the same card (no coloured fills since
  2026-10-28); colour lives in the small icon disc of `CardHead`, which puts
  the icon beside the title and the words full width below.
- **Progress**: segments under a sitting, and the dots towards Sunday's
  Mirror on Today (filled where you answered; a missed day takes nothing away).

## Layout

Facebook-style (Edwin, 2026-10-27). Below 900px wide: a tab bar (Today,
Reflect, Connect, Insights, You). From 900px (a browser or a Mac window): the
midnight sidebar with Today, Reflect, Connect, Insights, Mirrors and Saved,
then Profile and Settings at the foot, and a 680px feed column (`FEED`). From
1340px Today adds a 300px right-hand column with the coming Mirror and
today's read.

## Today

Focused (Edwin, 2026-10-28): one thing to do, and everything on it is the
person's own.

- **Greeting** on a soft wash (cream to marigold, midnight in dark, with a low
  sun and two hills drawn from the palette, never a photo), with initials on
  a tint and no bell or badge. Under it, one line from their own days: the day
  count in week one and what they wrote about or answered last time, naming
  the part of life, never their words.
- **The main card**: what they said last time, behind "Tap to read" so nobody
  glancing at the phone reads it, then the sitting on offer. It says how the
  day's questions tie to that memory only when one truly does
  (`linkLine`, shared `todayFocus.ts`). The morning three stay on this card
  until 5 pm and the evening three until midnight.
- **A quiet next step**: how a step they said they'd try went, else one thing
  to carry from today's answers, else a small idea from their own cards.
  Nothing generic: no step of theirs, no card.
- **Need a moment?**: the real-life moment, one tap away, never competing
  with the main button.
- **The coming Mirror**: how far away, a dot a day this week, and what the
  answers lean towards so far.

Every step someone chooses goes into one system: "I'll try it" on an answer
card, on Today's idea or under "Something you could try" in Insights (which
also offers "Save for later"). Today asks how it went (three taps and a private
note), My Journey remembers it, and the Weekly Mirror tells it back in their
own terms, with "The moments we share" naming a move towards someone only as
far as they said it went.

A sitting's close shows this week's seven tiles, Monday to Sunday, ending at the Sunday Mirror. No ninety-day grid anywhere: a long count makes people give up.

## The logo and the icon

Edwin's sprout (2026-10-28): a dark-green and a lime leaf on a slim stem,
with the vein cut out of the lime leaf so it sits on any background. The
source is `assets/brand/mark.svg`; the app draws the same paths
(`src/ui/Logo.tsx`: `Mark`, and `Logo` with THE / PERSONA INDEX and the line
"Understand. Grow. Be more you."). The app icon is the sprout on deep navy
(`assets/icon.png`, the Android layers, the splash, and the web icons in
`frontend/public`), all rendered from that one file. Words on marigold (the
dark theme's buttons and chosen chips) are navy, never black.

## The launch and the welcome

Edwin's design (2026-10-29), four pages, the same in light and dark:

1. **Launch.** The phone's own splash is the sprout on midnight (`#0b1c2c`,
   app.json; the web page shows the same before the app has loaded,
   `public/index.html`). The app's first frame is identical, then the sprout
   grows and rises as THE / PERSONA INDEX™ / the line appear beneath it
   (`src/screens/Launch.tsx`; `Lockup` and `Wordmark` in `src/ui/Logo.tsx`).
2. **Loading.** The logo glides up as midnight gives way to a sunrise over
   misty forested hills (`src/ui/Dawn.tsx`; the pictures are drawn by
   `assets/brand/dawn.html`, tall for phones and wide for everything else).
   A bar in the logo's lime fills only as far as the work done, under
   "Getting things ready…".
3. **Personalising.** "Preparing a more personal experience for you…" while
   today is put together; the bar runs to the end.
4. **Welcome** (first time only). Over the same sunrise: the logo, "A more
   intentional you, starts here." in the phone's serif, an optional first
   name and the lime "Begin My Journey" button (`src/screens/Welcome.tsx`).

The stages and their timing live in `frontend/src/launch.ts`, with tests:
each line stays long enough to read, the whole launch is about three and a
half seconds when everything is quick, and a slow network never holds anyone
on the loading page for more than six seconds. Reduced motion keeps the fades
and drops the movement.

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
the person's own words and patterns, initials on a tint, and suggestions
from shared circles only.
