# The Persona Index — design system

The redesign of 2026-10-25, built from Edwin's 18 reference screens. One
stylesheet entry (`src/styles/index.css`) loads, in order: `tokens.css`,
`base.css` (shared parts), `shell.css` (page, tabs, flow) and one file per
area in `styles/screens/`. Change a colour, size or radius in `tokens.css`,
never in a screen file.

## Direction

Calm and confident: a white page (light) or navy (dark), bold geometric
type, generous cards on a hairline, and one accent, lime, used only where
the person acts or progresses (primary buttons, a chosen answer, a done
window, progress). Everything else is ink and grey. Navy heroes (the close,
the practice timer, the room code, the share card) give each day a moment of
weight.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg`, `--surface` | `#ffffff` | `#0e1b26`, `#13222f` | page, cards |
| `--surface-2` | `#f3f5f7` | `#1a2b3a` | fields, quiet pills, tracks |
| `--text` | `#0e1a24` | `#f4f7f9` | body and titles |
| `--muted` | `#64707c` | `#93a1ae` | captions |
| `--lime` | `#c6f24e` | same | fills only, always under `--on-lime` ink |
| `--accent-ink` | `#2f6d10` | lime | lime's partner for text and icons |
| `--accent-wash` | `#f4fbe2` | lime at 8% | a chosen option's ground |

Lime is never text on white (1.2:1). Every text pair is at least 4.5:1;
the lowest is muted on `--surface-2` at 4.63:1.

Dark mode is navy, not black. It turns on when the phone asks for dark, and
on Today through the evening and night; Account's "Dark mode" switch turns
both off.

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
on a tint, and suggestions from shared circles only.
