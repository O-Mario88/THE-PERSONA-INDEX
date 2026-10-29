import { describe, expect, it } from 'vitest'
import { focusChoices, FOCUS_NEXT, matteredOf, recurringOf, saidHelped, stillOpen, WEEK_QUESTIONS } from './mirrorWeek'
import type { HelpedItem } from './mirrorStory'
import type { Reflection } from './notebook'
import { voiceProblems } from './voice'

// Edwin's brief, 2026-10-29: the weekly Mirror answers five questions, then
// offers one action, "Choose what to focus on next". Every answer comes from
// what the person kept, chose or said; nothing is made up to fill a gap.

const FROM = '2026-10-26'
const TO = '2026-11-01'

const written = (id: string, date: string, answer: string, extra: Partial<Reflection> = {}): Reflection => ({
  kind: 'reflection',
  at: Number(date.replaceAll('-', '')),
  id,
  date,
  period: 'day',
  area: 'self',
  group: 'learnt',
  source: 'answers',
  about: '',
  question: 'What did this week teach you?',
  answer,
  ...extra,
})
const sense = (id: string, date: string, answer: string, start: 'overthinking' | 'yes' | 'conversation') =>
  written(id, date, answer, {
    source: 'sense',
    start,
    question: { overthinking: 'I keep overthinking something.', yes: 'I keep saying yes when I want to say no.', conversation: 'I need to have a difficult conversation.' }[start],
  })

const notebook: Reflection[] = [
  sense('s-1', '2026-10-27', 'the interview on Friday', 'overthinking'),
  written('m-1', '2026-10-28', 'Walked home with my sister and laughed.', { source: 'moment', question: 'A moment worth keeping', free: true }),
  sense('s-2', '2026-10-29', 'whether I said the wrong thing to my manager', 'overthinking'),
  written('a-1', '2026-10-29', 'Private answer words stay out of this.'),
  sense('s-old', '2026-10-12', 'last month’s worry', 'yes'),
]

const item = (text: string, outcome: HelpedItem['outcome']): HelpedItem => ({ text, outcome, date: '2026-10-28', source: 'intention', times: 1 })
const helped: HelpedItem[] = [
  item('Write it down once, then close the notebook.', 'helped'),
  item('Ask for time before answering.', 'some'),
  item('Say no to one extra shift.', 'no_change'),
  item('Ask one person for help.', 'harder'),
  item('Take a short walk at lunch.', 'testing'),
  item('Plan one hour of rest.', 'not_tried'),
  item('Let this go.', 'let_go'),
]

describe('the weekly Mirror’s five questions', () => {
  it('asks the five questions from the brief, then offers one action', () => {
    expect(Object.values(WEEK_QUESTIONS)).toEqual([
      'What mattered this week?',
      'What kept recurring?',
      'What did you say helped?',
      'What is still unresolved?',
      'What do you want to carry into next week?',
    ])
    expect(FOCUS_NEXT).toBe('Choose what to focus on next')
  })

  it('says what mattered from the moments they made sense of or kept that week, newest first', () => {
    expect(matteredOf(notebook, FROM, TO)).toEqual([
      { id: 's-2', date: '2026-10-29', label: 'I keep overthinking something.', text: 'whether I said the wrong thing to my manager' },
      { id: 'm-1', date: '2026-10-28', label: 'A moment you kept', text: 'Walked home with my sister and laughed.' },
      { id: 's-1', date: '2026-10-27', label: 'I keep overthinking something.', text: 'the interview on Friday' },
    ])
    expect(matteredOf([], FROM, TO)).toEqual([])
  })

  it('names a starting point they came back to more than once, and nothing that happened once', () => {
    expect(recurringOf(notebook, FROM, TO)).toEqual(['You came back to “I keep overthinking” twice this week.'])
    expect(recurringOf(notebook.slice(0, 2), FROM, TO)).toEqual([])
  })

  it('keeps what they said helped apart from what is still open, and leaves out what they let go', () => {
    expect(saidHelped(helped).map((i) => i.text)).toEqual(['Write it down once, then close the notebook.', 'Ask for time before answering.'])
    expect(stillOpen(helped).map((i) => i.outcome)).toEqual(['no_change', 'harder', 'testing', 'not_tried'])
  })

  it('offers what to focus on next from the suggestion, what helped and what is still open, never a step that made things harder', () => {
    const choices = focusChoices({ key: 'need.rest', text: 'Plan one restful evening this week.', why: '' }, helped)
    expect(choices.map((c) => c.text)).toEqual([
      'Plan one restful evening this week.',
      'Keep “Write it down once, then close the notebook” going.',
      'Keep “Ask for time before answering” going.',
      'Keep finding out how “Take a short walk at lunch” works for you.',
    ])
    expect(choices.map((c) => c.text).join(' ')).not.toContain('Ask one person for help')
    expect(new Set(choices.map((c) => c.key)).size).toBe(choices.length)
    expect(focusChoices(null, []).length).toBe(0)
    expect(focusChoices(null, [item('Plan one hour of rest.', 'not_tried')]).map((c) => c.text)).toEqual(['Try “Plan one hour of rest” this week.'])
  })

  it('speaks in the app’s own voice', () => {
    const lines = [...Object.values(WEEK_QUESTIONS), FOCUS_NEXT, ...recurringOf(notebook, FROM, TO), ...focusChoices(null, helped).map((c) => c.text)]
    for (const line of lines) expect(voiceProblems(line), line).toEqual([])
  })
})
