import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import type { DailySet, Mirror, Question } from './api'

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

// Edwin, 2026-10-15: a quiet companion, "not comparing them with other
// people", and "it should not feel like game".
const crowdOrScore = /player|\bcrowd\b|%|\bpts\b|\bpoints\b|bonus|\blevels?\b|\bshare\b|compare with/i


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

  it('shows the insight with its first sentence as the headline and one step', async () => {
    stubApi({})
    render(<App />)
    expect(screen.queryByText(/clear sink/)).not.toBeInTheDocument()
    await answer('Right after eating')

    const insight = screen.getByRole('note', { name: 'What your answer may say' })
    expect(within(insight).getByText('You like a clear sink before you relax.')).toHaveClass('insight-headline')
    expect(within(insight).getByText('Unfinished tasks are noisier for you than for most.')).toHaveClass('insight-body')
    expect(insight).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(screen.getByRole('group', { name: 'Try this' })).toHaveTextContent('Try this: Next time a small task appears')
    expect(screen.queryByText(/Batching chores/)).not.toBeInTheDocument()
  })

  it("keeps the card's sources out of sight: no research line, evidence label or link", async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    const card = screen.getByRole('region', { name: 'When do you wash the dishes?' })
    expect(card).not.toHaveTextContent('when-then plan')
    expect(card).not.toHaveTextContent(/evidence|Gollwitzer/)
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
  })

  it('never sets an answer against other people or keeps score', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    const card = screen.getByRole('region', { name: 'When do you wash the dishes?' })
    expect(card).not.toHaveTextContent(crowdOrScore)
    expect(card).not.toHaveTextContent('+10')
    expect(fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/results'))).toEqual([])
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
    expect(screen.getByRole('group', { name: 'Try this' })).toHaveTextContent(
      "Added to today's moves. I'll ask how it went at 4 pm.",
    )
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
        at: at(9).getTime(),
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

  it('ends the morning with "Morning done.", the thread and the moves, without repeating the cards or keeping score', async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await answer('Several')
    fireEvent.click(screen.getByRole('button', { name: "I'll try it" }))
    next()

    const done = await screen.findByRole('region', { name: 'Morning done.' })
    const tiles = within(done).getByRole('list', { name: "This morning's answers" })
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
    expect(moves).toHaveTextContent('Tonight, set one alarm fewer')
    expect(done).toHaveTextContent("At 4 pm I'll ask how this morning went.")
    expect(done).not.toHaveTextContent('Tomorrow')
    expect(done).toHaveTextContent('For self-reflection, not a diagnosis.')
    // A quiet close: nothing to share, no score.
    expect(done).not.toHaveTextContent(crowdOrScore)
    expect(within(done).queryByRole('button')).not.toBeInTheDocument()
    // The cards were just shown; the recap does not repeat them.
    expect(done).not.toHaveTextContent('clear sink')
    expect(done).not.toHaveTextContent('Several alarms suggest')
    expect(document.body.textContent).not.toMatch(noClinicianWords)

    // The dashes go back to any finished card.
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
  })

  it('opens a returning phone on its first open question, and keeps no score or record of days', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    await answer('Right after eating')
    unmount()
    render(<App />)
    expect(await screen.findByText('How do you split the bill?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(localStorage.getItem('pi.game.v1')).toBeNull()
    expect(localStorage.getItem('pi.days')).toBeNull()
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

  it('opens on the day\'s own questions, whatever an old compare link says', async () => {
    window.location.hash = '#c=' + btoa(JSON.stringify({ e: 3, a: [['q-dishes', 'end-of-day']] }))
    stubApi({})
    render(<App />)
    expect(await screen.findByRole('button', { name: 'Question 1 of 3' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/compare/i)
  })
})

// The day's second sitting (Edwin, 2026-10-15): "people [should] just answer
// in the morning and evening so the new questions should pop up at 4:00 pm
// and reset at midnight". The phone's clock decides; nobody picks a time of day.
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
const sixADay: DailySet = { ...today, evening: [lunch, queue, ring], pool: [...today.questions, lunch, queue, ring] }

describe('the evening, from 4 pm', () => {
  it('opens on its own at 4 pm: a check-in on the morning answers, then three more questions', async () => {
    answeredThisMorning()
    vi.setSystemTime(at(16))
    const fetchMock = stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)

    const card = await screen.findByRole('region', { name: 'Did any dishes pile up today?' })
    expect(card).toHaveTextContent('This morning you said Right after eating')
    expect(screen.getByText('Edition #3 · Monday evening')).toBeInTheDocument()
    expect(screen.getByText('Welcome back. Before anything new, how did this morning go?')).toBeInTheDocument()
    // The morning three, two check-ins and three new questions, in one line.
    expect(screen.getByRole('button', { name: 'Question 4 of 8' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Question 6 of 8' })).toBeDisabled()
    // No switch between parts of the day: the clock decides.
    expect(
      screen.queryByRole('button', { name: /morning|afternoon|evening|check-in|Today's questions/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'They piled up a bit' }))
    const reflection = await within(card).findByRole('note', { name: 'Your reflection' })
    expect(reflection).toHaveTextContent('A pile on a full day is normal.')
    expect(reflection).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(card).not.toHaveTextContent(crowdOrScore)
    expect(within(card).queryByRole('button', { name: 'I washed them straight away' })).not.toBeInTheDocument()
    next()
    const second = await screen.findByRole('region', { name: 'How did getting up go this morning?' })
    expect(second).toHaveTextContent('This morning you said Several')
    await answer('I snoozed a few times')
    next()

    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(calls(fetchMock, '/api/votes')).toHaveLength(0) // check-in answers stay on the phone
    const h = JSON.parse(localStorage.getItem('pi.history.v1')!)
    expect(h.answers).toContainEqual(
      expect.objectContaining({ questionId: 'q-dishes#evening', evening: true, traits: { conscientiousness: -1 } }),
    )
    await answer('I get out for a walk')
    next()
    await answer('Say something calmly')
    next()
    await answer('Text that I will call later')
    next()
    const day = await screen.findByRole('region', { name: 'Day complete' })
    expect(within(day).getByRole('list', { name: "This evening's answers" }).children).toHaveLength(3)
    expect(day).toHaveTextContent('Tomorrow Money · Friendship')
    expect(day).not.toHaveTextContent(crowdOrScore)
    expect(calls(fetchMock, '/api/votes')).toHaveLength(3)

    // The morning's cards are still one tap away on the dashes.
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 8' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
  })

  it('turns to the evening at 4 pm, and to a new day at midnight, while the app stays open', async () => {
    answeredThisMorning()
    vi.setSystemTime(at(15))
    const fetchMock = stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Morning done.' })).toHaveTextContent(
      "Three more questions open at 4 pm, and I'll ask how this morning went.",
    )

    vi.setSystemTime(at(16))
    fireEvent(window, new Event('focus'))
    expect(await screen.findByRole('region', { name: 'Did any dishes pile up today?' })).toBeInTheDocument()

    vi.setSystemTime(at(0, 13))
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(calls(fetchMock, '/api/editions/2026-10-13')).toHaveLength(1))
  })

  it('ends the day asking how each morning move went, with a thought for tomorrow', async () => {
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
          at: at(8).getTime(),
        },
        {
          date: '2026-10-12',
          questionId: 'q-lunch',
          optionId: 'out',
          step: 'Take ten minutes outside at lunch.',
          status: 'started',
          at: at(17).getTime(),
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
    expect(day).not.toHaveTextContent(crowdOrScore)
    const moves = within(day).getByRole('group', { name: 'Your moves' })
    expect(moves).toHaveTextContent('set one alarm fewer')
    expect(moves).toHaveTextContent('How did it go?')
    // A move picked this evening has had no day yet; the mirror asks about it later.
    expect(moves).toHaveTextContent('Take ten minutes outside at lunch.')
    expect(moves).toHaveTextContent('Started this evening')
    expect(within(moves).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'It helped',
      'No change yet',
      "Didn't get to it",
    ])
    fireEvent.click(within(moves).getByRole('button', { name: 'It helped' }))
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
    expect(day).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('gives no check-in the same evening to a question first answered in the evening', async () => {
    vi.setSystemTime(at(19))
    stubApi({})
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday evening')).toBeInTheDocument()
    await answer('Right after eating')
    next()
    await skip()
    await skip()
    expect(await screen.findByRole('region', { name: 'Day complete' })).toBeInTheDocument()
    expect(screen.queryByText('Did any dishes pile up today?')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Question \d of \d$/ })).toHaveLength(3)
  })
})

// A week of real-looking mirror data, as GET /api/mirror returns it.
const mirror: Mirror = {
  date: '2026-10-18',
  week: 42,
  from: '2026-10-12',
  to: '2026-10-18',
  editions: [1, 6],
  weeksActive: 3,
  stats: {
    daysActive: 5,
    daysActiveLastWeek: 4,
    daysSoFar: 6,
    answers: 18,
    private: 1,
    deepest: 5,
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
        { theme: 'habits', depth: 'light' },
        { theme: 'friendship', depth: 'deep' },
        { theme: 'intimacy', depth: 'private' },
      ],
    },
    { date: '2026-10-13', edition: 2, answers: [{ theme: 'money', depth: 'deeper' }] },
    { date: '2026-10-14', edition: 3, answers: [] },
    { date: '2026-10-15', edition: 4, answers: [{ theme: 'anger', depth: 'deep' }] },
    { date: '2026-10-16', edition: 5, answers: [{ theme: 'habits', depth: 'light' }] },
    {
      date: '2026-10-17',
      edition: 6,
      answers: [
        { theme: 'friendship', depth: 'deeper' },
        { theme: 'money', depth: 'light' },
      ],
    },
    { date: '2026-10-18', edition: 0, answers: [] },
  ],
  traits: [
    {
      trait: 'conscientiousness',
      answers: 14,
      solid: true,
      score: 74,
      change: 4,
      history: [
        { week: 40, score: 65, solid: true },
        { week: 41, score: 70, solid: true },
        { week: 42, score: 74, solid: true },
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
      change: 7,
      history: [
        { week: 40, solid: false },
        { week: 41, score: 61, solid: false },
        { week: 42, score: 68, solid: false },
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
      history: [
        { week: 40, solid: false },
        { week: 41, solid: false },
        { week: 42, score: 52, solid: false },
      ],
      evidence: [],
    },
  ],
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
  weeksActive: 0,
  stats: {
    daysActive: 0,
    daysActiveLastWeek: 0,
    daysSoFar: 6,
    answers: 0,
    private: 0,
    deepest: 0,
    learned: 0,
    rated: 0,
    stepsStarted: 0,
    stepsTried: 0,
    stepsHelped: 0,
  },
  days: mirror.days.map((d) => ({ ...d, answers: [] })),
  traits: [],
  themes: [],
  steps: [],
  stepRecord: { started: 0, tried: 0, helped: 0 },
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
    expect(tiles).toHaveTextContent('Went deepest5times you chose the most revealing answer')
    expect(tiles).toHaveTextContent('Learned something12 of 15')
    expect(tiles).toHaveTextContent('Small steps kept2 of 3')

    const line = within(page).getByRole('figure', { name: 'One line from this week' })
    expect(line).toHaveTextContent('“Right after eating”')
    expect(line).toHaveTextContent('The answer that said the most about you this week.')
  })

  it('shows every section that has real data, numbered in order', async () => {
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    await within(page).findByText('The Steady Noticer.')
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Your week at a glance',
      '02 Your trait read',
      "03 How you've moved",
      '04 All of you',
      '05 Who you were this week',
      '06 Your small steps',
      '07 Next week',
      '08 The road ahead',
    ])

    expect(within(page).getByRole('listitem', { name: /^Monday:/ })).toHaveAccessibleName(
      'Monday: Daily habits, a light answer; Friendship, a deep answer; Intimacy, a private answer',
    )
    expect(within(page).getByRole('listitem', { name: /^Wednesday:/ })).toHaveAccessibleName('Wednesday: missed')
    expect(within(page).getByRole('listitem', { name: /^Sunday:/ })).toHaveAccessibleName('Sunday: review day')

    const traits = within(page).getByRole('list', { name: 'Trait read' })
    expect(traits).toHaveTextContent('Organised74 +4 vs last week')
    expect(traits).toHaveTextContent('Solid read · 14 answers')
    expect(traits).toHaveTextContent('Early read · 9 answers')
    expect(page).toHaveTextContent('compares you only with yourself')

    const who = within(page).getByRole('heading', { name: '05 Who you were this week' }).parentElement!
    expect(who).toHaveTextContent('You finish what you start.')
    expect(who).toHaveTextContent('You said: “Right after eating”, “Before bed”')
    expect(who).toHaveTextContent('Prediction: a solid read')
    expect(who).toHaveTextContent('Early read: from 9 answers')
    expect(who).not.toHaveTextContent('Energy from people') // 52 sits in the middle

    expect(page).toHaveTextContent('4 steps started, 2 tried, 1 helped.')
    expect(page).toHaveTextContent(
      'Closeness radar needs 3 more answers; Outgoing needs 8 more answers to become solid reads.',
    )
    expect(page).toHaveTextContent('Coming up')
    expect(page).toHaveTextContent('Money · Dating')

    expect(page).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(within(page).getByRole('note', { name: 'What leaves my phone' })).toHaveTextContent('no name, no email')
    // Yours alone: no one else's answers, no score, nothing to share, no studies cited.
    expect(page).not.toHaveTextContent(crowdOrScore)
    expect(page).not.toHaveTextContent(/typical|ranked|median|evidence|Roberts|Soto|Conscientiousness/)
    expect(within(page).queryByRole('list', { name: 'Sources' })).not.toBeInTheDocument()
    expect(within(page).queryAllByRole('link')).toEqual([])
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
    expect(within(page).getByRole('list', { name: 'This week in numbers' })).toHaveTextContent('Went deepest0')
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

// The week (2026-10-15): three in the morning, three more at 4 pm, Monday to
// Saturday; Sunday is for the mirror.
describe('the week', () => {
  async function morningThree() {
    await answer('Right after eating')
    next()
    await skip()
    await answer('One')
    next()
  }

  it('opens three more questions at 4 pm, not before', async () => {
    stubApi({ today: { status: 200, body: sixADay } })
    const first = render(<App />)
    await morningThree()
    const morning = await screen.findByRole('region', { name: 'Morning done.' })
    expect(morning).toHaveTextContent("Three more questions open at 4 pm, and I'll ask how this morning went.")
    expect(screen.queryByText('Lunch time. What usually happens?')).not.toBeInTheDocument()
    first.unmount()

    vi.setSystemTime(new Date(2026, 9, 12, 15, 59))
    const second = render(<App />)
    expect(await screen.findByRole('region', { name: 'Morning done.' })).toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday')).toBeInTheDocument()
    second.unmount()

    vi.setSystemTime(new Date(2026, 9, 12, 16, 30))
    render(<App />)
    expect(await screen.findByText('Did any dishes pile up today?')).toBeInTheDocument()
    await skip()
    await skip()
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 6 of 8' })).toHaveAttribute('aria-current', 'step')
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
    expect(review).not.toHaveTextContent(crowdOrScore)
    expect(screen.getByText('Review day · Sunday')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Morning done.' })).not.toBeInTheDocument()
    fireEvent.click(within(review).getByRole('button', { name: 'Open your mirror' }))
    expect(screen.getByRole('button', { name: 'Your mirror' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('looks ahead to the review day on Saturday evening', async () => {
    vi.setSystemTime(at(19, 17))
    stubApi({ today: { status: 200, body: { ...today, date: '2026-10-17', tomorrowThemes: [] } } })
    render(<App />)
    await skip()
    await skip()
    await skip()
    const done = await screen.findByRole('region', { name: 'Day complete' })
    expect(done).toHaveTextContent('Tomorrow is Sunday: no new questions, just your week in the mirror.')
    expect(done).toHaveTextContent('Sleep well. Tomorrow is for looking back')
  })
})
