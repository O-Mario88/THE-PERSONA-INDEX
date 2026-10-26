# The Persona Index — design system

The redesign of 2026-10-25, built from Edwin's 18 reference screens. One
stylesheet entry (`src/styles/index.css`) loads, in order: `tokens.css`,
`base.css` (shared parts), `shell.css` (page, tabs, flow) and one file per
area in `styles/screens/`. Change a colour, size or radius in `tokens.css`,
never in a screen file.

## Direction

Calm and confident: a white page (light) or deep teal (dark), bold geometric
type, generous cards on a hairline, and one accent, lime, used only where
the person acts or progresses (primary buttons, a chosen answer, a done
window, progress). Everything else is ink and grey. Teal heroes (the close,
the practice timer, the room code, the share card) give each day a moment of
weight.

## Colour

Edwin's rule (2026-10-26): six solid colours and nothing else. No gradients,
no greys, no see-through washes, no per-person or per-need tints.

| Colour | Hex | Text on it | Use |
|---|---|---|---|
| White | `#ffffff` | black | the light page and its cards; feature cards in dark |
| Black | `#000000` | — | all text on white, lime and amber |
| Lime | `#c6f24e` | black | primary buttons, chosen answers, progress, "ready for you" cards |
| Deep teal green | `#0f3d3a` | white | feature cards in light ("happening now"); the whole page in dark |
| Amber | `#f6b73c` | black | celebrating only: "Share a win", a friend's good news |
| Red | `#d92d20` | white (fill), or red text on white | warnings before a delete, nothing else |

Light mode is a white page with lime and teal cards; dark mode is a teal
page with white and lime cards. Quiet grounds (fields, chips, tracks,
plain cards) are the page colour with a solid line: teal in light, white in
dark. Text hierarchy comes from size and weight, never from a lighter grey.

How it is wired: `tokens.css` sets the colours and three ink scopes
(`.on-lime`, `.on-amber`, `.on-navy`, the last being the teal/white feature
card). `scopes.css` is generated from the screen files and puts every part
that sits on lime, amber or the feature colour in the matching scope, so
the text, lines and icons inside it follow automatically. Which parts get
colour per screen is chosen in `screens/accents.css`. Regenerate
`scopes.css` with `python3 scripts/palette-scopes.py` after adding a lime or feature background.

The three-bar insight mark is teal on white and lime on teal (`--mark`).

Dark mode turns on when the phone asks for dark, and on Today through the
evening and night; Account's "Dark mode" switch turns both off.

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

- **Buttons**: `.btn` is the lime primary; `.btn.wide` and `.next` fill the
  width at 56px; `.ghost`, `.outline` and `.danger` are quieter.
- **Options**: a card per answer with an empty ring that fills on choice
  (`.options .option`). Plain `.option` rows elsewhere end in a chevron.
- **Chips**: grey pills; pressed ones turn lime.
- **Progress**: segments under a sitting, the five-dot "Today's ritual", the
  three-step unlock track, rings for the day and countdowns.
- **Insight mark**: three rising bars in lime before an insight, a thread or
  a quick read.

## What the references show that the app does not

The references include a streak ring, mood percentages, averages, an
archetype badge, named friends' moods, profile photos and a QR "suggested
by school/company" list. The writing guide forbids streaks, scores and
comparison, and the circle shows who answered, never what. Those places
show the day's "N of 5" ring, the person's own words and patterns, initials
in a lime circle, and suggestions from shared circles only.
