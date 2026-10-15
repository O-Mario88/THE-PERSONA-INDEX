import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import type { DailySet, Mirror, Question, QuestionResults } from './api'
import { loadGame } from './game'

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
            reveal: 'You like a clear sink before you relax. Unfinished tasks are noisier for you than for most.',
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
      followUp: {
        prompt: 'Did any dishes pile up today?',
        options: [
          {
            id: 'washed',
            label: 'I washed them straight away',
            traits: { conscientiousness: 1 },
            reflection: 'You kept on top of it again today, which suggests tidy surroundings help your head feel clear.',
          },
          {
            id: 'piled',
            label: 'They piled up a bit',
            traits: { conscientiousness: -1 },
            reflection: 'A pile on a full day is normal. You may have spent your energy on things that mattered more today.',
          },
          { id: 'no-dishes', label: "I didn't cook today", reflection: 'No dishes, no decision. Tomorrow you might notice when you choose to clear up.' },
        ],
      },
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
      followUp: {
        prompt: 'How did getting up go this morning?',
        options: [
          { id: 'first-alarm', label: 'Up at the first alarm', reflection: 'Up at the first alarm suggests you went to bed with a plan you trusted.' },
          {
            id: 'snoozed',
            label: 'I snoozed a few times',
            traits: { neuroticism: 1 },
            reflection: 'Snoozing may mean your night was short or your day felt heavy before it began.',
          },
          { id: 'no-alarm', label: 'No alarm today', reflection: 'A morning without an alarm tends to show what your body wants when you let it lead.' },
        ],
      },
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
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const pick = (r: Route | Route[] | undefined, n: number) => (Array.isArray(r) ? r[Math.min(n, r.length - 1)] : r)

// Stubs fetch with a tiny router; returns the mock so tests can inspect calls.
function stubApi(routes: {
  today?: Route
  edition?: Route
  vote?: Route | Route[]
  results?: Record<string, QuestionResults>
  mirror?: Route | Route[]
  forget?: Route
  steps?: Route
}) {
  let devices = 0
  let votes = 0
  let mirrors = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/device' && init?.method === 'POST') {
      devices++
      return json({ status: 201, body: { token: `v1.device${devices}.sig` } })
    }
    if (url.startsWith('/api/editions/')) {
      return json(routes.edition ?? routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/questions/today') {
      return json(routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/ratings' && init?.method === 'POST') {
      return json({ status: 202, body: { status: 'accepted', eventId: 'evt_r' } })
    }
    if (url === '/api/votes' && init?.method === 'POST') {
      const r = pick(routes.vote, votes++)
      return json(r ?? { status: 202, body: { status: 'accepted', eventId: 'evt_1' } })
    }
    if (url === '/api/steps' && init?.method === 'POST') {
      return json(routes.steps ?? { status: 200, body: { status: 'saved' } })
    }
    const results = /^\/api\/questions\/([^/]+)\/results$/.exec(url)
    if (results) {
      const r = routes.results?.[decodeURIComponent(results[1])]
      return json(r ? { status: 200, body: r } : { status: 404, body: { error: 'unknown_question' } })
    }
    if (url.startsWith('/api/mirror?date=')) {
      return json(pick(routes.mirror, mirrors++) ?? { status: 200, body: emptyMirror })
    }
    if (url === '/api/mirror' && init?.method === 'DELETE') {
      return json(routes.forget ?? { status: 204, body: null })
    }
    return json({ status: 404, body: { error: 'not_found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calls = (f: ReturnType<typeof stubApi>, url: string) => f.mock.calls.filter(([u]) => String(u) === url)
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

// The phone's clock: 9 am on the fixture's date, local time. Only Date is
// faked, so timers and waits run normally.
const at = (hour: number, day = 12) => new Date(2026, 9, day, hour, 0)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(9))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

// Taps an answer and waits for its answer screen.
async function answer(label: string) {
  fireEvent.click(await screen.findByRole('button', { name: label }))
  await screen.findByRole('button', { name: 'Next' })
}

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }))
const skip = async () => fireEvent.click(await screen.findByRole('button', { name: 'Skip this one' }))

// This morning, before 9 am: dishes answered, the bill skipped, alarms answered.
function answeredThisMorning() {
  const morning = String(at(8).getTime())
  localStorage.setItem('pi.choice.q-dishes', 'right-away')
  localStorage.setItem('pi.at.q-dishes', morning)
  localStorage.setItem('pi.choice.q-bill', '-')
  localStorage.setItem('pi.choice.q-alarm', 'many')
  localStorage.setItem('pi.at.q-alarm', morning)
}

const noClinicianWords = /therap|psycholog|psychiatr|counsel/i

const encodeCompare = (v: unknown) =>
  btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const crowd = (total: number, mine: number): QuestionResults => ({
  questionId: 'q-dishes',
  totalVotes: total,
  options: [
    { optionId: 'right-away', count: Math.round((total * mine) / 100), percent: mine },
    { optionId: 'end-of-day', count: total - Math.round((total * mine) / 100), percent: 100 - mine },
  ],
})

describe('the daily questions', () => {
  it('shows one question at a time, with the edition and the day', async () => {
    stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    expect(card).toHaveTextContent('Daily habits')
    expect(screen.queryByText('How do you split the bill?')).not.toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 1 of 3' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Question 3 of 3' })).toBeDisabled()
  })

  it('casts a vote with an idempotency key and a server-issued device token, then shows what it says', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')

    const card = screen.getByRole('region', { name: 'When do you wash the dishes?' })
    expect(within(card).getByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(card).toHaveTextContent('You chose')
    expect(within(card).queryByRole('button', { name: 'At the end of the day' })).not.toBeInTheDocument()

    const init = calls(fetchMock, '/api/votes')[0][1]!
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/\S+/)
    expect(JSON.parse(String(init.body))).toMatchObject({
      questionId: 'q-dishes',
      optionId: 'right-away',
      voterId: 'v1.device1.sig',
    })
    expect(localStorage.getItem('pi.device.v1')).toBe('v1.device1.sig')
  })

  it('asks the server for a device token once and reuses it', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    next()
    await answer('Split it evenly')

    expect(calls(fetchMock, '/api/device')).toHaveLength(1)
    expect(calls(fetchMock, '/api/votes').map((c) => bodyOf(c).voterId)).toEqual(['v1.device1.sig', 'v1.device1.sig'])
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

    const votes = calls(fetchMock, '/api/votes')
    expect(votes.map((c) => bodyOf(c).voterId)).toEqual(['v1.stale.sig', 'v1.device1.sig'])
    const keys = votes.map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
  })

  it('shows the insight with its first sentence as the headline, its research and one step', async () => {
    stubApi({})
    render(<App />)
    expect(screen.queryByText(/clear sink/)).not.toBeInTheDocument()
    await answer('Right after eating')

    const insight = screen.getByRole('note', { name: 'What your answer may say' })
    expect(within(insight).getByText('You like a clear sink before you relax.')).toHaveClass('insight-headline')
    expect(within(insight).getByText('Unfinished tasks are noisier for you than for most.')).toHaveClass('insight-body')
    expect(insight).toHaveTextContent('Strong evidence')
    expect(within(insight).getByRole('link', { name: 'Gollwitzer & Sheeran, 2006' })).toHaveAttribute(
      'href',
      'https://example.org/study',
    )
    expect(insight).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(screen.getByRole('group', { name: 'Try this' })).toHaveTextContent('Try this: Next time a small task appears')
    expect(screen.getByText('+10')).toBeInTheDocument()
    expect(screen.queryByText(/Batching chores/)).not.toBeInTheDocument()
  })

  it('shows a card without research when the insight cites none', async () => {
    stubApi({})
    render(<App />)
    await answer('At the end of the day')
    const insight = screen.getByRole('note', { name: 'What your answer may say' })
    expect(insight).toHaveTextContent('Batching chores suggests')
    expect(within(insight).queryByRole('link')).not.toBeInTheDocument()
    expect(insight).not.toHaveTextContent('evidence')
  })

  it('shows the real crowd split once a question has 100 votes', async () => {
    stubApi({ results: { 'q-dishes': crowd(130, 62.3) } })
    render(<App />)
    await answer('Right after eating')
    const split = await screen.findByRole('group', { name: 'How players answered' })
    expect(split).toHaveTextContent('You and 62% of players')
    expect(split).toHaveTextContent('130 votes')
    expect(split).toHaveTextContent('At the end of the day38%')
  })

  it('shows no crowd split below 100 votes, and never a made-up one', async () => {
    const fetchMock = stubApi({ results: { 'q-dishes': crowd(40, 70) } })
    render(<App />)
    await answer('Right after eating')
    await waitFor(() => expect(calls(fetchMock, '/api/questions/q-dishes/results')).toHaveLength(1))
    expect(screen.queryByRole('group', { name: 'How players answered' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'When do you wash the dishes?' })).not.toHaveTextContent('%')
  })

  it('says so when this device already answered', async () => {
    stubApi({ vote: { status: 409, body: { error: 'duplicate_vote' } } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByText(/already answered this one/)).toBeInTheDocument()
    expect(screen.queryByRole('note', { name: 'What your answer may say' })).not.toBeInTheDocument()
    next()
    expect(await screen.findByText('How do you split the bill?')).toBeInTheDocument()
  })

  it('keeps the same idempotency key when a failed vote is retried', async () => {
    const fetchMock = stubApi({ vote: { status: 503, body: { error: 'unavailable' } } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('did not go through')
    fireEvent.click(screen.getByRole('button', { name: 'Right after eating' }))
    await waitFor(() => expect(calls(fetchMock, '/api/votes')).toHaveLength(2))

    const keys = calls(fetchMock, '/api/votes').map(([, init]) => (init!.headers as Record<string, string>)['Idempotency-Key'])
    expect(keys[0]).toBe(keys[1])
  })

  it("loads the edition for the phone's own date", async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await screen.findByText('When do you wash the dishes?')
    const urls = fetchMock.mock.calls.map(([u]) => String(u))
    expect(urls).toContain('/api/editions/2026-10-12')
    expect(urls).not.toContain('/api/questions/today')
  })

  it("falls back to the shared edition when the phone's date is not open", async () => {
    const fetchMock = stubApi({ edition: { status: 404, body: { error: 'no_edition' } } })
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('/api/questions/today')
  })

  it('says so when no questions are published today', async () => {
    stubApi({
      edition: { status: 404, body: { error: 'no_edition' } },
      today: { status: 404, body: { error: 'no_questions_today' } },
    })
    render(<App />)
    expect(await screen.findByText(/No questions today yet/)).toBeInTheDocument()
  })

  it('offers a retry when the questions fail to load', async () => {
    const fetchMock = stubApi({ edition: { status: 500, body: {} } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(calls(fetchMock, '/api/editions/2026-10-12')).toHaveLength(2))
  })

  it('lets a question be skipped without sending a vote, and moves on', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await skip()
    expect(await screen.findByText('How do you split the bill?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 1 of 3' })).toHaveClass('skipped')
    expect(calls(fetchMock, '/api/votes')).toHaveLength(0)
  })

  it("keeps a card's step as one of today's moves, on the phone and in the mirror", async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: "I'll try it" }))
    expect(screen.getByRole('group', { name: 'Try this' })).toHaveTextContent("Added to today's moves.")
    await waitFor(() => expect(calls(fetchMock, '/api/steps')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toEqual({
      questionId: 'q-dishes',
      optionId: 'right-away',
      status: 'started',
      date: '2026-10-12',
      voterId: 'v1.device1.sig',
    })
    expect(JSON.parse(localStorage.getItem('pi.moves.v1')!)).toEqual([
      {
        date: '2026-10-12',
        questionId: 'q-dishes',
        optionId: 'right-away',
        step: 'Next time a small task appears, notice the itch to finish it.',
        status: 'started',
      },
    ])
  })

  it('lets a step wait with "Not now", sending nothing', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('button', { name: "I'll try it" })).not.toBeInTheDocument()
    expect(calls(fetchMock, '/api/steps')).toHaveLength(0)
    expect(localStorage.getItem('pi.moves.v1')).toBeNull()
  })

  it('asks whether the card landed, and sends only that tap', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'I learned something' }))
    expect(await screen.findByText(/Thanks for telling me/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not me' })).not.toBeInTheDocument()
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/ratings')[0])).toMatchObject({
      questionId: 'q-dishes',
      optionId: 'right-away',
      learned: true,
    })
  })

  it('ends the morning with "Done for today.", the day\'s thread and the moves, without repeating the cards', async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await answer('Several')
    fireEvent.click(screen.getByRole('button', { name: "I'll try it" }))
    next()

    const done = await screen.findByRole('region', { name: 'Done for today.' })
    expect(done).toHaveTextContent('Edition #3 · 2 insights today')
    expect(await within(done).findByText('+20 bonus')).toBeInTheDocument()
    const tiles = within(done).getByRole('list', { name: "Today's answers" })
    expect(within(tiles).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '☀️Daily habitsanswered',
      '✨Todayskipped',
      '✨Todayanswered',
    ])
    const thread = within(done).getByRole('note', { name: "Today's thread" })
    expect(thread).toHaveTextContent("Here's what I noticed today")
    expect(thread).toHaveTextContent('Getting things done')
    expect(thread).toHaveTextContent('Worry and tension')
    expect(thread).toHaveTextContent('For the rest of today:')
    const moves = within(done).getByRole('group', { name: "Moves you'll try" })
    expect(moves).toHaveTextContent('check-in tonight')
    expect(moves).toHaveTextContent('Tonight, set one alarm fewer')
    expect(done).toHaveTextContent('Tomorrow Money · Friendship')
    expect(done).toHaveTextContent('Your evening check-in opens at 5 pm')
    expect(done).toHaveTextContent('Curious · 40 pts · played 1 of the last 7 days')
    // The cards were just shown; the recap does not repeat them.
    expect(done).not.toHaveTextContent('clear sink')
    expect(done).not.toHaveTextContent('Several alarms suggest')
    expect(document.body.textContent).not.toMatch(noClinicianWords)

    // The dashes go back to any finished card.
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
  })

  it('shows your share of the crowd on the finished day once a question has 100 votes', async () => {
    stubApi({ results: { 'q-dishes': crowd(250, 71) } })
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await skip()
    const done = await screen.findByRole('region', { name: 'Done for today.' })
    expect(await within(done).findByText('with 71%')).toBeInTheDocument()
  })

  it('shares only squares: never a question or an answer', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    stubApi({ results: { 'q-dishes': crowd(250, 71) } })
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await answer('Several')
    next()
    const done = await screen.findByRole('region', { name: 'Done for today.' })
    await within(done).findByText('with 71%')
    fireEvent.click(within(done).getByRole('button', { name: 'Share #3' }))

    const { text } = (share.mock.calls[0] as unknown as [{ text: string }])[0]
    expect(text).toContain('The Persona Index #3\n🟪⬜⬛')
    expect(text).not.toMatch(/dishes|Right after eating|alarm|Several/i)
  })

  it('makes a compare link with the answers given, leaving out skipped ones', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await answer('Several')
    next()
    const done = await screen.findByRole('region', { name: 'Done for today.' })
    fireEvent.click(within(done).getByRole('button', { name: 'Compare with someone' }))

    const { text } = (share.mock.calls[0] as unknown as [{ text: string }])[0]
    const payload = text.split('#c=')[1].trim()
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    expect(decoded).toEqual({ e: 3, a: [['q-dishes', 'right-away'], ['q-alarm', 'many']] })
    expect(text).not.toContain('Right after eating')
  })

  it('awards points for an insight once, however often the card is opened', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    await answer('Right after eating')
    unmount()
    render(<App />)
    // A returning phone opens on the first open question.
    expect(await screen.findByText('How do you split the bill?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(screen.queryByText('+10')).not.toBeInTheDocument()
    expect(loadGame().points).toBe(10)
  })

  it('counts the days played this week from this phone only', async () => {
    localStorage.setItem('pi.days', JSON.stringify(['2026-10-06', '2026-10-09', '2026-10-11', '2026-09-01']))
    stubApi({})
    render(<App />)
    await skip()
    await skip()
    await skip()
    expect(await screen.findByRole('region', { name: 'Done for today.' })).toHaveTextContent(
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
    expect(within(screen.getByRole('navigation', { name: "Today's questions" })).getAllByRole('button')).toHaveLength(3)
  })

  it('records each answer on this phone, with its theme and depth', async () => {
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
    await screen.findByRole('button', { name: 'Question 1 of 3' })
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

  it('opens a compare link on the same questions and shows agreement only after answering', async () => {
    window.location.hash = '#c=' + encodeCompare({ e: 3, a: [['q-dishes', 'end-of-day'], ['q-payday', 'bills']] })
    stubApi({})
    render(<App />)
    expect(await screen.findByText('Someone wants to compare answers with you.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 1 of 2' })).toBeInTheDocument()
    expect(screen.queryByText(/agreed/)).not.toBeInTheDocument()

    await answer('Right after eating')
    next()
    expect(screen.queryByText(/agreed/)).not.toBeInTheDocument()
    await answer('Bills')
    next()
    const result = await screen.findByRole('region', { name: 'You agreed on 1 of 2' })
    expect(result).toHaveTextContent('When do you wash the dishes?')
    expect(result).toHaveTextContent('You: Right after eating · Them: At the end of the day')
  })

  it('says so when a compare link is from an earlier edition', async () => {
    window.location.hash = '#c=' + encodeCompare({ e: 2, a: [['q-old', 'x']] })
    stubApi({})
    render(<App />)
    expect(await screen.findByText(/from an earlier edition/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Question 1 of 3' })).toBeInTheDocument()
  })
})

describe('the evening', () => {
  it('follows up on each morning answer, one at a time, and keeps the answers on this phone', async () => {
    answeredThisMorning()
    vi.setSystemTime(at(19))
    const fetchMock = stubApi({})
    render(<App />)

    const card = await screen.findByRole('region', { name: 'Did any dishes pile up today?' })
    expect(card).toHaveTextContent('This morning you said Right after eating')
    expect(screen.getByText('Evening check-in · Monday')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 2 of 2' })).toBeDisabled()
    expect(screen.queryByText('How did getting up go this morning?')).not.toBeInTheDocument()
    expect(screen.queryByText('How do you split the bill?')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'They piled up a bit' }))
    const reflection = await within(card).findByRole('note', { name: "Tonight's reflection" })
    expect(reflection).toHaveTextContent('A pile on a full day is normal.')
    expect(card).toHaveTextContent('+10')
    expect(reflection).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(within(card).queryByRole('button', { name: 'I washed them straight away' })).not.toBeInTheDocument()

    next()
    const second = await screen.findByRole('region', { name: 'How did getting up go this morning?' })
    expect(second).toHaveTextContent('This morning you said Several')

    expect(calls(fetchMock, '/api/votes')).toHaveLength(0)
    const h = JSON.parse(localStorage.getItem('pi.history.v1')!)
    expect(h.answers).toContainEqual(
      expect.objectContaining({ questionId: 'q-dishes#evening', evening: true, traits: { conscientiousness: -1 } }),
    )

    // Today's questions are one tap away.
    fireEvent.click(screen.getByRole('button', { name: /Today's questions/ }))
    expect(await screen.findByRole('region', { name: 'Done for today.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the evening check-in' }))
    expect(await screen.findByRole('region', { name: 'How did getting up go this morning?' })).toBeInTheDocument()
  })

  it('ends the day asking how each move went, with a thought for tomorrow', async () => {
    answeredThisMorning()
    localStorage.setItem(
      'pi.moves.v1',
      JSON.stringify([
        {
          date: '2026-10-12',
          questionId: 'q-alarm',
          optionId: 'many',
          step: 'Tonight, set one alarm fewer and see how the morning goes.',
          status: 'started',
        },
      ]),
    )
    vi.setSystemTime(at(19))
    const fetchMock = stubApi({})
    render(<App />)
    await answer('I washed them straight away')
    next()
    await answer('I snoozed a few times')
    next()

    const day = await screen.findByRole('region', { name: 'Day complete' })
    expect(day).toHaveTextContent('2 reflections tonight')
    expect(await within(day).findByText('+20 bonus')).toBeInTheDocument()
    const moves = within(day).getByRole('group', { name: 'Your moves' })
    expect(moves).toHaveTextContent('set one alarm fewer')
    expect(moves).toHaveTextContent('How did it go?')
    fireEvent.click(within(moves).getByRole('button', { name: /It helped/ }))
    expect(moves).toHaveTextContent('Glad it helped.')
    expect(within(moves).queryByRole('button')).not.toBeInTheDocument()
    await waitFor(() => expect(calls(fetchMock, '/api/steps')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toMatchObject({
      questionId: 'q-alarm',
      optionId: 'many',
      status: 'helped',
      date: '2026-10-12',
    })

    expect(within(day).getByRole('note', { name: 'For tomorrow' })).toBeInTheDocument()
    expect(day).toHaveTextContent('Tomorrow Money · Friendship')
    expect(day).toHaveTextContent('See you tomorrow morning.')
    // Two reflections, the day's bonus and the move tried.
    expect(day).toHaveTextContent('Curious · 45 pts')
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('gives no follow-up the same evening to a question first answered in the evening', async () => {
    vi.setSystemTime(at(19))
    stubApi({})
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(screen.getByText(/The evening check-in follows up on morning answers from before 5 pm/)).toBeInTheDocument()
    await answer('Right after eating')
    expect(screen.queryByText('Did any dishes pile up today?')).not.toBeInTheDocument()
  })
})

// A week of real-looking mirror data, as GET /api/mirror returns it.
const mirror: Mirror = {
  date: '2026-10-18',
  week: 42,
  from: '2026-10-12',
  to: '2026-10-18',
  editions: [1, 6],
  weeksPlayed: 3,
  stats: {
    daysActive: 5,
    daysActiveLastWeek: 4,
    daysSoFar: 6,
    answers: 18,
    private: 1,
    deepest: 5,
    minority: 7,
    judged: 18,
    learned: 12,
    rated: 15,
    stepsStarted: 3,
    stepsTried: 2,
    stepsHelped: 1,
  },
  days: [
    {
      date: '2026-10-12',
      edition: 1,
      answers: [
        { theme: 'habits', crowd: 'with' },
        { theme: 'friendship', crowd: 'against' },
        { theme: 'intimacy', crowd: 'private' },
      ],
    },
    { date: '2026-10-13', edition: 2, answers: [{ theme: 'money', crowd: 'early' }] },
    { date: '2026-10-14', edition: 3, answers: [] },
    { date: '2026-10-15', edition: 4, answers: [{ theme: 'anger', crowd: 'against' }] },
    { date: '2026-10-16', edition: 5, answers: [{ theme: 'habits', crowd: 'with' }] },
    {
      date: '2026-10-17',
      edition: 6,
      answers: [
        { theme: 'friendship', crowd: 'with' },
        { theme: 'money', crowd: 'with' },
      ],
    },
    { date: '2026-10-18', edition: 0, answers: [] },
  ],
  areas: [
    { area: 'everyday', minority: 2, judged: 6, lastMinority: 1, lastJudged: 5 },
    { area: 'people', minority: 3, judged: 5, lastMinority: 0, lastJudged: 0 },
    { area: 'inner', minority: 2, judged: 5, lastMinority: 1, lastJudged: 2 },
    { area: 'desire', minority: 0, judged: 2, lastMinority: 0, lastJudged: 0 },
  ],
  rarest: {
    questionId: 'q-queue',
    prompt: 'Someone cuts in front of you in a queue. What do you do?',
    theme: 'anger',
    edition: 4,
    total: 240,
    final: true,
    options: [
      { label: 'Say something calmly', count: 150, percent: 62.5 },
      { label: 'Let it go', count: 60, percent: 25 },
      { label: 'Boil quietly for an hour', count: 30, percent: 12.5, yours: true },
    ],
  },
  minority: [],
  divisive: {
    questionId: 'q-call',
    prompt: 'A friend calls instead of texting. What do you do?',
    theme: 'friendship',
    edition: 6,
    total: 410,
    final: false,
    options: [
      { label: 'Pick up happily', count: 209, percent: 51 },
      { label: 'Let it ring and text back', count: 201, percent: 49, yours: true },
    ],
  },
  traits: [
    {
      trait: 'conscientiousness',
      answers: 14,
      solid: true,
      score: 74,
      ranked: true,
      change: 4,
      history: [
        { week: 40, score: 65, ranked: true, solid: true },
        { week: 41, score: 70, ranked: true, solid: true },
        { week: 42, score: 74, ranked: true, solid: true },
      ],
      evidence: ['Right after eating', 'Before bed'],
      theme: 'habits',
      edition: 1,
    },
    {
      trait: 'attachment_anxiety',
      answers: 9,
      solid: false,
      score: 68,
      ranked: true,
      change: 7,
      history: [
        { week: 40, ranked: false, solid: false },
        { week: 41, score: 61, ranked: true, solid: false },
        { week: 42, score: 68, ranked: true, solid: false },
      ],
      evidence: ['Check my phone again'],
      theme: 'friendship',
      edition: 2,
    },
    {
      trait: 'extraversion',
      answers: 4,
      solid: false,
      score: 52,
      ranked: false,
      history: [
        { week: 40, ranked: false, solid: false },
        { week: 41, ranked: false, solid: false },
        { week: 42, score: 52, ranked: false, solid: false },
      ],
      evidence: [],
    },
  ],
  ranked: true,
  themes: [
    { theme: 'habits', area: 'everyday', answers: 5, depth: 'deep' },
    { theme: 'friendship', area: 'people', answers: 4, depth: 'deeper' },
    { theme: 'money', area: 'everyday', answers: 3, depth: 'light' },
    { theme: 'intimacy', area: 'desire', answers: 1, depth: 'private' },
  ],
  steps: [
    {
      questionId: 'q-tidy',
      optionId: 'now',
      theme: 'habits',
      step: 'Tonight, leave one small thing undone on purpose.',
      started: '2026-10-14',
      status: 'started',
      edition: 3,
    },
    {
      questionId: 'q-call',
      optionId: 'text',
      theme: 'friendship',
      step: 'This week, call one friend instead of texting.',
      started: '2026-10-13',
      status: 'helped',
      edition: 2,
    },
  ],
  stepRecord: { started: 4, tried: 2, helped: 1 },
  strengths: [
    { kind: 'days', you: 5, median: 4, players: 212 },
    { kind: 'learned', you: 12, median: 7.5, players: 212 },
  ],
  nextSteps: [
    {
      questionId: 'q-money',
      optionId: 'save',
      theme: 'money',
      step: 'This week, move a small amount to savings the day you get paid.',
      edition: 6,
    },
  ],
  comingUp: ['money', 'dating'],
  lowMood: false,
}

const emptyMirror: Mirror = {
  ...mirror,
  weeksPlayed: 0,
  stats: {
    daysActive: 0,
    daysActiveLastWeek: 0,
    daysSoFar: 6,
    answers: 0,
    private: 0,
    deepest: 0,
    minority: 0,
    judged: 0,
    learned: 0,
    rated: 0,
    stepsStarted: 0,
    stepsTried: 0,
    stepsHelped: 0,
  },
  days: mirror.days.map((d) => ({ ...d, answers: [] })),
  areas: mirror.areas.map((a) => ({ ...a, minority: 0, judged: 0, lastMinority: 0, lastJudged: 0 })),
  rarest: undefined,
  divisive: undefined,
  traits: [],
  ranked: false,
  themes: [],
  steps: [],
  stepRecord: { started: 0, tried: 0, helped: 0 },
  strengths: [],
  nextSteps: [],
}

// Sunday, as the server sends it: no questions, the day for the mirror.
const sunday: DailySet = { date: '2026-10-18', questions: [], review: true, tomorrowThemes: ['money', 'anger'] }

async function openMirror(routes: Parameters<typeof stubApi>[0] = {}) {
  vi.setSystemTime(at(9, 18))
  const fetchMock = stubApi({ edition: { status: 200, body: sunday }, mirror: { status: 200, body: mirror }, ...routes })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Your mirror' }))
  return fetchMock
}

const mirrorCalls = (f: ReturnType<typeof stubApi>) => f.mock.calls.filter(([u]) => String(u).startsWith('/api/mirror?'))

describe('the weekly mirror', () => {
  it("is built from the server's data for this phone, sent with its device token", async () => {
    const fetchMock = await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    expect(await within(page).findByText('The Steady Noticer.')).toBeInTheDocument()

    const [url, init] = mirrorCalls(fetchMock)[0]
    expect(url).toBe('/api/mirror?date=2026-10-18')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Device v1.device1.sig')

    expect(page).toHaveTextContent('Your weekly mirror · Week 42 · Editions #1–#6')
    expect(page).toHaveTextContent('This week you were The Steady Noticer.')
    expect(page).toHaveTextContent('Steady follow-through, with a radar tuned for silence.')
    expect(page).toHaveTextContent('You showed up on 5 days this week and gave 18 answers.')

    const tiles = within(page).getByRole('list', { name: 'This week in numbers' })
    expect(tiles).toHaveTextContent('Days active5 of 6Up from 4 last week')
    expect(tiles).toHaveTextContent('Answers18this week, 1 kept private')
    expect(tiles).toHaveTextContent('Against the crowd39%')
    expect(tiles).toHaveTextContent('Learned something12 of 15')
    expect(tiles).toHaveTextContent('Small steps kept2 of 3')

    const line = within(page).getByRole('figure', { name: 'One line from this week' })
    expect(line).toHaveTextContent('“Boil quietly for an hour”')
    expect(line).toHaveTextContent('Only 13% of players said the same.')
  })

  it('shows every section that has real data, numbered in order', async () => {
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    await within(page).findByText('The Steady Noticer.')
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Your week at a glance',
      '02 Where you stand apart',
      '03 Your trait read',
      "04 How you've moved",
      '05 All of you',
      '06 Who you were this week',
      '07 Strengths you showed',
      '08 Your small steps',
      '09 Next week',
      '10 The road ahead',
    ])

    expect(within(page).getByRole('listitem', { name: /^Monday:/ })).toHaveAccessibleName(
      'Monday: Daily habits, with the crowd; Friendship, against the crowd; Intimacy, a private answer',
    )
    expect(within(page).getByRole('listitem', { name: /^Wednesday:/ })).toHaveAccessibleName('Wednesday: missed')
    expect(within(page).getByRole('listitem', { name: /^Sunday:/ })).toHaveAccessibleName('Sunday: review day')

    const apart = within(page).getByRole('list', { name: 'Against the crowd, by area' })
    expect(apart).toHaveTextContent('People60% of 5')
    expect(apart).toHaveTextContent('Everyday life33% · 20% last week')
    expect(apart).toHaveTextContent('All answers39%')
    expect(within(page).getByRole('group', { name: 'Most divisive this week, worldwide' })).toHaveTextContent(
      'Let it ring and text back · you49%',
    )

    const traits = within(page).getByRole('list', { name: 'Trait read' })
    expect(traits).toHaveTextContent('Organised74 +4 vs last week')
    expect(traits).toHaveTextContent('Solid read · 14 answers · Conscientiousness · ranked against players')
    expect(traits).toHaveTextContent('Early read · 9 answers')
    expect(page).toHaveTextContent('0 to 100, with 50 the typical player')

    const who = within(page).getByRole('heading', { name: '06 Who you were this week' }).parentElement!
    expect(who).toHaveTextContent('You finish what you start.')
    expect(who).toHaveTextContent('You said: “Right after eating”, “Before bed”')
    expect(who).toHaveTextContent('Strong evidence · Roberts et al., 2007')
    expect(who).toHaveTextContent('Prediction: a solid read')
    expect(who).toHaveTextContent('Early read: from 9 answers')
    expect(who).not.toHaveTextContent('Energy from people') // 52 sits in the middle

    expect(page).toHaveTextContent('You came back on 5 days. The typical player came back on 4.')
    expect(page).toHaveTextContent('You learned something from 12 cards. The typical player did from 7.5.')
    expect(page).toHaveTextContent('Compared with 212 players this week.')
    expect(page).toHaveTextContent('4 steps started, 2 tried, 1 helped.')
    expect(page).toHaveTextContent(
      'Closeness radar needs 3 more answers; Outgoing needs 8 more answers to become solid reads.',
    )
    expect(page).toHaveTextContent('Coming up')
    expect(page).toHaveTextContent('Money · Dating')

    expect(page).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(within(page).getByRole('note', { name: 'What leaves my phone' })).toHaveTextContent('no name, no email')
    const sources = within(page).getByRole('list', { name: 'Sources' })
    expect(within(sources).getByRole('link', { name: 'Soto, 2019' })).toHaveAttribute('href', expect.stringMatching(/^https:/))
    for (const link of within(sources).getAllByRole('link')) expect(link).toHaveAttribute('href', expect.stringMatching(/^https:/))
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('hides what has no real data yet, for a new player', async () => {
    await openMirror({ mirror: { status: 200, body: emptyMirror } })
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    expect(await within(page).findByText('This week is just getting started.')).toBeInTheDocument()
    expect(page).toHaveTextContent('Your mirror fills in as you answer.')
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Your week at a glance',
      '02 Your trait read',
      '03 Next week',
      '04 The road ahead',
    ])
    expect(within(page).queryByRole('figure', { name: 'One line from this week' })).not.toBeInTheDocument()
    expect(within(page).getByRole('list', { name: 'This week in numbers' })).toHaveTextContent(
      'Against the crowd–Shown once questions pass 100 votes',
    )
    expect(page).not.toHaveTextContent('%')
  })

  it('records how a small step went, then shows the updated mirror', async () => {
    const fetchMock = await openMirror()
    const steps = await screen.findByRole('group', { name: 'How did it go?' })
    fireEvent.click(within(steps).getByRole('button', { name: 'It helped' }))
    await waitFor(() => expect(mirrorCalls(fetchMock)).toHaveLength(2))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toEqual({
      questionId: 'q-tidy',
      optionId: 'now',
      status: 'helped',
      date: '2026-10-18',
      voterId: 'v1.device1.sig',
    })
  })

  it('lists the first few steps, with the rest one tap away', async () => {
    const steps = Array.from({ length: 6 }, (_, i) => ({
      ...mirror.steps[0],
      questionId: `q-step-${i}`,
      step: `Step number ${i + 1}, small and specific.`,
    }))
    await openMirror({ mirror: { status: 200, body: { ...mirror, steps } } })
    const list = await screen.findByRole('list', { name: 'Steps you started' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 6 steps' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it("starts one of next week's steps", async () => {
    const fetchMock = await openMirror()
    fireEvent.click(await screen.findByRole('button', { name: 'Start this step' }))
    await waitFor(() => expect(calls(fetchMock, '/api/steps')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toMatchObject({ questionId: 'q-money', optionId: 'save', status: 'started' })
  })

  it('deletes everything, on the server and on this phone, except the device token', async () => {
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [], skips: [] }))
    localStorage.setItem('pi.device.v1', 'v1.mine.sig')
    const fetchMock = await openMirror()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete everything' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it all' }))
    expect(await screen.findByText('Everything is deleted, here and on our server.')).toBeInTheDocument()

    const del = fetchMock.mock.calls.find(([u, init]) => u === '/api/mirror' && init?.method === 'DELETE')!
    expect((del[1]!.headers as Record<string, string>).Authorization).toBe('Device v1.mine.sig')
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
    expect(localStorage.getItem('pi.device.v1')).toBe('v1.mine.sig')
  })

  it('keeps everything when the server could not delete it', async () => {
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [], skips: [] }))
    await openMirror({ forget: { status: 503, body: { error: 'unavailable' } } })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete everything' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it all' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("I couldn't reach the server, so nothing was deleted.")
    expect(localStorage.getItem('pi.history.v1')).not.toBeNull()
  })

  it('gets a new token and asks again when the server no longer accepts the old one', async () => {
    localStorage.setItem('pi.device.v1', 'v1.stale.sig')
    const fetchMock = await openMirror({
      mirror: [
        { status: 401, body: { error: 'invalid_device' } },
        { status: 200, body: mirror },
      ],
    })
    expect(await screen.findByText('The Steady Noticer.')).toBeInTheDocument()
    expect(mirrorCalls(fetchMock).map(([, init]) => (init!.headers as Record<string, string>).Authorization)).toEqual([
      'Device v1.stale.sig',
      'Device v1.device1.sig',
    ])
  })

  it('offers a retry when the mirror fails to load', async () => {
    const fetchMock = await openMirror({
      mirror: [
        { status: 503, body: { error: 'unavailable' } },
        { status: 200, body: mirror },
      ],
    })
    expect(await screen.findByText("I couldn't load your mirror just now.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The Steady Noticer.')).toBeInTheDocument()
    expect(mirrorCalls(fetchMock)).toHaveLength(2)
  })

  it('offers support contacts, calmly, when heavy answers repeat in a week', async () => {
    await openMirror({ mirror: { status: 200, body: { ...mirror, lowMood: true } } })
    const note = await screen.findByRole('note', { name: 'Support' })
    expect(within(note).getByRole('link', { name: /Find a helpline/ })).toHaveAttribute('href', 'https://findahelpline.com')
  })
})

// The week (2026-10-15): three in the morning, three more at noon, Monday to
// Saturday; Sunday is for the mirror.
const lunch: Question = {
  id: 'q-lunch',
  theme: 'food',
  care: 'everyday',
  prompt: 'Lunch time. What usually happens?',
  options: [
    { id: 'desk', label: 'I eat at my desk', depth: 1 },
    { id: 'out', label: 'I get out for a walk', depth: 2 },
  ],
}
const queue: Question = {
  id: 'q-queue',
  theme: 'anger',
  care: 'personal',
  prompt: 'Someone cuts in front of you in a queue. What do you do?',
  options: [
    { id: 'let-go', label: 'Let it go', depth: 1 },
    { id: 'say', label: 'Say something calmly', depth: 2 },
  ],
}
const ring: Question = {
  id: 'q-ring',
  theme: 'friendship',
  care: 'personal',
  prompt: 'A friend calls when you are busy. You…',
  options: [
    { id: 'pick-up', label: 'Pick up anyway', depth: 1 },
    { id: 'later', label: 'Text that I will call later', depth: 2 },
  ],
}
const sixADay: DailySet = { ...today, afternoon: [lunch, queue, ring], pool: [...today.questions, lunch, queue, ring] }

describe('the week', () => {
  async function morningThree() {
    await answer('Right after eating')
    next()
    await skip()
    await answer('One')
    next()
  }

  it('opens three more questions at noon, after the morning three', async () => {
    stubApi({ today: { status: 200, body: sixADay } })
    const { unmount } = render(<App />)
    await morningThree()
    const morning = await screen.findByRole('region', { name: 'Morning done.' })
    expect(morning).toHaveTextContent('Three more questions open at noon.')
    expect(morning).not.toHaveTextContent('Tomorrow')
    expect(screen.queryByText('Lunch time. What usually happens?')).not.toBeInTheDocument()
    unmount()

    vi.setSystemTime(new Date(2026, 9, 12, 12, 30))
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday afternoon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 4 of 6' })).toHaveAttribute('aria-current', 'step')
    await answer('I get out for a walk')
    next()
    await answer('Say something calmly')
    next()
    await answer('Text that I will call later')
    next()
    const done = await screen.findByRole('region', { name: 'Done for today.' })
    expect(done).toHaveTextContent('Tomorrow Money · Friendship')
    expect(within(done).getByRole('list', { name: "Today's answers" }).children).toHaveLength(6)
  })

  it('follows up on the morning three only in the evening', async () => {
    answeredThisMorning()
    localStorage.setItem('pi.choice.q-lunch', 'out')
    localStorage.setItem('pi.at.q-lunch', String(new Date(2026, 9, 12, 12, 30).getTime()))
    vi.setSystemTime(at(19))
    stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    expect(await screen.findByText('Did any dishes pile up today?')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Question \d of 2$/ })).toHaveLength(2)
  })

  it('opens on the mirror on Sunday, with no questions to answer', async () => {
    vi.setSystemTime(at(9, 18))
    stubApi({ edition: { status: 200, body: sunday }, mirror: { status: 200, body: mirror } })
    render(<App />)
    expect(await screen.findByText('The Steady Noticer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your mirror' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    const review = screen.getByRole('region', { name: 'Sunday is for looking back.' })
    expect(review).toHaveTextContent('Fresh questions arrive tomorrow morning.')
    expect(review).toHaveTextContent('Tomorrow Money · Anger')
    expect(screen.getByText('Review day · Sunday')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Done for today.' })).not.toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: 'Open your mirror' }))
    expect(screen.getByRole('button', { name: 'Your mirror' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('looks ahead to the review day on Saturday', async () => {
    vi.setSystemTime(at(9, 17))
    stubApi({ today: { status: 200, body: { ...today, date: '2026-10-17', tomorrowThemes: [] } } })
    render(<App />)
    await morningThree()
    const done = await screen.findByRole('region', { name: 'Done for today.' })
    expect(done).toHaveTextContent('Tomorrow is Sunday: no new questions, just your week in the mirror.')
  })
})
