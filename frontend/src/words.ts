// Fixed lines the card, the close of a sitting and the mirror show, kept in
// one place so the voice tests (voice.test.ts) read every one of them.

import type { StepStatus, Verdict } from './api'
import { BALANCED } from './advice'
import { HELPLINE_LINE } from './Helpline'

// Saturday looks ahead to Sunday, the review day.
export const SUNDAY_LINE = 'Tomorrow is Sunday: no new questions, just your week in the mirror.'

export const QUIET_DAY = 'Tomorrow, notice one moment that feels easy and one that feels heavy. Both tell you something.'

export const NO_STEP = "No small step picked today. That's fine; noticing counts too."

export const STEP_REPLIES: Record<Exclude<StepStatus, 'started'>, string> = {
  helped: "Glad it helped. Small things like this add up, and you'll see them in your mirror.",
  no_change: 'Good that you tried. Some steps take a few goes before they show anything.',
  not_tried: "That's fine. The day had other plans. It'll still be there tomorrow.",
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

export const FIXED_WORDS: [string, string][] = [
  ['Sunday line', SUNDAY_LINE],
  ['quiet day', QUIET_DAY],
  ['no step', NO_STEP],
  ['balanced day', BALANCED],
  ['helpline', HELPLINE_LINE],
  ...Object.entries(STEP_REPLIES).map(([k, v]): [string, string] => [`step reply ${k}`, v]),
  ...Object.entries(VERDICT_REPLIES).map(([k, v]): [string, string] => [`card reply ${k}`, v]),
  ...Object.entries(LEANING_REPLIES).map(([k, v]): [string, string] => [`leaning reply ${k}`, v]),
]
