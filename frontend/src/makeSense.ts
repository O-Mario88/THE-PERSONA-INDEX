// "What would you like help making sense of today?" (Edwin's brief,
// 2026-10-29): the first experience, and the way in from Today whenever
// something happens. Five concrete starting points, two or three questions,
// then within two minutes a small result the person can edit: what they
// described, one possibility (always tentative, always "Does that fit?"),
// one practical next step, and a sentence they can use when a conversation is
// involved. Everything is put together here, on the phone, from their own
// choices and words: no answer leaves the phone, and nothing is guessed
// beyond what they said.
//
// Kept, the result is a reflection in the Notebook (source 'sense') and the
// step an intention with a check-in two days later, so the app remembers what
// happened next. memoryFor brings back a step from a similar moment only when
// the person said it helped: a real record, never an invented one.

import { dateOf } from './locale'
import { intentions, keepIntention, keepReflection, reflections, type Reflection } from './notebook'

export type SenseStart = 'overthinking' | 'conversation' | 'yes' | 'week' | 'reflect'
export type SenseOption = { id: string; label: string }
export type SenseQuestion = { id: string; kind: 'words' | 'choice'; ask: string; placeholder?: string; options?: SenseOption[] }
export type SenseAnswers = Record<string, string>
export type SenseResult = { described: string; possibility: string; step: string; say?: string }

export const SENSE_ASK = 'What would you like help making sense of today?'
export const SENSE_FOOT = 'Something to think about, never a diagnosis.'

// short: the same starting point as a chip on Today.
export const STARTS: { id: SenseStart; label: string; short: string }[] = [
  { id: 'overthinking', label: 'I keep overthinking something.', short: 'I keep overthinking' },
  { id: 'conversation', label: 'I need to have a difficult conversation.', short: 'A difficult conversation' },
  { id: 'yes', label: 'I keep saying yes when I want to say no.', short: 'Saying yes, meaning no' },
  { id: 'week', label: 'I want to understand how my week has affected me.', short: 'How my week affected me' },
  { id: 'reflect', label: 'I just want somewhere to reflect.', short: 'Just reflect' },
]

export const isSenseStart = (v: unknown): v is SenseStart => STARTS.some((s) => s.id === v)
export const startLabel = (s: SenseStart): string => STARTS.find((x) => x.id === s)?.label ?? ''

const QUESTIONS: Record<SenseStart, SenseQuestion[]> = {
  overthinking: [
    { id: 'what', kind: 'words', ask: 'What’s on your mind? A line or two is enough.', placeholder: 'It keeps coming back when…' },
    {
      id: 'circle',
      kind: 'choice',
      ask: 'What does it keep circling back to?',
      options: [
        { id: 'decision', label: 'A decision I haven’t made' },
        { id: 'said', label: 'Something I said or did' },
        { id: 'worry', label: 'Something that could go wrong' },
        { id: 'person', label: 'What someone thinks of me' },
      ],
    },
    {
      id: 'help',
      kind: 'choice',
      ask: 'What would help most right now?',
      options: [
        { id: 'clarity', label: 'Seeing it more clearly' },
        { id: 'calm', label: 'Feeling calmer about it' },
        { id: 'next', label: 'Knowing what to do next' },
      ],
    },
  ],
  conversation: [
    {
      id: 'who',
      kind: 'choice',
      ask: 'Who is the conversation with?',
      options: [
        { id: 'partner', label: 'My partner' },
        { id: 'family', label: 'Someone in my family' },
        { id: 'work', label: 'Someone at work' },
        { id: 'friend', label: 'A friend' },
      ],
    },
    { id: 'want', kind: 'words', ask: 'What do you most want them to understand?', placeholder: 'I want them to know that…' },
    {
      id: 'worry',
      kind: 'choice',
      ask: 'What worries you most about it?',
      options: [
        { id: 'upset', label: 'That they’ll be upset' },
        { id: 'heard', label: 'That I won’t be heard' },
        { id: 'words', label: 'That I won’t find the words' },
        { id: 'worse', label: 'That it will make things worse' },
      ],
    },
  ],
  yes: [
    { id: 'said', kind: 'words', ask: 'What did you say yes to?', placeholder: 'I agreed to…' },
    {
      id: 'why',
      kind: 'choice',
      ask: 'What made it hard to say no?',
      options: [
        { id: 'letdown', label: 'I didn’t want to let them down' },
        { id: 'think', label: 'I worried what they’d think' },
        { id: 'quicker', label: 'Agreeing felt quicker' },
        { id: 'right', label: 'I wasn’t sure I had the right' },
      ],
    },
    {
      id: 'state',
      kind: 'choice',
      ask: 'How were you already feeling?',
      options: [
        { id: 'stretched', label: 'Already stretched' },
        { id: 'fine', label: 'Fine, but it wasn’t what I wanted' },
        { id: 'unsure', label: 'I’m not sure' },
      ],
    },
  ],
  week: [
    {
      id: 'felt',
      kind: 'choice',
      ask: 'How has your week felt, mostly?',
      options: [
        { id: 'heavy', label: 'Heavy' },
        { id: 'busy', label: 'Busy and rushed' },
        { id: 'flat', label: 'Flat' },
        { id: 'mixed', label: 'Up and down' },
        { id: 'good', label: 'Good, mostly' },
      ],
    },
    { id: 'most', kind: 'words', ask: 'What took the most out of you, or gave you the most?', placeholder: 'The part that stayed with me was…' },
    {
      id: 'need',
      kind: 'choice',
      ask: 'What do you need more of next week?',
      options: [
        { id: 'rest', label: 'Rest' },
        { id: 'people', label: 'Time with people I like' },
        { id: 'room', label: 'Room to think' },
        { id: 'done', label: 'Getting things done' },
        { id: 'joy', label: 'Something to look forward to' },
      ],
    },
  ],
  reflect: [
    { id: 'what', kind: 'words', ask: 'What’s on your mind? Write as much or as little as you like.', placeholder: 'Today I…' },
    {
      id: 'now',
      kind: 'choice',
      ask: 'How does it feel to have written it down?',
      options: [
        { id: 'lighter', label: 'A little lighter' },
        { id: 'clearer', label: 'Clearer' },
        { id: 'same', label: 'About the same' },
        { id: 'heavier', label: 'Heavier' },
      ],
    },
  ],
}

export const senseQuestions = (start: SenseStart): SenseQuestion[] => QUESTIONS[start]

// The person's own words, tidied, never changed.
const own = (s: string | undefined): string =>
  (s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
const pick = <T>(table: Record<string, T>, key: string | undefined, fallback: T): T => (key && key in table ? table[key] : fallback)

const FIT = ' Does that fit?'

function overthinking(a: SenseAnswers): SenseResult {
  const circle = pick(
    { decision: 'a decision you haven’t made', said: 'something you said or did', worry: 'something that could go wrong', person: 'what someone thinks of you' },
    a.circle,
    'the same thing',
  )
  const possibility = pick(
    {
      decision: 'One possibility is that each choice protects something you care about, so neither feels safe to give up.',
      said: 'One possibility is that replaying it is your mind trying to make sure it doesn’t happen again, more than proof that it went badly.',
      worry: 'One possibility is that going over it feels like preparing, even when there is nothing left to prepare.',
      person: 'One possibility is that their opinion matters because the relationship does, not because they are right about you.',
    },
    a.circle,
    'One possibility is that it matters to you more than it first seemed.',
  )
  const step = pick(
    {
      clarity: 'Write down the two or three things you know for sure, apart from what you’re guessing, and read only those.',
      calm: 'Give it ten minutes this evening to think it through, and when it comes up before then, tell yourself you’ll get to it.',
      next: 'Choose the smallest step you could take in the next day, and only that one.',
    },
    a.help,
    'Choose the smallest step you could take in the next day, and only that one.',
  )
  const say = pick<string | undefined>(
    { person: 'I’ve been wondering how that came across. Can I ask what you thought?', said: 'I’ve been thinking about what I said, and I’d like to put it better.' },
    a.circle,
    undefined,
  )
  return { described: `You said: “${own(a.what)}”. It keeps circling back to ${circle}.`, possibility: possibility + FIT, step, ...(say ? { say } : {}) }
}

function conversation(a: SenseAnswers): SenseResult {
  const who = pick({ partner: 'your partner', family: 'someone in your family', work: 'someone at work', friend: 'a friend' }, a.who, 'them')
  const possibility = pick(
    {
      upset: 'One possibility is that you’re carrying their feelings as well as your own. If they’re upset, it won’t mean you were wrong to say it.',
      heard: 'One possibility is that it hasn’t landed before, so this time how you open matters most.',
      words: 'One possibility is that it matters so much that no way of saying it feels quite right. A clear, simple start is enough.',
      worse: 'One possibility is that keeping the peace has felt safer than saying it, even though not saying it costs you too.',
    },
    a.worry,
    'One possibility is that it matters a great deal to you, which is why it’s hard to start.',
  )
  const step = pick(
    {
      heard: 'Ask for ten minutes when neither of you is rushed, and say at the start that you’d like to finish before you talk it through.',
      upset: 'Choose a calm time, not in the middle of something, and open with what you want rather than what they did.',
      words: 'Write your first sentence down before you start, so the opening is the one part you don’t have to find on the spot.',
      worse: 'Choose a calm time, and say first that you’re not looking for an argument, only to be understood.',
    },
    a.worry,
    'Choose a calm time, not in the middle of something, and open with what you want rather than what they did.',
  )
  const say = pick(
    {
      upset: 'This might be hard to hear, and I’m telling you because I care about us.',
      heard: 'There’s something I’d like to tell you. Can I say it all first, and then we talk it through?',
      words: 'I’m not sure I’ll say this perfectly, but it matters to me, so I’m going to try.',
      worse: 'I don’t want this to turn into an argument. I’d like us to understand each other.',
    },
    a.worry,
    'There’s something that matters to me, and I’d like us to talk about it when we both have time.',
  )
  return { described: `You want ${who} to understand: “${own(a.want)}”.`, possibility: possibility + FIT, step, say }
}

function sayingYes(a: SenseAnswers): SenseResult {
  const state = pick({ stretched: ', when you were already stretched', fine: ', even though it wasn’t what you wanted', unsure: '' }, a.state, '')
  const possibility = pick(
    {
      letdown: 'One possibility is that protecting the relationship mattered more in that moment than protecting your time.',
      think: 'One possibility is that being someone people can rely on matters to you, even when it costs you.',
      quicker: 'One possibility is that a quick yes saved a hard moment then, and the cost came later.',
      right: 'One possibility is that your own needs felt smaller than their request. They count too.',
    },
    a.why,
    'One possibility is that saying no felt harder in the moment than the cost of saying yes.',
  )
  const say = pick(
    {
      stretched: 'I can help tomorrow, but I can’t take this on tonight.',
      fine: 'I’d rather not this time, but thank you for thinking of me.',
      unsure: 'Let me check what I’ve got on and come back to you.',
    },
    a.state,
    'Let me check what I’ve got on and come back to you.',
  )
  return {
    described: `You said yes to “${own(a.said)}”${state}.`,
    possibility: possibility + FIT,
    step: 'The next time you’re asked, give yourself a pause before you answer, even a short one, and use it to check what you want.',
    say,
  }
}

function week(a: SenseAnswers): SenseResult {
  const felt = pick({ heavy: 'heavy', busy: 'busy and rushed', flat: 'flat', mixed: 'up and down', good: 'good, mostly' }, a.felt, 'full')
  const possibility = pick(
    {
      heavy: 'One possibility is that you’ve been carrying more than usual, with little chance to set it down.',
      busy: 'One possibility is that the pace left little room to notice how you were doing.',
      flat: 'One possibility is that something that usually gives you energy has been missing this week.',
      mixed: 'One possibility is that the good parts and the hard parts both count, and the week was both.',
      good: 'One possibility is that something this week suited you well, and it’s worth noticing what.',
    },
    a.felt,
    'One possibility is that the week asked a lot of you.',
  )
  const step = pick(
    {
      rest: 'Put one hour of rest in your week before anything else goes in, and keep it like any other plan.',
      people: 'Message one person you like this week and suggest a time to meet.',
      room: 'Take a short walk on your own once this week, with your phone in your pocket.',
      done: 'Choose the one task that would make next week feel lighter, and do it first.',
      joy: 'Plan one small thing to look forward to before Sunday.',
    },
    a.need,
    'Plan one small thing to look forward to before Sunday.',
  )
  const say = a.need === 'people' ? 'I’ve missed you. Would you like to meet up this week?' : undefined
  return { described: `This week felt ${felt}, and what stayed with you was: “${own(a.most)}”.`, possibility: possibility + FIT, step, ...(say ? { say } : {}) }
}

function reflect(a: SenseAnswers): SenseResult {
  const possibility = pick(
    {
      lighter: 'One possibility is that this needed somewhere to go, and now it has one.',
      clearer: 'One possibility is that you knew more than you thought, and writing gave it a shape.',
      same: 'One possibility is that this is still unfolding, and one look isn’t meant to settle it.',
      heavier: 'One possibility is that writing it down made it more real. That can be hard, and it’s also where change starts.',
    },
    a.now,
    'One possibility is that it helped to put it into words.',
  )
  const step =
    a.now === 'heavier'
      ? 'If it feels like too much to carry alone, tell one person you trust today, even in a sentence.'
      : 'Come back to it tomorrow and read it once. Notice what has changed, if anything.'
  return { described: `You wrote: “${own(a.what)}”.`, possibility: possibility + FIT, step }
}

const BUILD: Record<SenseStart, (a: SenseAnswers) => SenseResult> = { overthinking, conversation, yes: sayingYes, week, reflect }

export const resultFor = (start: SenseStart, answers: SenseAnswers): SenseResult => BUILD[start](answers)

// The words the person wrote, from whichever question asked for them.
const wordsOf = (start: SenseStart, answers: SenseAnswers): string =>
  QUESTIONS[start]
    .filter((q) => q.kind === 'words')
    .map((q) => own(answers[q.id]))
    .filter(Boolean)
    .join(' ')

// A step from a hard moment is checked on two days later, while it's fresh.
export const SENSE_CHECK_IN_DAYS = 2

// keepSense keeps the result as the person left it, edits and all, and the
// step as something to try. It returns the kept reflection's id.
export function keepSense(start: SenseStart, answers: SenseAnswers, result: SenseResult, today: string, now: number = Date.now()): string {
  const id = `sense-${now}`
  keepReflection({
    id,
    date: today,
    period: 'day',
    area: start === 'conversation' && answers.who === 'work' ? 'work' : start === 'conversation' && answers.who === 'family' ? 'family' : 'self',
    group: 'learnt',
    source: 'sense',
    about: '',
    question: startLabel(start),
    answer: wordsOf(start, answers) || result.described,
    start,
    possibility: result.possibility,
    step: result.step,
    ...(result.say ? { say: result.say } : {}),
  })
  keepIntention({ id: `${id}-step`, date: today, text: result.step, from: id, days: SENSE_CHECK_IN_DAYS })
  return id
}

export type SenseMemory = { step: string; on: string; line: string }

// memoryFor finds the latest step the person tried in a moment like this one
// and said helped. Nothing without that record.
export function memoryFor(start: SenseStart, today: string, written: Reflection[] = reflections()): SenseMemory | null {
  const similar = new Map(written.filter((r) => r.source === 'sense' && r.start === start && r.date < today).map((r) => [r.id, r]))
  const helped = intentions().find((i) => similar.has(i.from) && i.check === 'helped')
  if (!helped) return null
  const day = dateOf(helped.date, { day: 'numeric', month: 'long' })
  return { step: helped.text, on: helped.date, line: `You described something similar on ${day}. You tried “${own(helped.text)}”, and you said it helped. Would that be useful here?` }
}
