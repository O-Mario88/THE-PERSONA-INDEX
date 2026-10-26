import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Option, Question } from './api'
import { keepCardText } from './insights'
import { Insights } from './InsightsPage'
import { setReflectSettings } from './journal'
import { intentions, keepReflection } from './notebook'
import type { AnswerRecord } from './profile'
import { voiceProblems } from './voice'

const today = '2026-10-25'

const question = (id: string, optionId = 'a'): Question => ({
  id,
  theme: 'habits',
  prompt: 'When do you wash the dishes?',
  options: (
    [
    {
      id: 'a',
      label: 'Right after eating',
      need: 'calm',
      insight: { reveal: 'You like a clear surface before you rest.', otherSide: 'It can cost you an evening.', step: 'Leave one cup until morning.' },
    },
    { id: 'heavy', label: 'I can’t face them', heavy: true },
    ] as Option[]
  ).filter((o) => o.id === optionId || o.id === 'a'),
})

function answered(id: string, optionId = 'a', more: Partial<AnswerRecord> = {}) {
  const h = JSON.parse(localStorage.getItem('pi.history.v1') ?? '{"answers":[],"skips":[]}')
  h.answers.push({ date: today, questionId: id, theme: 'habits', depth: 2, traits: {}, optionId, need: 'calm', ...more })
  localStorage.setItem('pi.history.v1', JSON.stringify(h))
  keepCardText(question(id, optionId), optionId, today)
}

type Counts = { questionId: string; total: number; options: { optionId: string; count: number; few?: boolean }[] }[]

function stubCounts(questions: Counts | null) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).startsWith('/api/not-alone') && questions) {
      return new Response(JSON.stringify({ date: today, days: 30, min: 20, questions }), { status: 200 })
    }
    return new Response('{"error":"unavailable"}', { status: 503 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const props = {
  today,
  questions: [] as Question[],
  pulse: false,
  onOpenMirror: vi.fn(),
  onOpenKept: vi.fn(),
  onOpenReflect: vi.fn(),
  onOpenSettings: vi.fn(),
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Insights', () => {
  it('has its own page, in the order of the design, with the Mirrors one tap away', () => {
    stubCounts(null)
    const onOpenMirror = vi.fn()
    render(<Insights {...props} onOpenMirror={onOpenMirror} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Your Insights' })).toBeInTheDocument()
    expect(screen.getByText('Understand yourself. Discover you’re not alone. Find what helps.')).toBeInTheDocument()
    const sections = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(sections).toEqual(['For You', 'You’re Not Alone', 'What Helped', 'Your Growth', 'Saved insights'])
    fireEvent.click(screen.getByRole('button', { name: 'Your Mirrors →' }))
    expect(onOpenMirror).toHaveBeenCalled()
  })

  it('says honestly what has no data yet, and never makes rows up', () => {
    stubCounts(null)
    render(<Insights {...props} />)
    expect(screen.getByText(/Answer a few questions and what they may say about you shows here/)).toBeInTheDocument()
    expect(screen.getByText('This fills in as you and others report back on the small steps you try.')).toBeInTheDocument()
    expect(screen.getByText('This fills in over the weeks, from your own earlier and recent answers.')).toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })

  it('shows a card from the person’s own answer: the reading, what may matter, the other side and a step', () => {
    stubCounts(null)
    answered('2026-10-25-q1')
    render(<Insights {...props} />)
    const card = screen.getByRole('article', { name: /When do you wash the dishes\?/ })
    expect(card).toHaveTextContent('A thought from today')
    expect(card).toHaveTextContent('You like a clear surface before you rest.')
    expect(within(card).getByRole('list', { name: 'What may matter here' })).toHaveTextContent('Feeling settled')
    expect(card).toHaveTextContent('The Other Side It can cost you an evening.')
    expect(card).toHaveTextContent('Something you could try')
    expect(card).toHaveTextContent('For self-reflection, not a diagnosis.')
    for (const name of ['Reflect on this', 'Saved', 'Weekly Mirror']) expect(within(card).getByRole('button', { name })).toBeInTheDocument()
  })

  it('keeps the small step as an intention in Reflect', () => {
    stubCounts(null)
    answered('2026-10-25-q1')
    render(<Insights {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save as an intention' }))
    expect(screen.getByRole('status')).toHaveTextContent('Saved as an intention in Reflect.')
    expect(intentions().map((i) => i.text)).toEqual(['Leave one cup until morning.'])
  })

  it('takes "That’s me", "Partly" and "Not me", and lets a "Not me" card go', async () => {
    stubCounts(null)
    vi.useFakeTimers()
    answered('2026-10-25-q1')
    render(<Insights {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    expect(screen.getByText("You told me this isn't you, so I'll watch rather than assume.")).toBeInTheDocument()
    const h = JSON.parse(localStorage.getItem('pi.history.v1')!)
    expect(h.answers[0].verdict).toBe('not_me')
    await act(() => vi.advanceTimersByTimeAsync(1600))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('meets a heavy answer with people and a helpline, not a cheerful step', () => {
    stubCounts(null)
    answered('2026-10-25-q2', 'heavy', { heavy: true })
    render(<Insights {...props} />)
    const card = screen.getByRole('article', { name: /When do you wash the dishes\?/ })
    expect(card).toHaveTextContent('That sounds really hard.')
    expect(within(card).getByRole('link', { name: 'Talk to someone now' })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('Something you could try')
    expect(within(card).queryByRole('button', { name: 'Save as an intention' })).not.toBeInTheDocument()
  })

  it('looks back 30 days when asked', () => {
    stubCounts(null)
    const h = { answers: [{ date: '2026-10-05', questionId: '2026-10-05-q', theme: 'habits', depth: 2, traits: {}, optionId: 'a', need: 'calm' }], skips: [] }
    localStorage.setItem('pi.history.v1', JSON.stringify(h))
    keepCardText(question('2026-10-05-q'), 'a', '2026-10-05')
    render(<Insights {...props} />)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    expect(screen.getByRole('article')).toHaveTextContent('A thought from 5 October')
  })
})

describe("You're not alone", () => {
  it('stays off, and asks nothing of the server, until the Human Pulse is turned on', () => {
    const fetchMock = stubCounts([])
    answered('2026-10-25-q1')
    render(<Insights {...props} />)
    const section = screen.getByRole('region', { name: 'You’re Not Alone' })
    expect(section).toHaveTextContent('Off unless you turn it on.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the real count and the total, never a percentage', async () => {
    stubCounts([{ questionId: '2026-10-25-q1', total: 140, options: [{ optionId: 'a', count: 37 }] }])
    answered('2026-10-25-q1')
    render(<Insights {...props} pulse />)
    expect(await screen.findByText('37 of 140 people chose the same response.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it('says the picture is still forming below the minimum, and leaves heavy answers out', async () => {
    stubCounts([])
    answered('2026-10-25-q1')
    answered('2026-10-25-q2', 'heavy', { heavy: true })
    render(<Insights {...props} pulse />)
    const section = screen.getByRole('region', { name: 'You’re Not Alone' })
    expect(await within(section).findByText('The picture is still forming.')).toBeInTheDocument()
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
  })

  it('says so when the counts cannot be reached', async () => {
    stubCounts(null)
    answered('2026-10-25-q1')
    render(<Insights {...props} pulse />)
    expect(await screen.findByText('The counts can’t be reached just now.')).toBeInTheDocument()
  })
})

describe('the words on the page', () => {
  it('keep the voice rules', () => {
    stubCounts(null)
    answered('2026-10-25-q1')
    render(<Insights {...props} />)
    const text = document.body.textContent ?? ''
    for (const sentence of text.split(/(?<=[.!?])\s+/)) expect(voiceProblems(sentence)).toEqual([])
  })
})

describe('Your Growth', () => {
  function answeredOn(date: string, id: string, theme: string, prompt: string, label: string) {
    const h = JSON.parse(localStorage.getItem('pi.history.v1') ?? '{"answers":[],"skips":[]}')
    h.answers.push({ date, questionId: id, theme, depth: 2, traits: {}, optionId: 'a' })
    localStorage.setItem('pi.history.v1', JSON.stringify(h))
    localStorage.setItem(`pi.insight.${id}`, JSON.stringify({ date, questionId: id, theme, prompt, label }))
  }

  it('shows an earlier and a more recent answer in one part of life, side by side, with nothing added', () => {
    stubCounts(null)
    answeredOn('2026-10-05', 'q-old', 'colleagues', 'Stuck on a task for an hour?', 'Stay late alone')
    answeredOn('2026-10-24', 'q-new', 'colleagues', 'Your idea is ignored?', 'Raise it again')
    render(<Insights {...props} />)
    const section = screen.getByRole('region', { name: 'Your Growth' })
    const pair = within(section).getByRole('article', { name: 'Work' })
    expect(pair).toHaveTextContent('Earlier · 5 October')
    expect(pair).toHaveTextContent('Stuck on a task for an hour? You chose “Stay late alone”.')
    expect(pair).toHaveTextContent('More recent · 24 October')
    expect(pair).toHaveTextContent('Your idea is ignored? You chose “Raise it again”.')
    expect(within(section).getByText(/Only your own answers, side by side\. What changed, if anything, is yours to say\./)).toBeInTheDocument()
  })

  it('says honestly why it is empty until two answers are two weeks apart', () => {
    stubCounts(null)
    answeredOn('2026-10-20', 'q-old', 'colleagues', 'A?', 'x')
    answeredOn('2026-10-24', 'q-new', 'colleagues', 'B?', 'y')
    render(<Insights {...props} />)
    const section = screen.getByRole('region', { name: 'Your Growth' })
    expect(within(section).getByText('This fills in over the weeks, from your own earlier and recent answers.')).toBeInTheDocument()
    expect(within(section).queryAllByRole('article')).toHaveLength(0)
  })

  it('includes reflections only once the person turns that on in Reflect', () => {
    stubCounts(null)
    keepReflection({ id: 'r1', date: '2026-10-01', period: 'day', area: 'health', group: 'learnt', source: 'answers', about: '', question: 'What did today teach you?', answer: 'I keep staying up.' })
    keepReflection({ id: 'r2', date: '2026-10-23', period: 'day', area: 'health', group: 'learnt', source: 'answers', about: '', question: 'What did today teach you?', answer: 'I slept better after the walk.' })
    const { unmount } = render(<Insights {...props} />)
    expect(screen.queryByText(/I slept better/)).not.toBeInTheDocument()
    unmount()
    setReflectSettings({ reflectionsInGrowth: true })
    render(<Insights {...props} />)
    const pair = screen.getByRole('article', { name: 'Health, in your reflections' })
    expect(pair).toHaveTextContent('What did today teach you? “I keep staying up.”')
    expect(pair).toHaveTextContent('What did today teach you? “I slept better after the walk.”')
  })
})
