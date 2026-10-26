# The Persona Index — design system

The redesign of 2026-10-25, built from Edwin's 18 reference screens. One
stylesheet entry (`src/styles/index.css`) loads, in order: `tokens.css`,
`base.css` (shared parts), `shell.css` (page, tabs, flow) and one file per
area in `styles/screens/`. Change a colour, size or radius in `tokens.css`,
never in a screen file.

## Direction

Since 2026-10-26 the app copies Edwin's second set of references (Connect,
Your Circle, Insights and Reflect, light and dark). A soft teal-white page,
white cards on a hairline with a soft lift, a deep forest sidebar on a wide
screen, forest-green primary buttons and chosen tabs, mint cards, and pastel
discs (green, blue, purple, rose, amber) behind line icons. Dark mode is a
near-black teal, where the filled accent turns lime. Three rules stay
where the references differ: initials instead of photos, no feed of shared
moments, and only real counts (no invented numbers or percentages).

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg`, `--surface` | `#f5f8f8`, `#ffffff` | `#0a1514`, `#0f1e1d` | page, cards |
| `--surface-2`, `--surface-3` | `#eef5f4`, `#e2ecea` | `#152826`, `#1d3331` | fields, tracks |
| `--text`, `--text-2`, `--muted` | `#0e2322`, `#394e4c`, `#627573` | `#eff6f5`, `#c2d3d1`, `#92a7a4` | words |
| `--forest`, `--forest-2` | `#0f3d3a`, `#175a55` (deep teal) | same | sidebar, primary buttons, chosen tabs |
| `--lime` | forest (the filled accent) | `#c6f24e` | filled accents, always under `--on-lime` |
| `--brand-lime` | `#c6f24e` | same | the leaf and active icon on the forest sidebar, words on forest cards |
| `--leaf` | `#1f8a80` | `#6fd6c9` | icons, checks, progress |
| `--accent-ink`, `--accent-wash`, `--accent-line` | `#136f66`, `#e7f4f2`, `#c4e2de` | lime, `#122d2a`, `#244e49` | teal words, soft teal boxes, tags |
| `--blue`, `--purple`, `--rose`, `--amber` (+ `-wash`) | pastel ink on a pale wash | darker washes | discs and tinted cards |
| `--danger` | `#c4321f` | same | warnings only |

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

- **Buttons**: `.btn` is the forest primary (lime in dark); `.btn.soft` is mint; `.btn.wide` and `.next` fill the
  width at 56px; `.ghost`, `.outline` and `.danger` are quieter.
- **Options**: a card per answer with an empty ring that fills on choice
  (`.options .option`). Plain `.option` rows elsewhere end in a chevron.
- **Chips**: white pills on a hairline; pressed ones turn forest (lime in dark).
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


Since 2026-10-26 14:03 the greens are deep teal (Edwin). Most of the page sits on the background with hairlines; only a few highlights keep a tinted box. Settings shows three everyday choices and folds the rest under "More settings".
