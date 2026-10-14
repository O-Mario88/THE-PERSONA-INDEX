import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import type { DailySet, QuestionResults } from './api'

const today: DailySet = {
  date: '2026-10-12',
  questions: [
    {
      id: 'q-dishes',
      prompt: 'When do you wash the dishes?',
      options: [
        {
          id: 'right-away',
          label: 'Right after eating',
          insight: {
            reveal: 'People who wash up straight away often find unfinished tasks noisier than most.',
            research: 'Making a specific when-then plan helps people reach goals.',
            sourceTitle: 'Gollwitzer & Sheeran, 2006',
            sourceUrl: 'https://example.org/study',
            strength: 'strong',
            step: 'Next time a small task appears, notice the itch to finish it.',
          },
        },
        {
          id: 'end-of-day',
          label: 'At the end of the day',
          insight: {
            reveal: 'Batching chores suggests you protect your evenings for one big reset.',
            step: 'Try one batch of chores at a set time this week.',
          },
        },
      ],
    },
    {
      id: 'q-bill',
      prompt: 'How do you split the bill?',
      options: [
        { id: 'even', label: 'Split it evenly' },
        { id: 'itemised', label: 'Pay for what you ordered' },
      ],
    },
    {
      id: 'q-alarm',
      prompt: 'How many alarms do you set?',
      options: [
        { id: 'one', label: 'One' },
        { id: 'many', label: 'Several' },
      ],
    },
  ],
}

const dishesResults: QuestionResults = {
  questionId: 'q-dishes',
  totalVotes: 3,
  options: [
    { optionId: 'right-away', count: 2, percent: 66.7 },
    { optionId: 'end-of-day', count: 1, percent: 33.3 },
  ],
}

type Route = { status: number; body: unknown }

function json({ status, body }: Route): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Stubs fetch with a tiny router; returns the mock so tests can inspect calls.
function stubApi(routes: {
  today?: Route
  vote?: Route
  results?: Route
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/questions/today') {
      return json(routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/votes' && init?.method === 'POST') {
      return json(routes.vote ?? { status: 202, body: { status: 'accepted', eventId: 'evt_1' } })
    }
    if (url.endsWith('/results')) {
      return json(routes.results ?? { status: 200, body: dishesResults })
    }
    return json({ status: 404, body: { error: 'not_found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it("shows today's three questions", async () => {
    stubApi({})
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(screen.getByText('How do you split the bill?')).toBeInTheDocument()
    expect(screen.getByText('How many alarms do you set?')).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
  })

  it('casts a vote with an idempotency key and device id, then shows the real results', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))

    const card = screen.getByRole('region', { name: 'When do you wash the dishes?' })
    expect(await within(card).findByText('66.7%')).toBeInTheDocument()
    expect(within(card).getByText('33.3%')).toBeInTheDocument()
    expect(within(card).getByText('3 votes so far')).toBeInTheDocument()
    expect(within(card).getByText('Your answer')).toBeInTheDocument()
    expect(within(card).queryByRole('button')).not.toBeInTheDocument()

    const voteCall = fetchMock.mock.calls.find(([u]) => u === '/api/votes')!
    const init = voteCall[1]!
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toMatch(/\S+/)
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ questionId: 'q-dishes', optionId: 'right-away' })
    expect(body.voterId).toBe(localStorage.getItem('pi.device'))
  })

  it('shows the insight card for the chosen answer right after voting', async () => {
    stubApi({})
    render(<App />)
    expect(
      screen.queryByText(/unfinished tasks noisier/),
    ).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))

    const insight = await screen.findByRole('note', { name: 'What your answer may say' })
    expect(insight).toHaveTextContent('unfinished tasks noisier than most')
    expect(insight).toHaveTextContent('Strong evidence')
    expect(within(insight).getByRole('link', { name: 'Gollwitzer & Sheeran, 2006' })).toHaveAttribute(
      'href',
      'https://example.org/study',
    )
    expect(insight).toHaveTextContent('Try this: Next time a small task appears')
    expect(screen.queryByText(/Batching chores/)).not.toBeInTheDocument()
  })

  it('shows a card without research when the insight cites none', async () => {
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'At the end of the day' }))
    const insight = await screen.findByRole('note', { name: 'What your answer may say' })
    expect(insight).toHaveTextContent('Batching chores suggests')
    expect(within(insight).queryByRole('link')).not.toBeInTheDocument()
    expect(insight).not.toHaveTextContent('evidence')
  })

  it('says the vote is in rather than inventing numbers when the count is still zero', async () => {
    stubApi({
      results: {
        status: 200,
        body: {
          questionId: 'q-dishes',
          totalVotes: 0,
          options: [
            { optionId: 'right-away', count: 0, percent: 0 },
            { optionId: 'end-of-day', count: 0, percent: 0 },
          ],
        },
      },
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(
      await screen.findByText('Your vote is in. Results update in a few seconds.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('0%')).toHaveLength(2)
  })

  it('shows results when this device already voted', async () => {
    stubApi({ vote: { status: 409, body: { error: 'duplicate_vote' } } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByText('66.7%')).toBeInTheDocument()
    expect(screen.getByText(/already answered this one/)).toBeInTheDocument()
    expect(screen.queryByText('Your answer')).not.toBeInTheDocument()
  })

  it('keeps the same idempotency key when a failed vote is retried', async () => {
    const fetchMock = stubApi({ vote: { status: 503, body: { error: 'unavailable' } } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('did not go through')
    fireEvent.click(screen.getByRole('button', { name: 'Right after eating' }))
    await screen.findByRole('alert')

    const keys = fetchMock.mock.calls
      .filter(([u]) => u === '/api/votes')
      .map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('says so when no questions are published today', async () => {
    stubApi({ today: { status: 404, body: { error: 'no_questions_today' } } })
    render(<App />)
    expect(await screen.findByText(/No questions today yet/)).toBeInTheDocument()
  })

  it('offers a retry when the questions fail to load', async () => {
    const fetchMock = stubApi({ today: { status: 500, body: {} } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/questions/today')).toHaveLength(2)
  })
})
