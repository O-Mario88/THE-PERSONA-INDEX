import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import type { DailySet, Question } from './api'

const today: DailySet = {
  date: '2026-10-12',
  edition: 3,
  tomorrowThemes: ['money', 'friendship'],
  questions: [
    {
      id: 'q-dishes',
      theme: 'habits',
      prompt: 'When do you wash the dishes?',
      options: [
        {
          id: 'right-away',
          label: 'Right after eating',
          traits: { conscientiousness: 1 },
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
        {
          id: 'many',
          label: 'Several',
          traits: { neuroticism: 1 },
          insight: {
            reveal: 'Several alarms suggest you trust a back-up plan more than a single promise.',
            step: 'Tonight, set one alarm fewer and see how the morning goes.',
          },
        },
      ],
    },
  ],
}

const payday: Question = {
  id: 'q-payday',
  theme: 'money',
  care: 'everyday',
  prompt: 'Payday arrives. What goes first?',
  options: [
    { id: 'bills', label: 'Bills', depth: 1, traits: { conscientiousness: 1 } },
    { id: 'treat', label: 'Something for me', depth: 4, traits: { present_bias: 2 } },
  ],
}
const closeness: Question = {
  id: 'q-close',
  theme: 'intimacy',
  care: 'intimate',
  prompt: 'How do you most often show a partner affection?',
  options: [
    { id: 'touch', label: 'Small touches', depth: 1 },
    { id: 'wait', label: 'I wait for them first', depth: 4 },
  ],
}
today.pool = [...today.questions, payday, closeness]

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
}) {
  let devices = 0
  let votes = 0
  let results = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/device' && init?.method === 'POST') {
      devices++
      return json({ status: 201, body: { token: `v1.device${devices}.sig` } })
    }
    if (url === '/api/questions/today') {
      return json(routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/ratings' && init?.method === 'POST') {
      return json({ status: 202, body: { status: 'accepted', eventId: 'evt_r' } })
    }
    if (url === '/api/votes' && init?.method === 'POST') {
      const r = Array.isArray(routes.vote) ? routes.vote[Math.min(votes, routes.vote.length - 1)] : routes.vote
      votes++
      return json(r ?? { status: 202, body: { status: 'accepted', eventId: 'evt_1' } })
    }
    if (url.endsWith('/results')) {
      results++
    }
    return json({ status: 404, body: { error: 'not_found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(fetchMock, 'resultsCalls', { get: () => results })
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
})

// Taps an answer and waits for its card to finish.
async function answer(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  await waitFor(() => expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument())
}

afterEach(() => {
  vi.unstubAllGlobals()
  window.location.hash = ''
})

const encodeCompare = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('App', () => {
  it("shows today's three questions", async () => {
    stubApi({})
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(screen.getByText('How do you split the bill?')).toBeInTheDocument()
    expect(screen.getByText('How many alarms do you set?')).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
  })

  it('casts a vote with an idempotency key and a server-issued device token, then shows only the insight', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')

    const card = screen.getByRole('region', { name: 'When do you wash the dishes?' })
    expect(await within(card).findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(card).not.toHaveTextContent('%')
    expect(card).not.toHaveTextContent(/votes? so far/)
    expect(within(card).queryByRole('button', { name: 'At the end of the day' })).not.toBeInTheDocument()

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
    await answer('Split it evenly')

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
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()

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
    expect(insight).toHaveTextContent('Insight unlocked')
    expect(insight).toHaveTextContent('+10 pts')
    expect(insight).toHaveTextContent('Your answer: Right after eating')
    expect(within(insight).getByRole('list', { name: 'Traits this answer touches' })).toHaveTextContent('Getting things done')
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

  it('goes straight from the answer to the insight, with no guess and no crowd split', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(screen.queryByText(/How many people/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Community results' })).not.toBeInTheDocument()
    expect((fetchMock as unknown as { resultsCalls: number }).resultsCalls).toBe(0)
  })

  it('says so when this device already answered', async () => {
    stubApi({ vote: { status: 409, body: { error: 'duplicate_vote' } } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByText(/already answered this one/)).toBeInTheDocument()
    expect(screen.queryByRole('note', { name: 'What your answer may say' })).not.toBeInTheDocument()
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

  it('lets every question be skipped without sending a vote', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'How do you split the bill?' })
    fireEvent.click(within(card).getByRole('button', { name: 'Skip' }))
    expect(within(card).getByText('Skipped')).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([u]) => u === '/api/votes')).toHaveLength(0)
  })

  it('ends the edition with advice built from the insights and moves to try, without repeating the cards', async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    const bill = screen.getByRole('region', { name: 'How do you split the bill?' })
    fireEvent.click(within(bill).getByRole('button', { name: 'Skip' }))
    await answer('Several')

    const summary = await screen.findByRole('region', { name: 'Edition #3 complete' })
    expect(summary).toHaveTextContent('2 insights today')
    // The cards stay above; the recap does not repeat them.
    expect(summary).not.toHaveTextContent('unfinished tasks noisier than most')
    expect(summary).not.toHaveTextContent('Several alarms suggest')
    const advice = within(summary).getByRole('note', { name: 'Advice for you' })
    expect(advice).toHaveTextContent('Getting things done')
    expect(advice).toHaveTextContent('Worry and tension')
    expect(advice).toHaveTextContent('How to grow:')
    expect(summary).toHaveTextContent('Tomorrow: Money · Friendship')
    expect(summary).toHaveTextContent('played 1 of the last 7 days')
    expect(await within(summary).findByText('+20 pts bonus')).toBeInTheDocument()

    // Points: two insights and the edition bonus, then a ticked move.
    expect(summary).toHaveTextContent('Curious · 40 pts')
    const move = within(summary).getByRole('button', { name: /set one alarm fewer/ })
    fireEvent.click(move)
    expect(move).toHaveAttribute('aria-pressed', 'true')
    expect(summary).toHaveTextContent('Curious · 45 pts')
  })

  it('awards points for an insight once, however often the page is opened', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    await answer('Right after eating')
    unmount()
    render(<App />)
    expect(await screen.findByLabelText("Today's progress")).toHaveTextContent('10 pts')
  })

  it('counts the days played this week from this phone only', async () => {
    localStorage.setItem('pi.days', JSON.stringify(['2026-10-06', '2026-10-09', '2026-10-11', '2026-09-01']))
    stubApi({})
    render(<App />)
    for (const q of ['When do you wash the dishes?', 'How do you split the bill?', 'How many alarms do you set?']) {
      const card = await screen.findByRole('region', { name: q })
      fireEvent.click(within(card).getByRole('button', { name: 'Skip' }))
    }
    expect(await screen.findByRole('region', { name: 'Edition #3 complete' })).toHaveTextContent(
      'played 3 of the last 7 days',
    )
  })

  it('gives a returning phone its own three from the pool, by its interests', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({
        answers: [
          { date: '2026-10-11', questionId: 'x', theme: 'money', depth: 4, traits: {} },
          { date: '2026-10-10', questionId: 'y', theme: 'money', depth: 4, traits: {} },
        ],
        skips: [],
      }),
    )
    stubApi({})
    render(<App />)
    expect(await screen.findByText('Payday arrives. What goes first?')).toBeInTheDocument()
    expect(screen.getAllByRole('region', { name: /./ }).filter((r) => r.classList.contains('card'))).toHaveLength(3)
  })

  it('records each answer on this phone only, with its theme and depth', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [{ date: '2026-10-11', questionId: 'x', theme: 'money', depth: 4, traits: {} }], skips: [] }),
    )
    stubApi({})
    render(<App />)
    await answer('Something for me')
    const h = JSON.parse(localStorage.getItem('pi.history.v1')!)
    expect(h.answers).toContainEqual({
      date: '2026-10-12',
      questionId: 'q-payday',
      theme: 'money',
      depth: 4,
      traits: { present_bias: 2 },
    })
  })

  it('asks once whether the player is 18 or older before any intimacy question', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({
        answers: [
          { date: '2026-10-11', questionId: 'x', theme: 'intimacy', depth: 4, traits: {} },
          { date: '2026-10-11', questionId: 'y', theme: 'intimacy', depth: 4, traits: {} },
        ],
        skips: [],
      }),
    )
    stubApi({})
    const { unmount } = render(<App />)
    const gate = await screen.findByRole('region', { name: 'Are you 18 or older?' })
    expect(screen.queryByText(closeness.prompt)).not.toBeInTheDocument()
    fireEvent.click(within(gate).getByRole('button', { name: "Yes, I'm 18 or older" }))
    expect(await screen.findByText(closeness.prompt)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Are you 18 or older?' })).not.toBeInTheDocument()

    // The keep-it-mild switch is always there and takes intimacy out again.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep it mild (no intimacy questions)' }))
    expect(screen.queryByText(closeness.prompt)).not.toBeInTheDocument()
    unmount()
    render(<App />)
    await screen.findByText('Question 1 of 3')
    expect(screen.queryByRole('region', { name: 'Are you 18 or older?' })).not.toBeInTheDocument()
  })

  it('never shows intimacy questions to someone who says no', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [{ date: '2026-10-11', questionId: 'x', theme: 'intimacy', depth: 4, traits: {} }], skips: [] }),
    )
    stubApi({})
    render(<App />)
    const gate = await screen.findByRole('region', { name: 'Are you 18 or older?' })
    fireEvent.click(within(gate).getByRole('button', { name: 'No' }))
    expect(screen.queryByText(closeness.prompt)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('shows the week on this phone: an honest trait read and a way to delete it all', async () => {
    const a = (d: string, w: number) => ({ date: d, questionId: d + w, theme: 'habits', depth: 3, traits: { conscientiousness: w } })
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [a('2026-10-10', 1), a('2026-10-11', 1)], skips: [] }))
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'My week' }))
    const week = screen.getByRole('region', { name: 'Your week' })
    expect(week).toHaveTextContent('Early read, 2 answers')
    expect(week).toHaveTextContent('Getting things done')
    expect(week).toHaveTextContent('You tend to finish the task before you rest')
    expect(week).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(week).toHaveTextContent('lives only on this phone')

    fireEvent.click(within(week).getByRole('button', { name: 'Delete everything on this phone' }))
    fireEvent.click(within(week).getByRole('button', { name: 'Yes, delete it all' }))
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
    expect(week).toHaveTextContent('No answers this week yet')
  })

  it('offers support contacts, calmly, when low-mood answers repeat in a week', async () => {
    const a = (d: string) => ({ date: d, questionId: d, theme: 'sadness-stress', depth: 4, traits: {} })
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [a('2026-10-09'), a('2026-10-10'), a('2026-10-11')], skips: [] }),
    )
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'My week' }))
    const note = screen.getByRole('note', { name: 'Support' })
    expect(within(note).getByRole('link', { name: /Find a helpline/ })).toHaveAttribute('href', 'https://findahelpline.com')
  })

  it('asks whether the card taught something, and sends only that tap', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    const insight = await screen.findByRole('note', { name: 'What your answer may say' })
    fireEvent.click(within(insight).getByRole('button', { name: 'I learned something' }))
    expect(await within(insight).findByText('Thanks. This helps us keep the good cards.')).toBeInTheDocument()
    expect(within(insight).queryByRole('button', { name: 'Not really' })).not.toBeInTheDocument()
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/ratings')!
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({ questionId: 'q-dishes', optionId: 'right-away', learned: true })
  })

  it('makes a compare link with the answers given, leaving out skipped ones', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(within(screen.getByRole('region', { name: 'How do you split the bill?' })).getByRole('button', { name: 'Skip' }))
    await answer('Several')
    const summary = await screen.findByRole('region', { name: 'Edition #3 complete' })
    fireEvent.click(within(summary).getByRole('button', { name: 'Compare with someone' }))

    const { text } = (share.mock.calls[0] as unknown as [{ text: string }])[0]
    const payload = text.split('#c=')[1].trim()
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    expect(decoded).toEqual({ e: 3, a: [['q-dishes', 'right-away'], ['q-alarm', 'many']] })
    expect(text).not.toContain('Right after eating')
  })

  it('opens a compare link on the same questions and shows agreement only after answering', async () => {
    window.location.hash = '#c=' + encodeCompare({ e: 3, a: [['q-dishes', 'end-of-day'], ['q-payday', 'bills']] })
    stubApi({})
    render(<App />)
    expect(await screen.findByText('Someone wants to compare answers with you.')).toBeInTheDocument()
    expect(screen.getByText('Payday arrives. What goes first?')).toBeInTheDocument()
    expect(screen.getAllByText(/Question \d of 2/)).toHaveLength(2)
    expect(screen.queryByText(/agreed/)).not.toBeInTheDocument()

    await answer('Right after eating')
    expect(screen.queryByText(/agreed/)).not.toBeInTheDocument()
    await answer('Bills')
    const result = await screen.findByRole('region', { name: 'You agreed on 1 of 2' })
    expect(result).toHaveTextContent('When do you wash the dishes?')
    expect(result).toHaveTextContent('You: Right after eating · Them: At the end of the day')
  })

  it('says so when a compare link is from an earlier edition', async () => {
    window.location.hash = '#c=' + encodeCompare({ e: 2, a: [['q-old', 'x']] })
    stubApi({})
    render(<App />)
    expect(await screen.findByText(/from an earlier edition/)).toBeInTheDocument()
    expect(await screen.findByText('Question 1 of 3')).toBeInTheDocument()
  })
})
