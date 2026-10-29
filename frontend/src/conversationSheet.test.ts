import { beforeEach, describe, expect, it } from 'vitest'
import { BRIEF_FOR, briefTitle, linesOf, makeSheet, SECTION_TITLES, SHEET_EMPTY, SHEET_FOOTER, sheetDates, sheetGate, sheetHTML, wordsChoices, type SheetInput } from './conversationSheet'
import type { CheckIn } from './growthJourney'
import type { CardText } from './insights'
import type { Move } from './moves'
import type { Intention, Reflection } from './notebook'
import { noteFreeTry, savePatron } from './patron'
import type { History } from './profile'
import { voiceProblems } from './voice'

beforeEach(() => localStorage.clear())

const TODAY = '2026-10-29'
const answer = (date: string, bank: string, theme: string, extra: Record<string, unknown> = {}) => ({ date, questionId: `${date}-${bank}`, theme, depth: 2, traits: {}, optionId: 'o1', ...extra })

const history: History = {
  answers: [
    answer('2026-10-28', 'colleagues-extra-work', 'colleagues', { need: 'calm', verdict: 'me' }),
    answer('2026-10-27', 'work-career-five-years', 'work-career', { need: 'competence', verdict: 'partly' }),
    answer('2026-10-26', 'family-sunday', 'family', { need: 'calm' }),
    answer('2026-10-25', 'friendship-late-cancel', 'friendship', { need: 'belonging' }),
    answer('2026-10-25', 'intimacy-how-often', 'intimacy', { need: 'belonging', verdict: 'me' }),
    answer('2026-10-10', 'money-earn-ask', 'money', { need: 'security' }),
  ],
  skips: [],
} as History

const card = (questionId: string, reveal: string, otherSide?: string): CardText => ({
  date: questionId.slice(0, 10),
  questionId,
  prompt: 'A question.',
  label: 'An answer',
  reveal,
  ...(otherSide ? { otherSide } : {}),
})
const cards: Record<string, CardText> = {
  '2026-10-28-colleagues-extra-work': card(
    '2026-10-28-colleagues-extra-work',
    'You carry more than your share without being asked. People come to rely on it.',
    'When you never say no, your own work waits until the evening.',
  ),
  '2026-10-27-work-career-five-years': card('2026-10-27-work-career-five-years', 'You plan in years, not weeks. A long view steadies you.'),
  '2026-10-25-intimacy-how-often': card('2026-10-25-intimacy-how-often', 'A private reading that never leaves Insights.'),
}

const move = (date: string, questionId: string, step: string, status: Move['status']): Move => ({ date, questionId, optionId: 'o', step, status })
const moves: Move[] = [
  move('2026-10-24', 'q-a', 'Say no to one extra shift.', 'helped'),
  move('2026-10-25', 'q-b', 'Ask one person for help.', 'no_change'),
  move('2026-10-26', 'q-c', 'Take a ten-minute walk after lunch.', 'no_change'),
  move('2026-10-01', 'q-old', 'An old step.', 'helped'),
  move('2026-10-27', 'q-d', 'Write down three worries.', 'started'),
]
const checks: CheckIn[] = [
  { questionId: 'q-a', date: '2026-10-26', tried: 'yes', outcome: 'helped_little', feeling: 'lighter' },
  { questionId: 'q-b', date: '2026-10-27', tried: 'yes', outcome: 'harder' },
  { questionId: 'q-c', date: '2026-10-28', tried: 'yes', outcome: 'no_difference' },
  { questionId: 'q-old', date: '2026-10-02', tried: 'yes', outcome: 'helped' },
]

const reflection = (id: string, date: string, answerText: string, extra: Partial<Reflection> = {}): Reflection => ({
  kind: 'reflection',
  at: 1,
  id,
  date,
  period: 'day',
  area: 'self',
  group: 'learnt',
  source: 'answers',
  about: '',
  question: 'What did this week teach you about rest?',
  answer: answerText,
  ...extra,
})
const written: Reflection[] = [
  reflection('moment-1', '2026-10-27', 'Told my manager I needed the evening off.', { source: 'moment', question: 'A moment worth keeping', free: true }),
  reflection('r-2', '2026-10-26', 'That I rest better when I plan it.'),
  reflection('r-3', '2026-10-25', 'Words nobody ticked, so they never show.'),
  reflection('r-old', '2026-09-01', 'Too long ago.'),
]

const intention = (id: string, date: string, text: string, check?: Intention['check']): Intention => ({
  kind: 'intention',
  at: 1,
  id,
  date,
  text,
  from: 'sense-x',
  checkOn: date,
  ...(check ? { check, checkedOn: date } : {}),
})
const kept: Intention[] = [
  intention('i-1', '2026-10-27', 'Ask for time before answering.', 'helped'),
  intention('i-2', '2026-10-26', 'Plan one hour of rest.', 'not_yet'),
  intention('i-3', '2026-10-25', 'Let this one go.', 'let_go'),
]

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  today: TODAY,
  range: 7,
  for: 'counsellor',
  discuss: 'I keep taking on extra work and I am tired all the time.',
  history,
  moves,
  checks,
  intentions: kept,
  textOf: (id) => cards[id] ?? null,
  written,
  picked: [],
  name: 'Edwin',
  ...over,
})

// Edwin's brief, 2026-10-29: "Make Bring to a Conversation a launch feature…
// for everyday conversations as well as professional sessions… 1. What I want
// to discuss. 2. Specific moments I selected. 3. What I felt or needed. 4. What
// I tried and what happened. 5. Questions or requests I want to bring. Users
// must preview and edit it before exporting or sharing."
describe('the conversation brief', () => {
  it('is for someone the person chooses, in everyday words', () => {
    expect(BRIEF_FOR.map((f) => f.purpose)).toEqual([
      'Help me explain this to my partner.',
      'Help me prepare for my manager.',
      'Help me get the most from my next session.',
      'Help me remember what to discuss in my session.',
      'Help me say what’s been on my mind.',
    ])
    expect(makeSheet(input({ for: 'manager' })).for).toBe('manager')
    expect(briefTitle('manager')).toBe('To talk through with my manager')
  })

  it('covers the days chosen, ending today', () => {
    expect(makeSheet(input())).toMatchObject({ from: '2026-10-23', to: TODAY, range: 7, name: 'Edwin' })
    expect(makeSheet(input({ range: 30 })).from).toBe('2026-09-30')
  })

  it('starts with what the person wants to discuss, in their own words', () => {
    expect(makeSheet(input()).discuss).toBe('I keep taking on extra work and I am tired all the time.')
  })

  it('brings in only the moments the person picked from those days', () => {
    expect(makeSheet(input()).moments).toEqual([])
    expect(makeSheet(input({ picked: ['moment-1', 'r-2', 'r-old'] })).moments).toEqual([
      { date: '2026-10-27', question: null, text: 'Told my manager I needed the evening off.' },
      { date: '2026-10-26', question: 'What did this week teach you about rest?', text: 'That I rest better when I plan it.' },
    ])
  })

  it('says what they felt or needed, from what came up most, never from an intimacy answer', () => {
    expect(makeSheet(input()).felt).toEqual(['Where my energy went: work, family, friends and social.', 'What I reached for most was feeling settled and doing well.'])
  })

  it('adds a hard moment they made sense of in those days, in their words', () => {
    const sense = reflection('sense-1', '2026-10-28', 'the extra shift', { source: 'sense', start: 'yes', question: 'I keep saying yes when I want to say no.' })
    expect(makeSheet(input({ written: [...written, sense] })).felt[0]).toBe('I keep saying yes when I want to say no.')
  })

  it('lists what they tried and how it went, from the questions and from steps they kept', () => {
    expect(makeSheet(input()).tried).toEqual([
      'Tried “Ask for time before answering”: it helped.',
      'Tried “Ask one person for help”: it made things harder.',
      'Planned “Plan one hour of rest”: I haven’t managed it yet.',
      'Tried “Say no to one extra shift”: it helped a little, and I felt a little lighter.',
    ])
  })

  it('lists a step they chose and haven’t reported on yet, without saying how it went', () => {
    const fresh = intention('i-4', '2026-10-29', 'Ask for a day to think before saying yes.')
    expect(makeSheet(input({ intentions: [fresh] })).tried).toContain('Chose to try “Ask for a day to think before saying yes”: too soon to say how it went.')
    expect(makeSheet(input({ intentions: [intention('i-5', '2026-09-01', 'Too long ago.')] })).tried.join(' ')).not.toContain('Too long ago')
  })

  it('offers questions to bring from what is unresolved, then one that suits who it’s for', () => {
    expect(makeSheet(input()).bring).toEqual([
      'Trying “Ask one person for help” made things harder. What got in the way?',
      'A reading said “You plan in years, not weeks”, and I said it only partly fits. Which part doesn’t?',
      'Feeling settled kept coming up. Where would I like more of it right now?',
    ])
    // A manager gets no personal readings or needs, only the practical.
    expect(makeSheet(input({ for: 'manager' })).bring).toEqual(['Trying “Ask one person for help” made things harder. What got in the way?', 'What would make my work feel more manageable right now?'])
    expect(makeSheet(input({ for: 'partner', history: { answers: [], skips: [] } as History, moves: [], checks: [] })).bring).toEqual(['What would help us both feel heard this week?'])
  })

  it('takes the person’s edits one line at a time, dropping empty lines', () => {
    expect(linesOf('  First thing \n\n Second thing\n')).toEqual(['First thing', 'Second thing'])
  })

  it('prints the five sections as the person left them, numbered, with every word escaped', () => {
    const s = { ...makeSheet(input({ picked: ['moment-1'] })), discuss: '<script>alert(1)</script> & more', bring: ['Can we change the rota?'] }
    const html = sheetHTML(s, { regular: 'data:font/ttf;base64,AA', bold: 'data:font/ttf;base64,BB' })
    for (const title of SECTION_TITLES) expect(html).toContain(title)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Can we change the rota?')
    expect(html).toContain('Told my manager I needed the evening off.')
    expect(html).toContain('data:font/ttf;base64,AA')
    expect(html).toContain('never a diagnosis')
    expect(sheetHTML(s, { regular: "x');}</style><script>alert(1)</script>" })).not.toContain('</style><script>')
    expect(sheetHTML({ ...s, moments: [], tried: [] })).toContain(SHEET_EMPTY.moments)
  })

  it('speaks in the app’s own voice', () => {
    const lines = [
      ...BRIEF_FOR.flatMap((f) => [f.label, f.purpose, f.placeholder, briefTitle(f.id)]),
      ...BRIEF_FOR.flatMap((f) => makeSheet(input({ for: f.id })).bring),
      ...makeSheet(input()).felt,
      ...makeSheet(input()).tried,
      ...SECTION_TITLES,
      ...Object.values(SHEET_EMPTY),
      SHEET_FOOTER,
    ]
    for (const line of lines) expect(voiceProblems(line), line).toEqual([])
  })

  it('speaks as the person, so a need for choosing is “choosing for myself”', () => {
    const own = { answers: [answer('2026-10-28', 'plans-asked-about', 'plans', { need: 'freedom' })], skips: [] } as History
    const s = makeSheet(input({ history: own, moves: [], checks: [] }))
    expect(s.felt).toEqual(['Where my energy went: myself.', 'What I reached for most was choosing for myself.'])
    expect(s.bring).toContain('Choosing for myself kept coming up. Where would I like more of it right now?')
  })

  it('offers the moments and reflections of those days to pick from, newest first', () => {
    expect(wordsChoices(written, '2026-10-23', TODAY).map((r) => r.id)).toEqual(['moment-1', 'r-2', 'r-3'])
  })

  it('writes the span of days as the phone writes dates', () => {
    // The spacing around the dash differs between engines, so it isn't pinned.
    expect(sheetDates({ from: '2026-10-23', to: TODAY })).toMatch(/^23\s?–\s?29 October 2026$/)
    expect(sheetDates({ from: '2026-09-30', to: TODAY })).toMatch(/^30 September\s?–\s?29 October 2026$/)
  })
})

// "Give them one complete brief free, so they can judge the actual result.
// Charge for recurring preparation and deeper synthesis across their history."
describe('who can make a brief', () => {
  it('gives one complete brief free, then asks for Patron', () => {
    expect(sheetGate(TODAY)).toBe('trial')
    noteFreeTry('sheet')
    expect(sheetGate(TODAY)).toBe('patron')
    savePatron({ plan: 'monthly', until: '2026-11-28' })
    expect(sheetGate(TODAY)).toBe('open')
  })
})
