// Fixed lines the card, the close of a sitting and the mirror show, kept in
// one place so the voice tests (voice.test.ts) read every one of them.

import type { StepStatus, Verdict } from './api'
import { BALANCED } from './advice'
import { HELPLINE_LINE } from './Helpline'
import { NEEDS, reachingLine } from './needs'

// Saturday looks ahead to Sunday, the review day.
export const SUNDAY_LINE = 'Tomorrow is Sunday: no new questions, just your week in the mirror.'

export const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

export const NO_STEP = "No small step picked today. That's fine; noticing counts too."

export const STEP_REPLIES: Record<Exclude<StepStatus, 'started'>, string> = {
  helped: "Glad it helped. Small things like this add up, and you'll see them in your mirror.",
  no_change: 'Good that you tried. Some steps take a few goes before they show anything.',
  not_tried: "That's fine. The day had other plans. It'll still be there tomorrow.",
}

// How a small step went, in the mirror and the book.
export const STEP_STATUS_WORDS: Record<StepStatus, string> = {
  started: 'In progress',
  helped: 'Helped',
  no_change: 'No change yet',
  not_tried: "Didn't try",
}

// The tap under a card, as the notebook and the book repeat it.
export const VERDICT_WORDS: Record<Verdict, string> = {
  me: "You said: that's me.",
  partly: 'You said: partly.',
  not_me: 'You said: not me.',
}

// Under a card, after the tap.
export const VERDICT_REPLIES: Record<Exclude<Verdict, 'not_me'> | 'rated', string> = {
  me: "Noted. I'll keep building on it.",
  partly: "Noted. I'll hold it loosely and keep watching.",
  rated: 'Thanks for telling me. It helps keep the good cards.',
}
export const NOT_ME_REPLY = "You told me this isn't you, so I'll watch rather than assume."

// Under a leaning in the mirror, after the tap.
export const LEANING_REPLIES: Record<Verdict, string> = {
  me: 'Noted. This one stays in your picture.',
  partly: "Noted. I'll hold it loosely and keep watching.",
  not_me: NOT_ME_REPLY,
}

// Words back: a kept card or a Sunday sentence brought back once a month,
// "Is that still true?" (Keep.tsx), and what the notebook and the book say
// of the answer.
export const WORDS_BACK_ASK = 'Is that still true?'
export const REVISIT_WORDS = { still: 'still true', changing: 'changing', not_anymore: 'not true any more' } as const
export const REVISIT_REPLIES = {
  still: 'Noted. It has held, so it has earned its place.',
  changing: "Noted. Change is the point; I'll watch which way it goes.",
  not_anymore: "Noted. You've moved on from this one, and your notebook keeps the record of it.",
} as const
export const REVISIT_NOTE_ASK = "What's different now? A line in your own words, if you like."
export const REVISIT_NOTE_KEPT = 'Kept beside the original in your notebook.'

// The card of a heavy answer: no insight, just people (the proposal of
// 2026-10-24, "Heavy answers point to people").
export const HEAVY_HEADLINE = 'That sounds really hard.'
export const HEAVY_THANKS =
  "Thank you for being honest. I won't try to read anything into this one. What matters more is that you don't carry it alone."
export const peopleAsk = (names: string) => `Could ${names} hear from you today? A short message counts.`
export const NO_PEOPLE =
  'Is there someone you could tell, even in a short message? You can keep up to three names here, on this phone only, for days like this.'
export const CRISIS_LINE = 'If you ever have thoughts of not wanting to be here, a helpline can talk with you now.'

// The one thing someone is working on: their plan, in the card and the mirror.
export const focusTouch = (when: string, will: string) => `This touches what you're working on: “When ${when}, I will ${will}.”`
export const timesDoneLine = (n: number, since: string) =>
  n === 0 ? "Nothing counted yet. It's waiting for its moment." : `Done ${n === 1 ? 'once' : `${n} times`} since ${since}.`
export const LOOK_BACK_ASK = 'Eight weeks on. Keep going, make it smaller, or close it?'
export const LOOK_BACK_REPLIES = {
  keep: "Keeping it. I'll look back with you again in eight weeks.",
  smaller: 'A smaller plan is an easier one to keep. Your new one is kept.',
  close: 'Closed. It stays in your notebook, with every time you did it.',
} as const
// Under "What changed" in the weekly mirror.
export const CHANGES_NOTE = 'Set against your own earlier answers only.'
export const SWAP_NOTE = 'This takes the place of your current plan. The old one stays in your notebook.'
export const SAME_FOCUS = "You're already working on this one."

// What you're reaching for (Stage 2 of the proposal of 2026-10-24). The
// evening asks about one morning choice; the mirror shows the needs that
// came up most and the routes that got there (reaching.ts).
export const routeLead = (label: string, phrase: string) =>
  `This morning you chose “${label}”. It sounded like ${phrase} mattered there.`
export const ROUTE_ASK = 'Does that route usually get you there?'
export const ROUTE_WORDS = { yes: 'Yes', bit: 'A bit', no: 'Not really' } as const
export const ROUTE_REPLIES = {
  yes: 'Good to know. A route that works is worth knowing by name.',
  bit: 'Noted. Part of the way there still counts.',
  no: 'Worth knowing. Next time it comes up, you might notice what else could get you there.',
} as const
export const reachedLine = (a: string, b?: string) =>
  b ? `Most of your choices this week reached for ${a} and ${b}.` : `Most of your choices this week reached for ${a}.`
export const ROUTES_WORKED = 'What got you there'
export const ROUTES_NOT = "What didn't"
export const REACHED_NOTE = 'Counted from your own answers this week, nothing else.'
export const SUCCESS_TWO = 'Doing well and being respected are kept apart here: one is about the work itself, the other about how it is seen.'
export const SAFETY_ASK = 'Feeling safe came first again. Is something else feeling uncertain right now?'
export const SAFETY_WORDS = { money: 'Money', people: 'People', work: 'Work', health: 'Health', nothing: 'Nothing really' } as const
export const SAFETY_REPLIES = {
  money: 'Thanks for saying. Money worries pull everything towards safety. If it helps, look at one money matter this week. Just look.',
  people: 'Thanks for saying. When things with people feel unsure, safety comes first. One message to someone steady is a start.',
  work: "Thanks for saying. When work feels unsure, the rest can feel less safe too. You've named it, and that counts.",
  health: 'Thanks for saying. Health worries are heavy to carry alone. Telling one person can make them lighter.',
  nothing: "Then feeling safe may simply be what steadies you. That's allowed.",
} as const

// Where someone lives (country.ts): asked once, after a sitting, and in Settings.
export const COUNTRY_ASK = 'Where do you live now?'
export const COUNTRY_WHY = 'So your questions, and the help I point to, fit where you are. It stays on this phone.'
export const COUNTRY_SETTING = 'It picks the helpline I point to on a heavy day. It stays on this phone, and goes in your backup only if you turn the backup on.'
export const COUNTRY_KEEP = 'Keep this'
export const COUNTRY_NONE = 'Prefer not to say'

// After a plan is checked.
export const PLAN_REPLIES = {
  did: "You did it. That's the plan becoming a habit, one go at a time.",
  not_yet: "That's fine. The moment will come round again, and the plan will be ready.",
} as const

export const FIXED_WORDS: [string, string][] = [
  ['Sunday line', SUNDAY_LINE],
  ['quiet day', QUIET_DAY],
  ['no step', NO_STEP],
  ['balanced day', BALANCED],
  ['helpline', HELPLINE_LINE],
  ...Object.entries(STEP_REPLIES).map(([k, v]): [string, string] => [`step reply ${k}`, v]),
  ...Object.entries(VERDICT_REPLIES).map(([k, v]): [string, string] => [`card reply ${k}`, v]),
  ...Object.entries(LEANING_REPLIES).map(([k, v]): [string, string] => [`leaning reply ${k}`, v]),
  ...Object.entries(REVISIT_REPLIES).map(([k, v]): [string, string] => [`revisit reply ${k}`, v]),
  ...Object.entries(REVISIT_WORDS).map(([k, v]): [string, string] => [`revisit words ${k}`, v]),
  ['words back', WORDS_BACK_ASK],
  ['revisit note', REVISIT_NOTE_ASK],
  ['revisit note kept', REVISIT_NOTE_KEPT],
  ['heavy headline', HEAVY_HEADLINE],
  ['heavy thanks', HEAVY_THANKS],
  ['people ask', peopleAsk('Ama, Kofi or Esi')],
  ['no people', NO_PEOPLE],
  ['crisis line', CRISIS_LINE],
  ['focus touch', focusTouch('someone asks a favour', 'pause before I say yes')],
  ['times done 0', timesDoneLine(0, '1 September')],
  ['times done 1', timesDoneLine(1, '1 September')],
  ['times done 5', timesDoneLine(5, '1 September')],
  ['look back', LOOK_BACK_ASK],
  ...Object.entries(LOOK_BACK_REPLIES).map(([k, v]): [string, string] => [`look back reply ${k}`, v]),
  ['changes note', CHANGES_NOTE],
  ['swap note', SWAP_NOTE],
  ['same focus', SAME_FOCUS],
  ...Object.entries(PLAN_REPLIES).map(([k, v]): [string, string] => [`plan reply ${k}`, v]),
  ...NEEDS.map((n): [string, string] => [`reaching line ${n}`, reachingLine(n)]),
  ['route lead', routeLead('Call a friend', 'being close to people')],
  ['route ask', ROUTE_ASK],
  ...Object.entries(ROUTE_REPLIES).map(([k, v]): [string, string] => [`route reply ${k}`, v]),
  ['reached line', reachedLine('feeling settled', 'being close to people')],
  ['reached line one', reachedLine('doing well')],
  ['routes worked', ROUTES_WORKED],
  ['routes not', ROUTES_NOT],
  ['reached note', REACHED_NOTE],
  ['success two', SUCCESS_TWO],
  ['safety ask', SAFETY_ASK],
  ['country why', COUNTRY_WHY],
  ['country setting', COUNTRY_SETTING],
  ...Object.entries(SAFETY_REPLIES).map(([k, v]): [string, string] => [`safety reply ${k}`, v]),
]
