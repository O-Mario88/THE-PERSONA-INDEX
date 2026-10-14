import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import type { DailySet, QuestionResults } from './api'

const today: DailySet = {
  date: '2026-10-12',
  edition: 3,
  tomorrowThemes: ['money', 'friendship'],
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
  vote?: Route | Route[]
  results?: Route
}) {
  let devices = 0
  let votes = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/device' && init?.method === 'POST') {
      devices++
      return json({ status: 201, body: { token: `v1.device${devices}.sig` } })
    }
    if (url === '/api/questions/today') {
      return json(routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/votes' && init?.method === 'POST') {
      const r = Array.isArray(routes.vote) ? routes.vote[Math.min(votes, routes.vote.length - 1)] : routes.vote
      votes++
      return json(r ?? { status: 202, body: { status: 'accepted', eventId: 'evt_1' } })
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

// Taps an answer, then answers the guess-the-crowd step.
async function answer(label: string, guess = 'Skip the guess') {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  fireEvent.click(await screen.findByRole('button', { name: guess }))
}

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

  it('casts a vote with an idempotency key and a server-issued device token, then shows the real results', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')

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
    expect(body.voterId).toBe('v1.device1.sig')
    expect(localStorage.getItem('pi.device.v1')).toBe('v1.device1.sig')
  })

  it('asks the server for a device token once and reuses it', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    await screen.findByText('66.7%')
    await answer('Split it evenly')
    await screen.findAllByText('66.7%')

    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/device')).toHaveLength(1)
    const voters = fetchMock.mock.calls
      .filter(([u]) => u === '/api/votes')
      .map(([, init]) => JSON.parse(String(init!.body)).voterId)
    expect(voters).toEqual(['v1.device1.sig', 'v1.device1.sig'])
  })

  it('replaces a token the server no longer accepts and retries the same vote once', async () => {
    localStorage.setItem('pi.device.v1', 'v1.stale.sig')
    const fetchMock = stubApi({
      vote: [
        { status: 401, body: { error: 'invalid_device' } },
        { status: 202, body: { status: 'accepted', eventId: 'evt_1' } },
      ],
    })
    render(<App />)
    await answer('Right after eating')
    expect(await screen.findByText('Your answer')).toBeInTheDocument()

    const calls = fetchMock.mock.calls.filter(([u]) => u === '/api/votes')
    expect(calls.map(([, init]) => JSON.parse(String(init!.body)).voterId)).toEqual([
      'v1.stale.sig',
      'v1.device1.sig',
    ])
    const keys = calls.map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
  })

  it('shows the insight card for the chosen answer right after voting', async () => {
    stubApi({})
    render(<App />)
    expect(
      screen.queryByText(/unfinished tasks noisier/),
    ).not.toBeInTheDocument()
    await answer('Right after eating')

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
    await answer('At the end of the day')
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
    await answer('Right after eating')
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

  it('asks how many people chose the same answer before showing anything else', async () => {
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    const guess = await screen.findByRole('group', { name: 'How many people do you think chose what you chose?' })
    expect(within(guess).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Almost nobody',
      'Some people',
      'About half',
      'Most people',
    ])
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.queryByText('66.7%')).not.toBeInTheDocument()
  })

  it('shows the gap between the guess and the real split', async () => {
    stubApi({
      results: {
        status: 200,
        body: {
          questionId: 'q-dishes',
          totalVotes: 100,
          options: [
            { optionId: 'right-away', count: 31, percent: 31 },
            { optionId: 'end-of-day', count: 69, percent: 69 },
          ],
        },
      },
    })
    render(<App />)
    await answer('Right after eating', 'Most people')
    expect(await screen.findByText('You guessed most people. It is 31%.')).toBeInTheDocument()
  })

  it('says when the guess was right', async () => {
    stubApi({
      results: {
        status: 200,
        body: {
          questionId: 'q-dishes',
          totalVotes: 100,
          options: [
            { optionId: 'right-away', count: 31, percent: 31 },
            { optionId: 'end-of-day', count: 69, percent: 69 },
          ],
        },
      },
    })
    render(<App />)
    await answer('Right after eating', 'Some people')
    expect(await screen.findByText('You guessed right: 31% chose this too.')).toBeInTheDocument()
  })

  it('does not judge a guess against too few votes', async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating', 'Most people')
    expect(await screen.findByText(/Too few votes yet to check your guess/)).toBeInTheDocument()
  })

  it('lets every question be skipped without sending a vote', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'How do you split the bill?' })
    fireEvent.click(within(card).getByRole('button', { name: 'Skip' }))
    expect(within(card).getByText('Skipped')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/votes')).toHaveLength(0)
  })

  it('ends the edition with a share that shows only with or against the crowd, and names tomorrow', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    await screen.findByText('66.7%')
    const bill = screen.getByRole('region', { name: 'How do you split the bill?' })
    fireEvent.click(within(bill).getByRole('button', { name: 'Skip' }))
    await answer('Several')

    const summary = await screen.findByRole('region', { name: 'Edition #3 done' })
    expect(summary).toHaveTextContent('Tomorrow: Money · Friendship')
    expect(summary).toHaveTextContent('You played 1 of the last 7 days')

    fireEvent.click(within(summary).getByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledTimes(1)
    const text = (share.mock.calls[0] as unknown as [{ text: string }])[0].text
    // Dishes: with the crowd. Bill: skipped. Alarm: against (the stub says right-away leads).
    expect(text).toContain('Persona Index #3')
    expect(text).toContain('🟩⬜🟧')
    for (const label of ['Right after eating', 'Several', 'dishes', 'alarm']) {
      expect(text).not.toContain(label)
    }
  })

  it('counts the days played this week from this phone only', async () => {
    localStorage.setItem('pi.days', JSON.stringify(['2026-10-06', '2026-10-09', '2026-10-11', '2026-09-01']))
    stubApi({})
    render(<App />)
    for (const q of ['When do you wash the dishes?', 'How do you split the bill?', 'How many alarms do you set?']) {
      const card = await screen.findByRole('region', { name: q })
      fireEvent.click(within(card).getByRole('button', { name: 'Skip' }))
    }
    expect(await screen.findByRole('region', { name: 'Edition #3 done' })).toHaveTextContent(
      'You played 3 of the last 7 days',
    )
  })
})
