// A kinder look (Edwin, 2026-10-27): when someone writes something harsh
// about themselves in Reflect, the app answers, on this phone only, in the
// way the research supports. The feeling comes first and is taken seriously
// (forced cheer hurts people with low self-esteem, docs/writing-guide.md).
// Then one gentle question about the thinking trap in the words, a wider
// view of the part of life it is about, the person's own evidence from
// their notebook, and the self-compassion question: what would you say to a
// good friend? It asks; it never hands out answers. Words that sound like a
// crisis get no kinder look at all: they get people and a helpline.

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
export const KINDER_ACK = 'Thank you for writing this down. It sounds heavy, and it makes sense that it hurts.'
export const KINDER_TRAPS: Record<Trap, string> = {
  label: 'You used one hard word for the whole of you. A hard moment is part of your story, not all of it. What else is true about you today?',
  always: 'Words like "always" and "never" can make one hard day feel like the whole story. Can you think of one time it went differently?',
  blame: "It's easy to put all of it on yourself. What else played a part that wasn't yours to carry?",
  future: 'A heavy day can make the future look fixed. What is one small thing that could be a little different this week?',
  mind: 'We rarely know what other people think of us. What has someone actually said or done?',
}
export const KINDER_AREAS: Record<Area, string> = {
  work: 'Work can take up so much room that it starts to feel like who you are. It is one part of your life, and you are more than how today went there.',
  friends: 'Friendships have quiet patches and misunderstandings, and they can come back. One short message can open a door again.',
  family: 'Family can hurt most because it matters most. Caring this much says something good about you.',
  world: 'When the world feels heavy, the people and places close to you are still within reach, and small kindnesses there still count.',
}
export const KINDER_FRIEND = 'If a good friend wrote this about themselves, what would you want them to hear? Try writing it to yourself.'
export const KINDER_WRITE = 'Write it the kinder way'

export type OwnRecord = { goodThings: { date: string; text: string }[]; kept: { date: string; text: string }[] }
export type KinderLook = { lines: string[]; evidence: { lead: string; text: string } | null }

const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
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
