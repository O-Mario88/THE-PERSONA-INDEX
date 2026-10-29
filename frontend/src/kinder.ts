// A kinder look (Edwin, 2026-10-27): when someone writes something harsh
// about themselves in Reflect, the app answers, on this phone only, in the
// way the research supports. The feeling comes first and is taken seriously
// (forced cheer hurts people with low self-esteem, docs/writing-guide.md).
// Then one gentle question about the thinking trap in the words, a wider
// view of the part of life it is about, the person's own evidence from
// their notebook, and the self-compassion question: what would you say to a
// good friend? It asks; it never hands out answers. Words that sound like a
// crisis get no kinder look at all: they get people and a helpline.

import { locale } from './locale'

export type Trap = 'label' | 'always' | 'blame' | 'future' | 'mind'
export type Area = 'work' | 'friends' | 'family' | 'world'
export type Reading = { kind: 'crisis' } | { kind: 'hard'; traps: Trap[]; area: Area | null }

const CRISIS =
  /\b(kill(ing)? myself|end (it all|my life|everything)|suicid\w*|(don'?t|do not) want to (be here|be alive|live|wake up)|want to die|better off (dead|without me)|hurt(ing)? myself|self[- ]?harm\w*|cut(ting)? myself|no reason to live|can'?t go on)\b/i

const HARSH_WORDS =
  'stupid|worthless|useless|a failure|failure|ugly|disgusting|pathetic|a mess|not good enough|a burden|unlovable|weak|broken|an idiot|idiot|a loser|loser|hopeless|annoying|too much'
const TRAPS: [Trap, RegExp][] = [
  ['label', new RegExp(String.raw`\bi(?:'m| am)\s+(?:so\s+|such\s+|really\s+|just\s+)?(?:an?\s+)?(?:${HARSH_WORDS})\b|\bi hate (?:myself|me)\b|\b(?:no ?one|nobody) (?:likes|loves|cares about|wants) me\b`, 'i')],
  ['always', /\b(always|never|everyone|everybody|no ?one|nobody|every time|nothing ever)\b/i],
  ['blame', /\b(my fault|i ruin(ed)?|i mess(ed)? (it|everything|things) up|i (always )?mess (it|everything|things) up|because of me)\b/i],
  ['future', /\b(will never|won'?t ever|never going to|(it'?s|it is) hopeless|no point|nothing will (ever )?change|(is|am) going to fail|never get better)\b/i],
  ['mind', /\b((they|people|everyone|my \w+) (all )?(must |probably )?think(s)? (i|i'm|that i)|everyone (thinks|knows) i)\b/i],
]
const LOW = /\b(hate|awful|terrible|horrible|sad|alone|lonely|ashamed|shame|guilty|empty|miserable|hurt|crying|cried)\b/i

const AREAS: [Area, RegExp][] = [
  ['family', /\b(family|mum|mom|dad|mother|father|parents?|brother|sister|husband|wife|partner|children|kids|son|daughter|grandm\w+|grandf\w+)\b/i],
  ['friends', /\b(friends?|mates?)\b/i],
  ['work', /\b(work|job|boss|manager|colleagues?|office|career|shift|customers?|business)\b/i],
  ['world', /\b(world|news|country|government|politics|economy|future)\b/i],
]

// readWriting reads a reflection, here and nowhere else. Null for ordinary
// writing, even writing that says "never".
export function readWriting(text: string): Reading | null {
  const t = text.trim()
  if (!t) return null
  if (CRISIS.test(t)) return { kind: 'crisis' }
  const traps = TRAPS.filter(([, re]) => re.test(t)).map(([trap]) => trap)
  const harsh = traps.some((x) => x !== 'always') || (traps.includes('always') && LOW.test(t))
  if (!harsh) return null
  const area = AREAS.find(([, re]) => re.test(t))?.[0] ?? null
  return { kind: 'hard', traps, area }
}

export const KINDER_TITLE = 'A kinder look'
export const KINDER_ACK = "Thank you for telling me this. It sounds heavy, and I'm glad you didn't keep it to yourself."
export const KINDER_TRAPS: Record<Trap, string> = {
  label: "You used one hard word for all of you. From everything you've shared with me, there's a lot more to you than that. What else is true about you today?",
  always: 'You wrote "always" or "never". One hard day can feel like the whole story. Can you think of one time it went differently for you?',
  blame: "You're putting all of this on yourself. What else played a part that wasn't yours to carry?",
  future: "Right now the future looks fixed to you. What's one small thing that could be a little different for you this week?",
  mind: "You can't really know what they think of you. What has someone actually said or done?",
}
export const KINDER_AREAS: Record<Area, string> = {
  work: "Work is taking up a lot of room for you right now. It's one part of your life, and you're more than how today went there.",
  friends: "Your friendships can have quiet patches and misunderstandings, and they come back. Is there one person you'd like to send a short message to?",
  family: 'Family can hurt you most because it matters so much to you. That you care this much says something good about you.',
  world: "When the world feels heavy, the people close to you are still within reach. Who's one person near you today?",
}
export const KINDER_FRIEND = 'If a good friend wrote this about themselves, what would you want them to hear? Do you want to try writing it to yourself?'
export const KINDER_WRITE = 'Write it the kinder way'

export type OwnRecord = { goodThings: { date: string; text: string }[]; kept: { date: string; text: string }[] }
export type KinderLook = { lines: string[]; evidence: { lead: string; text: string } | null }

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', timeZone: 'UTC' })
const latest = <T extends { date: string }>(xs: T[]) => [...xs].sort((a, b) => b.date.localeCompare(a.date))[0]

// kinderLook says it: the feeling, one trap, the area, and a friend's eyes;
// beside them, the most recent good thing the person wrote down themselves.
export function kinderLook(reading: Extract<Reading, { kind: 'hard' }>, record: OwnRecord): KinderLook {
  // One question at a time: any other trap matters more than an "always".
  const lines = [KINDER_ACK, KINDER_TRAPS[reading.traps.find((t) => t !== 'always') ?? reading.traps[0]]]
  if (reading.area) lines.push(KINDER_AREAS[reading.area])
  lines.push(KINDER_FRIEND)
  const good = latest(record.goodThings)
  const kept = latest(record.kept)
  const evidence = good
    ? { lead: `Something you wrote down on ${dayMonth(good.date)}`, text: good.text }
    : kept
      ? { lead: `Something you kept on ${dayMonth(kept.date)}`, text: kept.text }
      : null
  return { lines, evidence }
}
