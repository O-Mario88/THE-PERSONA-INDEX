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

Midnight for trust and depth, a soft warm grey page with white cards (the
cream read as yellowed and dated, Edwin 2026-10-29; cream stays for brand
moments: the Welcome, the launch, the Today header, the conversation sheet's
paper), herb for growth,
marigold for warmth and celebrating, terracotta for "the other side". Red is
for real warnings only. Every text pair is at least 4.5:1.

| Palette key | Light | Dark | Use |
|---|---|---|---|
| `bg`, `surface` | `#f3f3f0`, `#ffffff` | `#08131b`, `#132a3b` | page, cards (white cards on a soft warm grey since 2026-10-29, and clear steps in dark) |
| `surface2`, `surface3` | `#ebeae6`, `#e2e1dc` | `#1a3548`, `#22425a` | chips, tracks, quiet buttons |
| `line`, `lineStrong` | `#e4e3de`, `#d4d3cd` | `#1f3a4e`, `#2e4d63` | hairlines |
| `control` | `#8a8780` | `#6a8597` | the edge of a control: a switch's off track, answer rings, tick boxes, text boxes (3:1 or more) |
| `text`, `text2`, `muted` | `#12283a`, `#3d4f5c`, `#5a656e` | `#f6efe3`, `#d6d2c9`, `#9eaab3` | words (muted is 4.5:1 or more on the page, white and the tinted fills) |
| `lime` / `onLime` | midnight `#013d5a` / white | marigold `#f4a258` / `#1d1206` | the filled accent: chosen options, chips, progress |
| `btn` / `onBtn` | midnight / white | marigold / dark ink | primary buttons |
| `brandLime` | `#f4a258` | same | the leaf and active icon on the sidebar |
| `leaf`, `leafSoft` | `#55714f`, `#b5c7ae` | `#a9c3a1`, `#7c9a74` | icons, checks, progress |
| `accentInk`, `accentWash`, `accentLine` | `#0b4f70`, `#e7f0ed`, `#bdd3ce` | `#8cc4da`, `#1b3a4d`, `#2e5266` | links, labels, celeste boxes. In dark, marigold is kept for buttons, choices and the open tab, and links and labels take a calm blue, so the two never compete |
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
- **Settings choices** (`Radio`): plain rows with a hairline above and a tick
  on the chosen one, as the phone's own settings do; a choice of two or three
  side by side is a `Segmented` control (Appearance).
- **Chips** (`Chip`): 40px pills on `surface2`; a chosen one takes the
  filled accent.
- **Fields** (`Field`): white with a 1.5px hairline, regular weight.
- **Cards** (`Card`): Facebook-style. Every section of a page is a white card
  on the cream page with `lift()` and no outline in light mode; in dark mode
  a hairline marks the edge, where a shadow can't. Links that belong together
  sit in one `RowGroup` with hairlines between them, not a card each. `Tinted` draws the same card (no coloured fills since
  2026-10-28); colour lives in the small icon disc of `CardHead`, which puts
  the icon beside the title and the words full width below.
- **Layouts** (`src/ui/Layout.tsx`, 2026-10-29): pages mix cards with a
  `Section` (open on the page, no box), `Tile`s in a `TileRow` (2-up, for
  places to go) and one `Spotlight` per page (deep blue with a low sun, light
  words and a marigold `warm` button): today's sitting on Today, the Human
  Pulse on Connect. Need a moment? is one sideways row of chips; the coming
  Mirror sits open; a reading is a tile with a warm square.
- **Progress**: segments under a sitting, and the dots towards Sunday's
  Mirror on Today (filled where you answered; a missed day takes nothing away).

## The Human Pulse

Every item built from one of your own answers carries the Pulse (Edwin,
2026-10-29), from the same counts on every page (`frontend/src/humanPulse.ts`,
`src/ui/Pulse.tsx`): beside it, "384 of 1,240 chose the same"
(`PulseNote`); beside a step, "Of the 2,480 who tried this and reported
back, 1,760 said it helped". After an answer and in Explore deeper it is the
full "You're not alone." line; at the end of a sitting, each answer has its
line; on Connect it leads with one big number. It covers Insights cards and
steps, My journey's discoveries and steps, Today's remembered answers and
step, and the close of a sitting. Nothing shows until a question has 20
answers, and heavy, regional and intimate answers are never counted.
Everywhere else is the anonymous Pulse only: Connect is the one place people
share anything, with the people they choose, a whole group (Loved ones,
Workmates, Close friends) in one tap.

## Moving around

Pages move the way the phone's own do (review, 2026-10-28). An inner page
(Settings, What I keep, a reading, My journey, the Mirrors, sign-in) slides
in over the tab it opened from, which stays where it was, scroll and all
(`src/ui/Stack.tsx`). Back slides it away: the Back link, a swipe from the
left edge on iPhone, or the back button and gesture on Android, which also
closes a sitting and then returns to Today. A sitting rises into place as it
opens. In a wide window pages fade instead, and with reduced motion they just
appear. The open tab sits in a soft capsule. Taps answer under the finger on
a phone (`feel` in `src/ui/kit.tsx`): picking a choice, a switch, a chip or a
tab; the main buttons; and finishing a sitting, unless it was a heavy one.

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
"Understand. Grow. Be more you."). The app icon follows light and dark
(Edwin, 2026-10-28): the sprout on warm white with a faint shadow in light
mode (`assets/icon.png`), on deep navy in dark mode (`assets/icon-dark.png`),
and in grey for iPhone's tinted icons (`assets/icon-tinted.png`). iPhone
switches between them by itself; Android and the website's home-screen icons
can't switch, so they use the light one (Android's themed icons still follow
the phone), and the browser tab's `favicon.svg` follows the browser. All are
rendered from that one file. Words on marigold (the dark theme's buttons and
chosen chips) are navy, never black.

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
5. **Signing in** (Edwin, 2026-10-29). On cream, "Welcome, [name]" and "Keep
   your journey with you": Apple (iPhone) and Google once their sign-in is
   set up on the server, or a 6-digit code by email, phone or WhatsApp, with
   "Start without an account" one tap below (`src/screens/SignUp.tsx`). The
   name from the welcome fills in the display name. From the second day the
   first-week sittings still ask for a free account (`firstWeek.ts`).

The stages and their timing live in `frontend/src/launch.ts`, with tests:
each line stays long enough to read, the whole launch is about three and a
half seconds when everything is quick, and a slow network never holds anyone
on the loading page for more than six seconds. Reduced motion keeps the fades
and drops the movement.

## Patron and what it opens

Edwin's brief (2026-10-29). The app stays free every day; Patron keeps it
independent and opens the longer view.

- **The Patron page** (`src/screens/PatronPage.tsx`): plain choices with their
  prices, never a countdown, a crossed-out price or a fake discount. Plans go
  through the App Store or Google Play on a phone; prepaid passes (Mobile Money
  or a card) only on the website, since a phone app may not point elsewhere.
- **A Patron note** (`PatronNote`, `src/ui/Patron.tsx`): a pale green card
  with the sprout, one sentence and "See Patron", shown only where someone
  reached for something Patron opens, and gone once they're a Patron.
- **The conversation sheet** (`src/screens/ConversationSheet.tsx`): the page is
  paper whatever the theme, a midnight band with the sprout, then four
  numbered boxes and Good things, in Geist, one A4 page as a PDF.
- **Speak instead** (`src/ui/Speak.tsx`): the screen dims to a slow breathing
  glow with the words appearing as they come; no waveform, no ticking clock.
  Then the exact words and the clearer thought side by side.
- **The quiet icons**: the sprout, a pebble and a horizon, as tiles under
  Privacy and choices. Android names them Notes and Today and changes the icon
  once the person leaves the app (it would close the app otherwise); an
  iPhone keeps the app's name and changes it at once.
- **An echo** sits at The Close before "One thing worth trying": a midnight
  card with then and now, and two answers, "Feels true to how I've grown" or
  "Today was just a different day".

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
