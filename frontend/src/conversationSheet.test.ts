import { beforeEach, describe, expect, it } from 'vitest'
import { BOX_TITLES, DEFAULT_PARTS, makeSheet, SHEET_EMPTY, SHEET_FOOTER, sheetDates, sheetGate, sheetHTML, sheetTitles, wordsChoices, type SheetInput } from './conversationSheet'
import type { CheckIn } from './growthJourney'
import type { CardText } from './insights'
import type { Move } from './moves'
import type { GoodThings, Reflection } from './notebook'
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

const good: GoodThings[] = [
  { kind: 'good', at: 1, date: '2026-10-28', lines: ['Lunch with my sister', 'Finished the report', 'A long walk in the park'] },
  { kind: 'good', at: 1, date: '2026-10-26', lines: ['Called mum', 'Slept well'] },
  { kind: 'good', at: 1, date: '2026-10-12', lines: ['An old good thing'] },
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

const input = (over: Partial<SheetInput> = {}): SheetInput => ({
  today: TODAY,
  range: 7,
  parts: DEFAULT_PARTS,
  history,
  moves,
  checks,
  textOf: (id) => cards[id] ?? null,
  good,
  written,
  picked: [],
  name: 'Edwin',
  ...over,
})

describe('the conversation sheet', () => {
  it('covers the days chosen, ending today', () => {
    expect(makeSheet(input())).toMatchObject({ from: '2026-10-23', to: TODAY, range: 7, name: 'Edwin' })
    expect(makeSheet(input({ range: 30 })).from).toBe('2026-09-30')
  })

  it('names the parts of life and the needs that came up most, never from an intimacy answer', () => {
    expect(makeSheet(input()).energy).toEqual({
      areas: ['Work', 'Family', 'Friends and social'],
      line: 'From 4 answers on 4 days. What I reached for most was feeling settled and doing well.',
    })
  })

  it('shows both sides of a reading the person said sounds like them', () => {
    expect(makeSheet(input()).sides).toEqual([
      { label: 'What sounded like me', text: 'You carry more than your share without being asked.' },
      { label: 'The other side of it', text: 'When you never say no, your own work waits until the evening.' },
    ])
  })

  it('lists only the steps that helped or made things harder, newest first, in the first person', () => {
    expect(makeSheet(input()).tried).toEqual(['Tried “Ask one person for help”: it made things harder.', 'Tried “Say no to one extra shift”: it helped a little, and I felt a little lighter.'])
  })

  it('asks two open questions from what is still unresolved', () => {
    expect(makeSheet(input()).talk).toEqual([
      'Trying “Ask one person for help” made things harder. What got in the way?',
      'A reading said “You plan in years, not weeks”, and I said it only partly fits. Which part doesn’t?',
    ])
  })

  it('counts the good things and says what they were mostly about', () => {
    expect(makeSheet(input()).good).toBe('I noted good things on 2 of these 7 days, most often about time with people.')
    expect(makeSheet(input({ good: [] })).good).toBe('No good things noted in these days.')
  })

  it('leaves out whatever the person unticks, and still offers questions to talk through', () => {
    const s = makeSheet(input({ parts: { patterns: false, steps: false, good: false, words: false } }))
    expect(s).toMatchObject({ energy: null, sides: null, tried: null, good: null, words: null })
    expect(s.talk).toEqual(['What would make the coming week feel a little lighter?', 'What would I most like this conversation to help me with?'])
    const html = sheetHTML(s)
    expect(html).not.toContain('Ask one person for help')
    expect(html).not.toContain('Work')
  })

  it('brings in the person’s own words only when they turn them on, and only the ones they tick', () => {
    expect(makeSheet(input({ picked: ['moment-1'] })).words).toBeNull()
    const s = makeSheet(input({ parts: { ...DEFAULT_PARTS, words: true }, picked: ['moment-1', 'r-2', 'r-old'] }))
    expect(s.words).toEqual([
      { date: '2026-10-27', question: null, text: 'Told my manager I needed the evening off.' },
      { date: '2026-10-26', question: 'What did this week teach you about rest?', text: 'That I rest better when I plan it.' },
    ])
    expect(sheetHTML(s)).not.toContain('Words nobody ticked')
  })

  it('offers the moments and reflections of those days to pick from, newest first', () => {
    expect(wordsChoices(written, '2026-10-23', TODAY).map((r) => r.id)).toEqual(['moment-1', 'r-2', 'r-3'])
  })

  it('writes one printable page with every word escaped', () => {
    const s = makeSheet(input({ parts: { ...DEFAULT_PARTS, words: true }, written: [reflection('x', '2026-10-28', '<script>alert(1)</script> & more')], picked: ['x'] }))
    const html = sheetHTML(s, { regular: 'data:font/ttf;base64,AA', bold: 'data:font/ttf;base64,BB' })
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; more')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Where my energy went')
    expect(html).toContain('data:font/ttf;base64,AA')
    expect(html).toContain('never a diagnosis')
    // A font address that could break out of the page's style is left out.
    expect(sheetHTML(s, { regular: "x');}</style><script>alert(1)</script>" })).not.toContain('</style><script>')
  })

  it('speaks in the app’s own voice', () => {
    const full = makeSheet(input({ parts: { ...DEFAULT_PARTS, words: true }, picked: ['moment-1'] }))
    const bare = makeSheet(input({ parts: { patterns: false, steps: false, good: false, words: false } }))
    const lines = [
      full.energy?.line ?? '',
      ...(full.sides ?? []).map((x) => x.label),
      ...(full.tried ?? []),
      ...full.talk,
      ...bare.talk,
      full.good ?? '',
      SHEET_FOOTER,
      ...Object.values(BOX_TITLES),
      ...Object.values(SHEET_EMPTY),
      ...[7, 14, 30].flatMap((r) => Object.values(sheetTitles(r as 7 | 14 | 30))),
    ]
    for (const line of lines) expect(voiceProblems(line), line).toEqual([])
  })

  it('speaks as the person, so a need for choosing is “choosing for myself”', () => {
    const own = { answers: [answer('2026-10-28', 'plans-asked-about', 'plans', { need: 'freedom' })], skips: [] } as History
    const s = makeSheet(input({ history: own }))
    expect(s.energy).toEqual({ areas: ['Myself'], line: 'From 1 answer on 1 day. What I reached for most was choosing for myself.' })
    expect(s.talk).toContain('Choosing for myself kept coming up. Where would I like more of it right now?')
  })

  it('writes the span of days as the phone writes dates', () => {
    // The spacing around the dash differs between engines, so it isn't pinned.
    expect(sheetDates({ from: '2026-10-23', to: TODAY })).toMatch(/^23\s?–\s?29 October 2026$/)
    expect(sheetDates({ from: '2026-09-30', to: TODAY })).toMatch(/^30 September\s?–\s?29 October 2026$/)
  })

  it('names itself after the days it covers', () => {
    expect(sheetTitles(7)).toEqual({ title: 'My last 7 days', sides: 'Both sides of my week' })
    expect(sheetTitles(14)).toEqual({ title: 'My last 14 days', sides: 'Both sides of my last two weeks' })
    expect(sheetTitles(30)).toEqual({ title: 'My last 30 days', sides: 'Both sides of my month' })
  })
})

// Edwin: "Every user gets their first Conversation Sheet free… Preparing
// conversation sheets across 14 and 30 days is part of The Persona Index Patron."
describe('who can make which sheet', () => {
  it('keeps the last 7 days open to everyone, gives one longer sheet free, then asks for Patron', () => {
    expect(sheetGate(7, TODAY)).toBe('open')
    expect(sheetGate(30, TODAY)).toBe('trial')
    noteFreeTry('sheet')
    expect(sheetGate(14, TODAY)).toBe('patron')
    expect(sheetGate(7, TODAY)).toBe('open')
    savePatron({ plan: 'monthly', until: '2026-11-28' })
    expect(sheetGate(30, TODAY)).toBe('open')
  })
})
