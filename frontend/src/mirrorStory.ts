// The Mirrors as stories (Edwin, 2026-10-26): "A Mirror doesn't tell you who
// you are. It helps you see what you've experienced, what you've learned,
// and the possibilities ahead of you."
//
// Every sentence here is built from something real: the person's own
// answers (profile.ts, on this phone), what the server counted for them
// (the weekly and longer mirrors), the steps and intentions they marked, and
// their reflections only when they chose to let them in. Nothing is
// invented to make a story feel fuller: a section with nothing real behind
// it is left out, and a pattern too thin to call says so.
//
// No React here, so the web app and the Expo app (mobile/, which imports
// frontend/src) tell the same stories. The rules of voice.ts apply to every
// line (mirrorStory.test.ts).

import type { Mirror, PeriodMirror, PeriodNeed, PeriodWeek, StepStatus } from './api'
import type { ConnectionCounts } from './connection'
import { FEELS, stepWords, type CheckIn, type Feeling, type Outcome } from './growthJourney'
import { growthPairs, type GrowthPair } from './growth'
import { cardTextOf, type CardText, type NotAloneQuestion } from './insights'
import { NEED_NAMES, NEED_PHRASES, NEEDS, type Need } from './needs'
import type { Intention, Reflection, ReflectionArea } from './notebook'
import { evidenceFor, type Evidence } from './patterns'
import type { AnswerRecord, History } from './profile'
import { needsBetween, type NeedRead } from './reaching'
import { areaOf, AREA_NAMES as LIFE_AREAS } from './reflect'
import { themeName } from './themes'
import type { Lean } from './mirrorText'
import { locale } from './locale'

export type Span = 'week' | 'month' | 'quarter' | 'year'

// ---------------------------------------------------------------------------
// The needs in everyday words, for each place a Mirror uses them.

// "Three things your answers revealed": what seems to matter, never a label.
export const NEED_REVEAL: Record<Need, string> = {
  freedom: 'Choosing your own way matters to you',
  belonging: 'Being close to people matters to you',
  respect: 'Being taken seriously matters to you',
  competence: 'Doing things well matters to you',
  security: 'Firm ground has mattered to you',
  calm: 'Feeling settled has mattered to you',
  understood: 'Being understood matters to you',
}

// A strength worth appreciating.
export const NEED_STRENGTH: Record<Need, string> = {
  freedom: 'You know your own mind, and you protect room to choose.',
  belonging: 'You keep people in mind, and that keeps connections alive.',
  respect: 'You hold on to your dignity and expect to be treated fairly.',
  competence: 'You care about getting things right, and people can rely on that.',
  security: 'You plan for what could go wrong, which keeps you and others steady.',
  calm: 'You notice what unsettles you, which is where finding calm starts.',
  understood: 'You want real conversations, not only polite ones.',
}

// Something to explore.
export const NEED_EXPLORE: Record<Need, string> = {
  freedom: 'Notice when choosing alone turns into carrying alone.',
  belonging: 'Check whether your own needs get the same care you give others.',
  respect: 'Say what matters to you plainly, before it builds up.',
  competence: 'Notice when doing well turns into doing everything yourself. Asking for help can be part of doing well.',
  security: 'Ask yourself whether one thing in particular feels uncertain, and who could help with it.',
  calm: 'Look for one small pause in the day that is only yours.',
  understood: 'Try saying one thing you feel, not only what you think.',
}

// The benefit and the cost of an approach, for the longer Mirrors' patterns.
export const NEED_COST: Record<Need, string> = {
  freedom: 'It can make asking for support feel harder than it needs to be.',
  belonging: 'Your own needs can wait too long.',
  respect: 'Small slights can stay with you longer than they deserve.',
  competence: 'It can leave little room for rest, or for letting others share the load.',
  security: 'Planning for the worst can be tiring.',
  calm: 'Keeping the peace can mean leaving things unsaid.',
  understood: 'Being misread can hurt more.',
}

// The headline: "A week of …".
export const NEED_SPAN_PHRASE: Record<Need, string> = {
  freedom: 'choosing your own way',
  belonging: 'keeping people close',
  respect: 'standing your ground',
  competence: 'wanting things to go well',
  security: 'looking for firm ground',
  calm: 'looking for calm',
  understood: 'wanting to be understood',
}

// One gentle direction for next week: one small, practical option.
export const NEED_DIRECTION: Record<Need, string> = {
  freedom: 'Notice one choice this week that is fully yours, and make it on purpose.',
  belonging: 'Send one short message to someone you have been thinking about.',
  respect: 'Say one thing that matters to you, calmly and early.',
  competence: 'Choose one task this week you could share or hand over, even a small one.',
  security: 'Name one thing that feels uncertain, and one person you could talk to about it.',
  calm: 'Make space for one small moment of rest, even on a busy day.',
  understood: 'Tell one person one true thing about how your week has been.',
}

// A theme for the coming month, chosen by the person, never prescribed.
export const NEED_THEME: Record<Need, string> = {
  freedom: 'Choosing for yourself, with others alongside',
  belonging: 'Making time for the people close to you',
  respect: 'Speaking up early and calmly',
  competence: 'Doing well without doing it all',
  security: 'Finding steadier ground',
  calm: 'Making space for rest',
  understood: 'Being more open about how you feel',
}

// The seven needs in ordinary language, for the Yearly Mirror. None is
// healthier or better than another.
export const NEED_PLAIN: Record<Need, string> = {
  freedom: 'Having a say in your own life: your time, your choices, your way.',
  belonging: 'Feeling part of something, with people you are close to.',
  respect: 'Being treated fairly and taken seriously.',
  competence: 'Feeling able: doing things well and seeing them work.',
  security: 'Feeling safe, with enough to stand on.',
  calm: 'Feeling settled inside, without too much rush or worry.',
  understood: 'Being seen for who you are, not only for what you do.',
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
export const say = (n: number) => NUMBERS[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, one: string, many: string) => `${say(n)} ${n === 1 ? one : many}`
export const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${say(n)} times`)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// "Wednesday", or "14 October" for anything further back than a week.
export function whenSaid(date: string, span: Span = 'week'): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (span === 'week') return d.toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' })
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const monthName = (date: string) => MONTHS[new Date(`${date}T00:00:00Z`).getUTCMonth()]

// ---------------------------------------------------------------------------
// Evidence: the answers and words behind a line, for "Why am I seeing this?".

export type EvidenceItem = { date: string; asked: string; said: string; source: 'answer' | 'reflection' | 'step' }

// An answer counts towards a story when it may say something about the
// person: not intimate, not heavy (a heavy card shows no reading), and not
// one they tapped "Not me" on.
export const tells = (a: AnswerRecord) => a.theme !== 'intimacy' && !a.heavy && a.verdict !== 'not_me'

export function answerEvidence(a: AnswerRecord, textOf: (id: string) => CardText | null = cardTextOf): EvidenceItem {
  const t = textOf(a.questionId)
  return {
    date: a.date,
    asked: t?.prompt ?? `A question about ${themeName(a.theme).toLowerCase()}`,
    said: t?.label ?? a.label ?? '',
    source: 'answer',
  }
}

export function needEvidence(h: History, need: Need, from: string, to: string, textOf?: (id: string) => CardText | null): EvidenceItem[] {
  return h.answers
    .filter((a) => a.need === need && a.date >= from && a.date <= to && tells(a))
    .sort((x, y) => y.date.localeCompare(x.date))
    .map((a) => answerEvidence(a, textOf))
}

// ---------------------------------------------------------------------------
// The Sunday Mirror.

// What the person marked about a step or an intention, in their own terms.
// checked: the outcome is from their own check-in (growthJourney.ts), with
// how they felt afterwards when they said.
export type HelpedOutcome = 'helped' | 'some' | 'no_change' | 'harder' | 'testing' | 'not_tried' | 'let_go'
export type HelpedItem = { text: string; outcome: HelpedOutcome; date: string; source: 'step' | 'intention' | 'plan'; times: number; checked?: true; feeling?: Feeling }

export const HELPED_PILL: Record<HelpedOutcome, string> = {
  helped: 'Helped',
  some: 'Helped a little',
  no_change: 'No change',
  harder: 'Made it harder',
  testing: 'Still testing',
  not_tried: 'Not tried yet',
  let_go: 'Let go',
}

export const HELPED_NOTE: Record<HelpedOutcome, string> = {
  helped: 'You said it helped.',
  some: 'You said it helped a little.',
  no_change: 'You tried it and noticed no change. That is worth knowing too.',
  harder: 'You said it made things harder. That is worth knowing too.',
  testing: 'You are still finding out how this works for you.',
  not_tried: 'Not tried yet. It is still there if you want it.',
  let_go: 'You let it go for now, and that is fine.',
}

const ORDER: HelpedOutcome[] = ['helped', 'some', 'no_change', 'harder', 'testing', 'not_tried', 'let_go']

// How a step went, from the person's own check-in: "Not yet" kept for later
// is still being tried; let go, or decided against, is let go.
function checkOutcome(c: CheckIn): HelpedOutcome {
  if (c.tried === 'not_yet') return c.later ? 'testing' : 'let_go'
  if (c.tried === 'decided_not') return 'let_go'
  const by: Record<Outcome, HelpedOutcome> = { helped: 'helped', helped_little: 'some', no_difference: 'no_change', harder: 'harder' }
  return c.outcome ? by[c.outcome] : 'testing'
}

// helpedFor gathers what the person tried in a span and said about it: the
// small steps from their cards (the server's record, or their own check-in
// on that step when there is one, which says more), the intentions they
// saved and checked in on, and the plans they kept. Never a score: one row
// per thing, with what they said. The same words twice are one row, counted.
export function helpedFor(
  from: string,
  to: string,
  sources: {
    steps?: { questionId?: string; step: string; started: string; status: 'started' | 'helped' | 'no_change' | 'not_tried' }[]
    helped?: { step: string; started: string }[]
    noChange?: { step: string; started: string }[]
    intentions?: Intention[]
    checks?: CheckIn[]
  },
): HelpedItem[] {
  const out = new Map<string, HelpedItem>()
  const checks = new Map((sources.checks ?? []).map((c) => [c.questionId, c]))
  const add = (text: string, outcome: HelpedOutcome, date: string, source: HelpedItem['source'], check?: CheckIn) => {
    const key = text.trim().toLowerCase()
    if (!key) return
    const said = check ? { checked: true as const, ...(check.feeling ? { feeling: check.feeling } : {}) } : {}
    const was = out.get(key)
    if (!was) return void out.set(key, { text: text.trim(), outcome, date, source, times: 1, ...said })
    // The more telling outcome wins; helping twice is said as twice.
    was.times += outcome === was.outcome ? 1 : 0
    if (ORDER.indexOf(outcome) < ORDER.indexOf(was.outcome)) {
      out.set(key, { text: was.text, outcome, date: date > was.date ? date : was.date, source: was.source, times: 1, ...said })
      return
    }
    if (date > was.date) was.date = date
  }
  for (const s of sources.steps ?? []) {
    if (s.started < from || s.started > to) continue
    const check = s.questionId ? checks.get(s.questionId) : undefined
    if (check) add(s.step, checkOutcome(check), s.started, 'step', check)
    else add(s.step, s.status === 'started' ? 'testing' : s.status, s.started, 'step')
  }
  for (const s of sources.helped ?? []) if (s.started >= from && s.started <= to) add(s.step, 'helped', s.started, 'step')
  for (const s of sources.noChange ?? []) if (s.started >= from && s.started <= to) add(s.step, 'no_change', s.started, 'step')
  for (const i of sources.intentions ?? []) {
    const on = i.checkedOn ?? i.date
    if (on < from || on > to || i.check === 'let_go') continue
    const outcome: HelpedOutcome = i.check === 'helped' ? 'helped' : i.check === 'some' ? 'some' : 'testing'
    add(i.text, outcome, on, 'intention')
  }
  return [...out.values()].sort((x, y) => ORDER.indexOf(x.outcome) - ORDER.indexOf(y.outcome) || y.date.localeCompare(x.date))
}

// One or two sentences about what helped, in the person's own terms:
// "You tried “Ask for help”. When you checked in afterwards, you said it
// helped, and you felt a little lighter. “Take a walk” is something you are
// still exploring, and that is fine." It reports what they said and how
// they felt afterwards, never that the step caused the feeling. Null when
// nothing was tried or marked.
export function helpedSentence(items: HelpedItem[]): string | null {
  const helped = items.filter((i) => i.outcome === 'helped' || i.outcome === 'some')
  const testing = items.filter((i) => i.outcome === 'testing')
  const harder = items.find((i) => i.outcome === 'harder')
  const parts: string[] = []
  const h = helped[0]
  if (h?.checked) {
    const how = h.outcome === 'some' ? 'it helped a little' : 'it helped'
    parts.push(`You tried “${stepWords(h.text)}”. When you checked in afterwards, you said ${how}${h.feeling ? `, and ${FEELS[h.feeling]}` : ''}.`)
  } else if (h) {
    parts.push(
      h.outcome === 'some'
        ? `“${stepWords(h.text)}” helped you a little, by your own account.`
        : `“${stepWords(h.text)}” helped you${h.times > 1 ? ` ${times(h.times)}` : ''}, by your own account.`,
    )
  }
  if (testing[0]) parts.push(`“${stepWords(testing[0].text)}” is something you are still exploring, and that is fine.`)
  else if (!h && harder) parts.push(`“${stepWords(harder.text)}” made things harder, by your own account. That is worth knowing too.`)
  else if (!h && items.some((i) => i.outcome === 'no_change')) parts.push('What you tried made little difference this time, and knowing that is useful.')
  return parts.length ? parts.join(' ') : null
}

export type Story = { headline: string; paragraphs: string[]; evidence: EvidenceItem[] }

// The week's story: a headline and a few paragraphs, every claim from the
// week's own answers and marks. A hard week is named as hard.
export function weekStory(input: {
  from: string
  to: string
  history: History
  answers: number // the server's count for the week
  heavy: boolean // the week held heavy answers (Mirror.lowMood)
  lean?: { headline: string; lean: string } | null // the clearest leaning, if one has earned a name
  helped: HelpedItem[]
  connection?: ConnectionCounts
  textOf?: (id: string) => CardText | null
}): Story {
  const { from, to, history: h } = input
  const needs = needsBetween(h, from, to).filter((r) => r.answers >= 2)
  const [n1, n2] = needs
  const helpedSome = input.helped.find((i) => i.outcome === 'helped' || i.outcome === 'some')
  // Quiet only when neither the server nor this phone has an answer from the week:
  // a new account's answers can live on the phone before the server counts them.
  const onPhone = h.answers.some((a) => a.date >= from && a.date <= to)
  if (input.answers === 0 && !onPhone) {
    return {
      headline: 'A quiet week so far.',
      paragraphs: [
        'Your Mirror is built from your own answers, so there is nothing to say about this week yet. Two or three days of questions is enough to start.',
      ],
      evidence: [],
    }
  }
  const second = n2 ? NEED_SPAN_PHRASE[n2.need] : helpedSome ? 'finding what helps' : null
  let headline: string
  if (input.heavy) headline = n1 ? `A heavier week, with ${NEED_SPAN_PHRASE[n1.need]} running through it.` : 'A week that felt heavy at times.'
  else if (n1) headline = second ? `A week of ${NEED_SPAN_PHRASE[n1.need]} and ${second}.` : `A week of ${NEED_SPAN_PHRASE[n1.need]}.`
  else if (input.lean) headline = `A week of ${input.lean.lean}.`
  else headline = 'A week of answers still finding their shape.'

  const paragraphs: string[] = []
  if (n1) {
    let p = `This week, ${plural(n1.answers, 'of your answers', 'of your answers')}, on ${plural(n1.days, 'day', 'days')}, reached for ${NEED_PHRASES[n1.need]}.`
    if (n2) p += ` ${cap(say(n2.answers))} reached for ${NEED_PHRASES[n2.need]}.`
    paragraphs.push(p)
  } else if (input.lean) {
    paragraphs.push(`Across ${plural(input.answers, 'answer', 'answers')} this week, the clearest thread was this: ${lowerFirst(input.lean.headline)}`)
  } else {
    paragraphs.push(
      `You gave ${plural(input.answers, 'answer', 'answers')} this week, and they pointed in several directions. No single thread stands out yet, and that is fine: it takes a few more days to see one.`,
    )
  }
  if (input.heavy) {
    paragraphs.push('Some of your answers also sounded heavy. That deserves to be said plainly. If this week was hard, leaning on someone you trust is a reasonable thing to do.')
  }
  const agency: string[] = []
  if (helpedSome) agency.push(`you tried “${stepWords(helpedSome.text)}” and said it helped${helpedSome.outcome === 'some' ? ' a little' : ''}`)
  const c = input.connection
  if (c && c.support > 0) agency.push('you asked someone for support')
  else if (c && c.celebrate > 0) agency.push('you celebrated something with someone')
  else if (c && c.nod + c.share > 0) agency.push('you reached out to someone in your Circle')
  if (agency.length) {
    paragraphs.push(`One thing worth noticing: ${joinAnd(agency)}. A small move, and it was yours.`)
  }
  const evidence = needs.slice(0, 2).flatMap((r) => needEvidence(h, r.need, from, to, input.textOf))
  return { headline, paragraphs, evidence }
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

export function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// "Three things your answers revealed": at most three, from different
// parts of the week. Each says what the answers suggest, a strength worth
// appreciating, something to explore, and the answers behind it.
export type Observation = {
  key: string
  kind: 'need' | 'trait'
  need?: Need
  trait?: string
  high?: boolean
  title: string
  strength: string
  explore: string
  evidence: EvidenceItem[]
  seen: number // the answers it rests on
  level: Evidence
}

type TraitLean = Lean<{
  trait: string
  score: number
  answers: number
  behind?: { date: string; question: string; answer: string; leans: 'high' | 'low' | 'middle' }[]
  evidence?: string[]
}>

export function observations(input: {
  from: string
  to: string
  today: string
  history: History
  leans: TraitLean[]
  textOf?: (id: string) => CardText | null
  max?: number
}): Observation[] {
  const { history: h, from, to, today } = input
  const needs: Observation[] = needsBetween(h, from, to)
    .filter((r) => r.answers >= 2)
    .map((r) => ({
      key: `need.${r.need}`,
      kind: 'need' as const,
      need: r.need,
      title: NEED_REVEAL[r.need],
      strength: NEED_STRENGTH[r.need],
      explore: NEED_EXPLORE[r.need],
      evidence: needEvidence(h, r.need, from, to, input.textOf),
      seen: r.answers,
      level: evidenceFor(h, r.need, today),
    }))
  const traits: Observation[] = input.leans.map((l) => {
    const way = l.high ? 'high' : 'low'
    const behind = (l.read.behind ?? []).filter((b) => b.leans === way)
    const evidence: EvidenceItem[] = behind.length
      ? behind.map((b) => ({ date: b.date, asked: b.question, said: b.answer, source: 'answer' as const }))
      : (l.read.evidence ?? []).map((e) => ({ date: '', asked: '', said: e, source: 'answer' as const }))
    return {
      key: `trait.${l.read.trait}`,
      kind: 'trait' as const,
      trait: l.read.trait,
      high: l.high,
      title: l.side.headline.replace(/\.$/, ''),
      strength: l.side.strength,
      explore: l.side.grow,
      evidence,
      seen: l.read.answers,
      level: l.read.answers >= 3 ? 'noticing' : 'thought',
    }
  })
  // Needs and leanings take turns, so three findings cover different ground.
  const out: Observation[] = []
  for (let i = 0; out.length < (input.max ?? 3) && (i < needs.length || i < traits.length); i++) {
    if (needs[i]) out.push(needs[i])
    if (traits[i] && out.length < (input.max ?? 3)) out.push(traits[i])
  }
  return out.slice(0, input.max ?? 3)
}

// "You're not alone": one or two of the person's own answers this span, with
// how many people chose the same. Only real counts, only past the privacy
// threshold the server keeps; the week's main need first, then the largest
// count. It reassures that an experience is shared, never that an answer is
// right because others chose it.
export type NotAlonePick = { questionId: string; prompt: string; label: string; same: number; total: number }

export function notAlonePicks(
  h: History,
  from: string,
  to: string,
  counts: NotAloneQuestion[] | null,
  textOf: (id: string) => CardText | null = cardTextOf,
  max = 2,
): NotAlonePick[] {
  if (!counts) return []
  const top = needsBetween(h, from, to)[0]?.need
  const picks: (NotAlonePick & { need?: Need })[] = []
  for (const a of h.answers) {
    if (a.date < from || a.date > to || !a.optionId || !tells(a) || a.regional) continue
    const q = counts.find((x) => x.questionId === a.questionId)
    const o = q?.options.find((x) => x.optionId === a.optionId)
    const t = textOf(a.questionId)
    if (!q || !o || o.few || o.count <= 0 || !t) continue
    picks.push({ questionId: a.questionId, prompt: t.prompt, label: t.label, same: o.count, total: q.total, need: a.need })
  }
  return picks
    .sort((x, y) => Number(y.need === top) - Number(x.need === top) || y.same - x.same)
    .slice(0, max)
    .map(({ need: _n, ...p }) => p)
}

// "The moments we share" (Edwin, 2026-10-28): after the week's shared
// answers, any move towards other people the person recorded: a step about
// the people in their life that they chose to try, else something they did
// in their Circle. It never says a reach-out worked unless they said so, and
// asks what it taught them only once they did it.
export type SharedMoment = { line: string; ask: string | null; prompt: string | null }

const PEOPLE_AREAS: ReflectionArea[] = ['family', 'social']
const TAUGHT = 'What did that experience teach you?'
const SAID: Record<Outcome, string> = {
  helped: 'it helped',
  helped_little: 'it helped a little',
  no_difference: 'it didn’t make a difference, which is worth knowing too',
  harder: 'it made things harder, which is worth knowing too',
}

export function sharedMoment(input: {
  from: string
  to: string
  history: History
  steps: { questionId: string; theme: string; step: string; started: string; status?: StepStatus }[]
  checks?: CheckIn[]
  connection?: ConnectionCounts
}): SharedMoment | null {
  const { from, to } = input
  const needOf = (id: string) => input.history.answers.find((a) => a.questionId === id)?.need
  const aboutPeople = (s: { questionId: string; theme: string }) => PEOPLE_AREAS.includes(areaOf(s.theme)) || needOf(s.questionId) === 'belonging'
  const chosen = input.steps
    .filter((s) => s.started >= from && s.started <= to && aboutPeople(s))
    .map((s) => ({ s, c: input.checks?.find((c) => c.questionId === s.questionId) }))
    // A step let go, decided against or not got to is not brought back here.
    .filter(({ s, c }) => (c ? c.tried !== 'decided_not' && !(c.tried === 'not_yet' && !c.later) : s.status !== 'not_tried'))
    .sort((a, b) => b.s.started.localeCompare(a.s.started))[0]
  if (chosen) {
    const { s, c } = chosen
    const chose = `You chose to try “${stepWords(s.step)}”`
    // What they said: their check-in, else the step's mark from before
    // check-ins existed.
    const tried = c ? c.tried === 'yes' || c.tried === 'little' : s.status === 'helped' || s.status === 'no_change'
    const said: Outcome | undefined = c ? c.outcome : s.status === 'helped' ? 'helped' : s.status === 'no_change' ? 'no_difference' : undefined
    if (tried) return { line: said ? `${chose}, and you said ${SAID[said]}.` : `${chose}.`, ask: TAUGHT, prompt: `What did trying “${stepWords(s.step)}” teach you?` }
    return { line: `${chose}. It is still there whenever you are ready.`, ask: null, prompt: null }
  }
  const c = input.connection
  if (c?.support) return { line: 'You asked someone in your Circle for support.', ask: TAUGHT, prompt: 'What did asking for support teach you?' }
  if (c?.celebrate) return { line: 'You celebrated something with someone in your Circle.', ask: TAUGHT, prompt: 'What did celebrating with someone teach you?' }
  if (c && c.nod + c.share > 0) return { line: 'You reached out to someone in your Circle.', ask: TAUGHT, prompt: 'What did reaching out teach you?' }
  return null
}

// What helped other people: the anonymous What Helped totals (served by
// GET /api/what-helped once that dataset is live), for a step offered by
// one of the person's own answers. Counts only, never percentages.
export type OthersOutcome = 'helped_lot' | 'helped_little' | 'no_change' | 'not_tried'
export type OthersStep = { questionId: string; optionId: string; total: number; outcomes: { outcome: OthersOutcome; count: number; few?: boolean }[] }
export type OthersPick = { step: string; total: number; rows: { label: string; count: number | null }[]; line: string }

export const OTHERS_LABELS: Record<OthersOutcome, string> = {
  helped_lot: 'Helped', // "It helped" in a check-in
  helped_little: 'Helped a little',
  no_change: 'No change',
  not_tried: 'Didn’t try',
}

// othersLine says what the people who reported back on a step found, in
// counts: "Of the 2,480 who tried this and chose to report back, 1,780 said
// it helped." A folded few is never added in.
export function othersLine(s: OthersStep): string {
  const counted = (o: OthersOutcome) => {
    const c = s.outcomes.find((x) => x.outcome === o)
    return c && !c.few ? c.count : 0
  }
  const helped = counted('helped_lot') + counted('helped_little')
  return helped > 0
    ? `Of the ${s.total.toLocaleString(locale())} who tried this and chose to report back, ${helped.toLocaleString(locale())} said it helped.`
    : `${s.total.toLocaleString(locale())} reported back on this step.`
}

export function othersHelped(
  h: History,
  from: string,
  to: string,
  steps: OthersStep[] | null,
  textOf: (id: string) => CardText | null = cardTextOf,
  max = 1,
): OthersPick[] {
  if (!steps) return []
  const mine = new Map(h.answers.filter((a) => a.date >= from && a.date <= to && a.optionId && tells(a)).map((a) => [a.questionId, a.optionId]))
  return steps
    .filter((s) => mine.get(s.questionId) === s.optionId && textOf(s.questionId)?.step)
    .sort((x, y) => y.total - x.total)
    .slice(0, max)
    .map((s) => {
      const of = (o: OthersOutcome) => s.outcomes.find((c) => c.outcome === o)
      const rows = (Object.keys(OTHERS_LABELS) as OthersOutcome[]).map((o) => {
        const c = of(o)
        return { label: OTHERS_LABELS[o], count: c?.few ? null : (c?.count ?? 0) }
      })
      return { step: textOf(s.questionId)!.step!, total: s.total, rows, line: othersLine(s) }
    })
}

// In your own words: one sentence the person wrote in Reflect this span,
// only when they let reflections into the Mirrors. An intention ("I want…",
// "I'd like…") comes first, then the longest; the first sentence only.
export function ownWordsPick(reflections: Reflection[], from: string, to: string): { id: string; date: string; sentence: string } | null {
  const within = reflections.filter((r) => r.date >= from && r.date <= to && r.answer.trim().length >= 12)
  if (within.length === 0) return null
  const wish = /\b(I want|I'd like|I would like|I wish|I hope|I need)\b/i
  const best = [...within].sort((a, b) => Number(wish.test(b.answer)) - Number(wish.test(a.answer)) || b.answer.length - a.answer.length)[0]
  return { id: best.id, date: best.date, sentence: firstSentence(best.answer) }
}

export function firstSentence(text: string, most = 180): string {
  const t = text.trim().replace(/\s+/g, ' ')
  const m = t.match(/^.+?[.!?](?=\s|$)/)
  const s = m ? m[0] : t
  return s.length > most ? `${s.slice(0, most - 1).trimEnd()}…` : s
}

// One gentle direction: something that already helped, kept going; else the
// small step for what the answers reached for most; else a step from a card.
export type Direction = { key: string; text: string; why: string }

export function weekDirection(input: { from: string; history: History; helped: HelpedItem[]; nextStep?: string | null }): Direction | null {
  const helped = input.helped.find((i) => i.outcome === 'helped')
  if (helped) return { key: `helped.${helped.text}`, text: `Keep “${stepWords(helped.text)}” going, once or twice this week.`, why: 'Because you said it helped.' }
  const top = needsBetween(input.history, input.from, addDaysIso(input.from, 6))[0]
  if (top && top.answers >= 2) {
    return { key: `need.${top.need}`, text: NEED_DIRECTION[top.need], why: `Because ${NEED_PHRASES[top.need]} came up in ${say(top.answers)} of your answers.` }
  }
  if (input.nextStep) return { key: `step.${input.nextStep}`, text: input.nextStep, why: 'From one of this week’s cards.' }
  return null
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// The month and quarter.

// The needs of a period: the server's count once weeks have them, else this
// phone's own history for the period (it keeps 60 days).
export function periodNeeds(p: PeriodMirror, h: History): PeriodNeed[] {
  if (p.needs && p.needs.length) return p.needs
  return needsBetween(h, p.from, p.to).map((r) => ({ need: r.need, answers: r.answers, days: r.days, weeks: 0 }))
}

// Needs in a run of weeks, from the weeks that have them on record.
export function needsOfWeeks(weeks: PeriodWeek[]): { need: Need; answers: number }[] {
  const total = new Map<Need, number>()
  for (const w of weeks) {
    if (!w.needsOnRecord || !w.needs) continue
    for (const [need, n] of Object.entries(w.needs) as [Need, number][]) total.set(need, (total.get(need) ?? 0) + n)
  }
  return [...total].map(([need, answers]) => ({ need, answers })).sort((a, b) => b.answers - a.answers || NEEDS.indexOf(a.need) - NEEDS.indexOf(b.need))
}

// The earlier and later halves of a period, for the story of how it moved.
export function halves(p: PeriodMirror, h: History): { early: { need: Need; answers: number }[]; late: { need: Need; answers: number }[] } {
  const on = p.weeks.filter((w) => w.needsOnRecord)
  if (on.length >= 2) {
    const mid = Math.ceil(on.length / 2)
    return { early: needsOfWeeks(on.slice(0, mid)), late: needsOfWeeks(on.slice(mid)) }
  }
  // Before the server counted needs: this phone's own history, split at the
  // middle of the period's weeks so far.
  const last = p.weeks[p.weeks.length - 1]?.monday ?? p.from
  const mid = addDaysIso(p.from, Math.floor((Date.parse(last) - Date.parse(p.from)) / 86400_000 / 2))
  const by = (from: string, to: string) => needsBetween(h, from, to).map((r) => ({ need: r.need, answers: r.answers }))
  return { early: by(p.from, mid), late: by(addDaysIso(mid, 1), p.to) }
}

const SPAN_NOUN: Record<Exclude<Span, 'week'>, string> = { month: 'month', quarter: 'quarter', year: 'year' }

// The story of a month or quarter: what kept coming back, and whether the
// later weeks leaned somewhere new. A steady span is told as steady; a span
// with too little to go on says so.
export function periodStory(p: PeriodMirror, h: History, helped: HelpedItem[]): Story {
  const noun = SPAN_NOUN[p.period]
  const needs = periodNeeds(p, h)
  const { early, late } = halves(p, h)
  const e = early[0]
  const l = late[0]
  const anyHelped = helped.some((i) => i.outcome === 'helped' || i.outcome === 'some')
  if (p.stats.answers === 0) {
    return { headline: `A quiet ${noun} so far.`, paragraphs: [`Nothing answered this ${noun} yet. It fills in week by week as you answer.`], evidence: [] }
  }
  const paragraphs: string[] = []
  let headline: string
  const shifted = e && l && e.answers >= 2 && l.answers >= 2 && e.need !== l.need
  if (shifted) {
    headline = `A ${noun} of moving from ${NEED_SPAN_PHRASE[e.need]} towards ${NEED_SPAN_PHRASE[l.need]}.`
    paragraphs.push(
      `In the first part of the ${noun}, your answers reached most for ${NEED_PHRASES[e.need]} (${plural(e.answers, 'answer', 'answers')}). In the later weeks, ${NEED_PHRASES[l.need]} came up more (${plural(l.answers, 'answer', 'answers')}).`,
      `This does not erase what mattered earlier. It may simply be another side of the same ${noun}.`,
    )
  } else if (needs[0] && needs[0].answers >= 3) {
    const n = needs[0]
    headline = anyHelped ? `A ${noun} of ${NEED_SPAN_PHRASE[n.need]}, and finding what helps.` : `A ${noun} of ${NEED_SPAN_PHRASE[n.need]}.`
    const weeks = n.weeks > 0 ? ` across ${plural(n.weeks, 'week', 'weeks')}` : ''
    paragraphs.push(`${cap(NEED_PHRASES[n.need])} kept coming back this ${noun}: ${plural(n.answers, 'answer', 'answers')}${weeks}.`)
    const n2 = needs[1]
    if (n2 && n2.answers >= 2) paragraphs.push(`${cap(NEED_PHRASES[n2.need])} was there too, in ${plural(n2.answers, 'answer', 'answers')}.`)
  } else {
    headline = `A ${noun} still taking shape.`
    paragraphs.push(`Your answers this ${noun} pointed in several directions, so no single pattern stands out. That is an honest result, not a missing one.`)
  }
  const tried = helped.filter((i) => i.outcome !== 'not_tried' && i.outcome !== 'testing')
  if (tried.length) {
    const good = tried.filter((i) => i.outcome === 'helped' || i.outcome === 'some').length
    paragraphs.push(
      good > 0
        ? `You tried ${plural(tried.length, 'small thing', 'small things')} and said ${say(good)} helped. Both what helped and what didn’t are worth knowing.`
        : `You tried ${plural(tried.length, 'small thing', 'small things')}, and none made a clear difference yet. That is information, not failure.`,
    )
  }
  // What helped again: the same step helping more than once in the span.
  const again = helped.find((i) => (i.outcome === 'helped' || i.outcome === 'some') && i.times > 1)
  if (again) paragraphs.push(`“${stepWords(again.text)}” helped you ${times(again.times)} this ${noun}, by your own account.`)
  const evidence = needs.slice(0, 2).flatMap((n) => needEvidence(h, n.need, p.from, p.to))
  return { headline, paragraphs, evidence }
}

// "Your recurring patterns": for each part of life with enough answers, what
// they reached for, its benefit and its cost. Mixed answers are named as
// uncertain rather than forced into a pattern.
export type AreaPattern = {
  area: ReflectionArea
  areaName: string
  answers: number
  need?: Need
  uncertain: boolean
  description: string
  benefit?: string
  cost?: string
  evidence: EvidenceItem[]
}

export function areaPatterns(h: History, from: string, to: string, textOf?: (id: string) => CardText | null, max = 4): AreaPattern[] {
  const by = new Map<ReflectionArea, AnswerRecord[]>()
  for (const a of h.answers) {
    if (a.date < from || a.date > to || !tells(a)) continue
    const area = areaOf(a.theme)
    by.set(area, [...(by.get(area) ?? []), a])
  }
  const out: AreaPattern[] = []
  for (const [area, as] of by) {
    if (as.length < 3) continue
    const counts = new Map<Need, number>()
    for (const a of as) if (a.need) counts.set(a.need, (counts.get(a.need) ?? 0) + 1)
    const [top] = [...counts].sort((x, y) => y[1] - x[1])
    const areaName = LIFE_AREAS[area]
    const evidence = as.map((a) => answerEvidence(a, textOf)).sort((x, y) => y.date.localeCompare(x.date))
    if (top && top[1] >= 2 && top[1] * 2 > as.length) {
      out.push({
        area,
        areaName,
        answers: as.length,
        need: top[0],
        uncertain: false,
        description: `In ${say(top[1])} of your ${say(as.length)} answers about ${areaName.toLowerCase()}, what you chose reached for ${NEED_PHRASES[top[0]]}.`,
        benefit: NEED_STRENGTH[top[0]],
        cost: NEED_COST[top[0]],
        evidence,
      })
    } else {
      out.push({
        area,
        areaName,
        answers: as.length,
        uncertain: true,
        description: `Your ${say(as.length)} answers about ${areaName.toLowerCase()} pointed in different directions, so this is uncertain for now rather than a pattern.`,
        evidence,
      })
    }
  }
  return out.sort((a, b) => Number(a.uncertain) - Number(b.uncertain) || b.answers - a.answers).slice(0, max)
}

// "What changed since last month?": earlier and more recent, side by side,
// from real entries only. The needs of the period before against this one,
// when both are on record, then the person's own earlier and later answers
// (growth.ts), and their reflections only if they let them in.
export type ChangeRow = { key: string; area: string; earlier: { when: string; text: string }; recent: { when: string; text: string }; steady?: boolean }

export function changeRows(input: {
  p: PeriodMirror
  previousName: string | null
  history: History
  reflections: Reflection[]
  today: string
  includeReflections: boolean
  textOf?: (id: string) => CardText | null
}): ChangeRow[] {
  const { p } = input
  const rows: ChangeRow[] = []
  const before = p.previousNeeds?.[0]
  const now = p.needs?.[0]
  if (before && now && input.previousName) {
    const noun = SPAN_NOUN[p.period]
    rows.push({
      key: 'needs',
      area: 'What your answers reached for',
      earlier: { when: input.previousName, text: `${cap(NEED_PHRASES[before.need])}, in ${plural(before.answers, 'answer', 'answers')}.` },
      recent: {
        when: `This ${noun}`,
        text: now.need === before.need ? `Still ${NEED_PHRASES[now.need]}, in ${plural(now.answers, 'answer', 'answers')}.` : `${cap(NEED_PHRASES[now.need])}, in ${plural(now.answers, 'answer', 'answers')}.`,
      },
      steady: now.need === before.need,
    })
  }
  const pairs: GrowthPair[] = growthPairs(input.history, input.reflections, input.today, input.textOf, { reflections: input.includeReflections })
  for (const g of pairs) {
    rows.push({
      key: `${g.kind}.${g.area}`,
      area: LIFE_AREAS[g.area],
      earlier: { when: whenSaid(g.earlier.date, 'month'), text: g.kind === 'answers' ? `${g.earlier.asked} You chose “${g.earlier.words}”.` : `“${g.earlier.words}”` },
      recent: { when: whenSaid(g.recent.date, 'month'), text: g.kind === 'answers' ? `${g.recent.asked} You chose “${g.recent.words}”.` : `“${g.recent.words}”` },
    })
  }
  return rows
}

// Themes for the coming month, from what the answers reached for: the person
// picks one, or writes their own.
export function monthThemes(needs: PeriodNeed[] | { need: Need; answers: number }[], max = 3): { need: Need; theme: string }[] {
  return needs
    .filter((n) => n.answers >= 2)
    .slice(0, max)
    .map((n) => ({ need: n.need, theme: NEED_THEME[n.need] }))
}

// An earlier intention from this span, to ask whether it still matters.
export function earlierIntention(intentions: Intention[], from: string, to: string): Intention | null {
  return [...intentions].filter((i) => i.date >= from && i.date <= to && i.check !== 'let_go').sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}

// ---------------------------------------------------------------------------
// The year: four chapters, one per quarter, each from its own record.

export type Chapter = {
  quarter: number // 1 to 4
  months: string // "January to March"
  title: string
  state: 'told' | 'counted' | 'none' | 'later' // told: needs on record; counted: answers only; none: nothing kept; later: not yet
  needs: { need: Need; answers: number }[]
  answers: number
  weeks: number
  moment?: { prompt: string; label: string; date: string }
  helped: string[]
  noChange: string[]
}

const QUARTER_MONTHS = ['January to March', 'April to June', 'July to September', 'October to December']

export const CHAPTER_TITLE: Record<Need, string> = {
  freedom: 'Choosing your own way',
  belonging: 'Keeping people close',
  respect: 'Standing your ground',
  competence: 'Wanting things to go well',
  security: 'Looking for firm ground',
  calm: 'Looking for calm',
  understood: 'Wanting to be understood',
}

export function chapterOf(quarter: number, p: PeriodMirror | null | 'later'): Chapter {
  const months = QUARTER_MONTHS[quarter - 1]
  const base = { quarter, months, needs: [], answers: 0, weeks: 0, helped: [], noChange: [] }
  if (p === 'later') return { ...base, title: 'Still to come', state: 'later' }
  if (!p || p.stats.weeksSoFar === 0) return { ...base, title: 'Nothing on record', state: 'none' }
  const needs = (p.needs ?? []).map((n) => ({ need: n.need, answers: n.answers }))
  const moment = p.moments[0] ? { prompt: p.moments[0].prompt, label: p.moments[0].label, date: p.moments[0].date } : undefined
  const common = {
    ...base,
    needs,
    answers: p.stats.answers,
    weeks: p.stats.weeksActive,
    moment,
    helped: p.helped.map((h) => h.step),
    noChange: (p.noChange ?? []).map((h) => h.step),
  }
  if (p.stats.answers === 0) return { ...common, title: 'A quiet stretch', state: 'counted' }
  if (needs[0] && needs[0].answers >= 2) return { ...common, title: CHAPTER_TITLE[needs[0].need], state: 'told' }
  return { ...common, title: `${cap(say(p.stats.answers))} answers`, state: 'counted' }
}

// The year's story, from its chapters: where it started, where it is now,
// and what helped along the way. Only chapters with needs on record speak to
// change; a year with too little on record says how much there is.
export function yearStory(chapters: Chapter[], year: PeriodMirror | null): Story {
  const told = chapters.filter((c) => c.state === 'told')
  const answered = chapters.reduce((n, c) => n + c.answers, 0)
  const helped = [...new Set(chapters.flatMap((c) => c.helped))]
  if (answered === 0) {
    return { headline: 'Your year is still being written.', paragraphs: ['There is not enough on record yet to tell this year. It grows every week you answer.'], evidence: [] }
  }
  const paragraphs: string[] = []
  let headline: string
  const first = told[0]
  const last = told[told.length - 1]
  if (first && last && first !== last && first.needs[0].need !== last.needs[0].need) {
    headline = `The year you moved from ${NEED_SPAN_PHRASE[first.needs[0].need]} towards ${NEED_SPAN_PHRASE[last.needs[0].need]}.`
    paragraphs.push(
      `From ${first.months}, your answers reached most for ${NEED_PHRASES[first.needs[0].need]}. By ${last.months}, ${NEED_PHRASES[last.needs[0].need]} came up more.`,
      'Changing direction is not always better, and staying the same is not always worse. Both are part of the year you lived.',
    )
  } else if (first) {
    headline = `A year of ${NEED_SPAN_PHRASE[first.needs[0].need]}.`
    paragraphs.push(`Across the chapters on record, ${NEED_PHRASES[first.needs[0].need]} kept coming back in your answers.`)
  } else {
    headline = 'A year in your own answers.'
    paragraphs.push(`You gave ${answered.toLocaleString(locale())} answers this year. What they reached for is only on record for the most recent weeks, so the earlier chapters are told by their numbers alone.`)
  }
  if (helped.length) paragraphs.push(`Along the way, you found ${plural(helped.length, 'small thing', 'small things')} that helped, by your own account, starting with “${stepWords(helped[0])}”.`)
  const missing = chapters.filter((c) => c.state === 'none').length
  if (missing > 0) paragraphs.push(`${cap(plural(missing, 'chapter', 'chapters'))} of this year ${missing === 1 ? 'has' : 'have'} nothing on record, so ${missing === 1 ? 'it is' : 'they are'} left blank rather than guessed.`)
  void year
  return { headline, paragraphs, evidence: [] }
}

// The seven needs over a year: which came up, how often, and one real
// moment for each where there is one.
export function needsOfYear(year: PeriodMirror | null, quarters: (PeriodMirror | null)[]): { need: Need; answers: number; example?: { prompt: string; label: string; date: string } }[] {
  const needs = year?.needs ?? []
  const moments = [...(year?.moments ?? []), ...quarters.flatMap((q) => q?.moments ?? [])]
  return needs.map((n) => {
    const m = moments.find((x) => x.need === n.need)
    return { need: n.need, answers: n.answers, ...(m ? { example: { prompt: m.prompt, label: m.label, date: m.date } } : {}) }
  })
}

// Two genuine reflections of the year, the earliest and the latest, when the
// person let reflections in.
export function wordsRemembered(reflections: Reflection[], from: string, to: string): Reflection[] {
  const within = reflections.filter((r) => r.date >= from && r.date <= to && r.answer.trim().length >= 12).sort((a, b) => a.date.localeCompare(b.date))
  if (within.length === 0) return []
  if (within.length === 1) return within
  return [within[0], within[within.length - 1]]
}

export { NEED_NAMES, NEED_PHRASES }
export type { NeedRead, Mirror }

// The What Helped totals, the same for everyone and fetched with no pass
// (GET /api/what-helped). Null until that dataset is live or when it can't
// be reached; the section that uses it then stays hidden.
export async function getOthersHelped(): Promise<OthersStep[] | null> {
  try {
    const res = await fetch('/api/what-helped')
    if (!res.ok) return null
    const b = (await res.json()) as { steps?: OthersStep[] }
    return Array.isArray(b?.steps) ? b.steps : null
  } catch {
    return null
  }
}
