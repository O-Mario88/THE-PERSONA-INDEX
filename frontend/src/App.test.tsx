import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import type { DailySet, Mirror, PeriodMirror, Question } from './api'
import { READS } from './reads/reads'
import { honestLine, TRAITS } from './traits'

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

const keptOnServer = {
  kept: { answers: 12, privateAnswers: 2, steps: 2, weeklyNotes: 1, votes: 12, firstAnswer: '2026-10-05' },
  keptFor: { answersDays: 35, weeklyNotesDays: 400, votesDays: 7 },
}

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
  period?: Route | Route[]
  forget?: Route
  kept?: Route
  steps?: Route
  rating?: Route | Route[]
  regional?: Route
  social?: (url: string, init?: RequestInit) => Route | undefined // Stage 5: accounts and the circle
}) {
  let devices = 0
  let votes = 0
  let ratings = 0
  let mirrors = 0
  let periods = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/device' && init?.method === 'POST') {
      devices++
      return json({ status: 201, body: { token: `v1.device${devices}.sig` } })
    }
    if (url === '/api/account/device') {
      devices++
      return json({ status: 200, body: { token: `v1.device${devices}.sig` } })
    }
    if (url.startsWith('/api/editions/')) {
      return json(routes.edition ?? routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/questions/today') {
      return json(routes.today ?? { status: 200, body: today })
    }
    if (url === '/api/ratings' && init?.method === 'POST') {
      return json(pick(routes.rating, ratings++) ?? { status: 202, body: { status: 'accepted', eventId: 'evt_r' } })
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
    if (/^\/api\/mirror\/(month|quarter|year)\?date=/.test(url)) {
      return json(pick(routes.period, periods++) ?? { status: 404, body: { error: 'not_found' } })
    }
    if (url === '/api/device/data' && init?.method === 'DELETE') {
      return json(routes.forget ?? { status: 200, body: { deleted: { answers: 12, steps: 2, weeklyNotes: 1, votes: 12 } } })
    }
    if (url === '/api/device/data') {
      return json(routes.kept ?? { status: 200, body: keptOnServer })
    }
    if (url === '/api/regional') {
      return json(routes.regional ?? { status: 404, body: { error: 'no_regional' } })
    }
    const social = routes.social?.(url, init)
    if (social) return json(social)
    return json({ status: 404, body: { error: 'not_found' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// An element's text with every kind of space as a plain one.
const plainText = (el: Element) => el.textContent!.replace(/\s+/g, ' ')
const calls = (f: ReturnType<typeof stubApi>, url: string) => f.mock.calls.filter(([u]) => String(u) === url)
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body))

// The phone's clock: 9 am on the fixture's date, local time. Only Date is
// faked, so timers and waits run normally.
const at = (hour: number, day = 12) => new Date(2026, 9, day, hour, 0)

beforeEach(() => {
  localStorage.clear()
  // Every test but the welcome's own starts past the one-time welcome.
  localStorage.setItem('pi.welcomed', '1')
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
  await screen.findByRole('button', { name: /^Next/ })
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
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
// people", and "it should not feel like game". Since 2026-10-24 (Stage 5)
// the week's name may be shared as a card, so "share" is no longer banned;
// the card itself never carries an answer (ShareCard.test.tsx).
const crowdOrScore = /player|\bcrowd\b|%|\bpts\b|\bpoints\b|bonus|\blevels?\b|compare with/i


describe('the welcome', () => {
  it('greets a first open once, then goes straight to the first sitting', async () => {
    localStorage.removeItem('pi.welcomed')
    stubApi({ today: { status: 200, body: sixADay } })
    const first = render(<App />)
    expect(await screen.findByRole('heading', { name: 'A calmer you starts with reflection.' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Begin your first reflection' }))
    expect(await screen.findByRole('region', { name: 'When do you wash the dishes?' })).toBeInTheDocument()
    first.unmount()

    render(<App />)
    expect(await screen.findByRole('region', { name: 'When do you wash the dishes?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'A calmer you starts with reflection.' })).not.toBeInTheDocument()
  })

  it('never shows to someone who has answered before', async () => {
    localStorage.removeItem('pi.welcomed')
    answeredThisMorning()
    stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    expect(await screen.findByRole('navigation', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'A calmer you starts with reflection.' })).not.toBeInTheDocument()
  })
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

  // Edwin, 2026-10-15: "Some answers need typing ... so they are not limited
  // to the options on the app."
  it('lets someone answer in their own words, keeps the words on the phone, and takes the insight from the closest option', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'In my own words' }))
    const box = within(card).getByRole('textbox', { name: 'In your own words' })
    expect(card).toHaveTextContent('Kept on this phone. The app never sends it.')
    expect(within(card).getByRole('button', { name: 'Keep my words' })).toBeDisabled()
    fireEvent.change(box, { target: { value: 'Depends who cooked. If it was me, straight away.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))

    expect(card).toHaveTextContent('“Depends who cooked. If it was me, straight away.”')
    const closest = within(card).getByRole('group', { name: 'Which of these comes closest? Your insight comes from that one.' })
    fireEvent.click(within(closest).getByRole('button', { name: 'Right after eating' }))
    expect(await within(card).findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
    expect(card).toHaveTextContent('In your words')
    expect(card).toHaveTextContent('Closest to: Right after eating')
    expect(card).not.toHaveTextContent('You chose')

    // The vote is the option tapped; the words never leave the phone.
    expect(bodyOf(calls(fetchMock, '/api/votes')[0])).toMatchObject({ questionId: 'q-dishes', optionId: 'right-away' })
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toContain('Depends who cooked')
    expect(JSON.parse(localStorage.getItem('pi.words.q-dishes')!)).toEqual({
      questionId: 'q-dishes',
      date: '2026-10-12',
      prompt: 'When do you wash the dishes?',
      theme: 'habits',
      words: 'Depends who cooked. If it was me, straight away.',
      closest: 'Right after eating',
    })
  })

  it('after a failed vote on own words, only offers that answer again, since the server may have counted it', async () => {
    stubApi({
      vote: [
        { status: 503, body: { error: 'unavailable' } },
        { status: 202, body: { status: 'accepted', eventId: 'evt_1' } },
      ],
    })
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    fireEvent.click(within(card).getByRole('button', { name: 'In my own words' }))
    fireEvent.change(within(card).getByRole('textbox'), { target: { value: 'Straight after, mostly.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Right after eating' }))
    expect(await within(card).findByRole('alert')).toHaveTextContent('did not go through')
    expect(within(card).queryByRole('button', { name: 'None of these' })).not.toBeInTheDocument()
    expect(localStorage.getItem('pi.words.q-dishes')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Right after eating' }))
    expect(await within(card).findByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.words.q-dishes')!).words).toBe('Straight after, mostly.')
  })

  it('keeps own words five weeks, like answers on the server', async () => {
    const keep = (id: string, date: string) =>
      localStorage.setItem(`pi.words.${id}`, JSON.stringify({ questionId: id, date, prompt: 'P', words: 'W' }))
    keep('q-old', '2026-09-06') // 36 days before
    keep('q-recent', '2026-09-08') // 34 days before
    stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    fireEvent.click(within(card).getByRole('button', { name: 'In my own words' }))
    fireEvent.change(within(card).getByRole('textbox'), { target: { value: 'Paper plates.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))
    fireEvent.click(within(card).getByRole('button', { name: 'None of these' }))
    expect(localStorage.getItem('pi.words.q-old')).toBeNull()
    expect(localStorage.getItem('pi.words.q-recent')).not.toBeNull()
    expect(localStorage.getItem('pi.words.q-dishes')).not.toBeNull()
  })

  it('keeps own words that no option comes close to, sending nothing and guessing nothing', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    fireEvent.click(within(card).getByRole('button', { name: 'In my own words' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Back to the options' }))
    fireEvent.click(within(card).getByRole('button', { name: 'In my own words' }))
    fireEvent.change(within(card).getByRole('textbox'), { target: { value: 'We eat off paper plates.' } })
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))
    fireEvent.click(within(card).getByRole('button', { name: 'Change my words' }))
    expect(within(card).getByRole('textbox')).toHaveValue('We eat off paper plates.')
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))
    fireEvent.click(within(card).getByRole('button', { name: 'None of these' }))

    expect(card).toHaveTextContent('“We eat off paper plates.”')
    expect(card).toHaveTextContent("I'd rather say nothing than guess about you.")
    expect(within(card).queryByRole('note', { name: 'What your answer may say' })).not.toBeInTheDocument()
    expect(calls(fetchMock, '/api/votes')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Question 1 of 3' })).toHaveClass('answered')
    next()
    expect(await screen.findByText('How do you split the bill?')).toBeInTheDocument()
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
    expect(screen.getByRole('group', { name: 'Something to try' })).toHaveTextContent(
      'Something you could try: Next time a small task appears',
    )
    expect(screen.queryByText(/Batching chores/)).not.toBeInTheDocument()
  })

  it('unfolds the card in three beats, one tap each, when motion is on', async () => {
    const media = window.matchMedia
    window.matchMedia = ((q: string) => ({ ...media(q), matches: false })) as typeof window.matchMedia
    try {
      stubApi({})
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
      const insight = await screen.findByRole('note', { name: 'What your answer may say' })
      expect(within(insight).getByText('You like a clear sink before you relax.')).toBeInTheDocument()
      expect(within(insight).queryByText('Unfinished tasks are noisier for you than for most.')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Next/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Read on' }))
      expect(within(insight).getByText('Unfinished tasks are noisier for you than for most.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'And the other side' }))
      expect(screen.getByRole('button', { name: /^Next/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Keep in Notebook/ })).toBeInTheDocument()
    } finally {
      window.matchMedia = media
    }
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

  it("keeps a card's step as one of today's small steps, on the phone and in the mirror", async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: "I'll try it" }))
    expect(screen.getByRole('group', { name: 'Something to try' })).toHaveTextContent(
      "Added to today's small steps. I'll ask how it went this evening.",
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

  // Edwin, 2026-10-24: the app helps people find their own answers, never hands them out.
  it('lets someone act on a card in their own way, kept on the phone as their one plan', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    const tryIt = screen.getByRole('group', { name: 'Something to try' })
    fireEvent.click(within(tryIt).getByRole('button', { name: 'My own idea' }))
    const form = within(tryIt).getByRole('form', { name: 'My own idea' })
    fireEvent.change(within(form).getByRole('textbox', { name: 'When' }), { target: { value: 'I finish dinner' } })
    fireEvent.change(within(form).getByRole('textbox', { name: 'I will' }), { target: { value: 'leave the pans till morning' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Keep my plan' }))
    expect(tryIt).toHaveTextContent("Your own plan, kept in your notebook. Next time you sit down, I'll ask how it went.")
    const plans = Object.keys(localStorage).filter((k) => k.startsWith('pi.nb.plan.'))
    expect(plans).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(plans[0])!)).toMatchObject({
      trait: 'conscientiousness',
      high: true,
      when: 'I finish dinner',
      will: 'leave the pans till morning',
    })
    expect(calls(fetchMock, '/api/steps')).toHaveLength(0)
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toContain('pans')
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

  it('asks whether the card is you, and sends only that tap', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    const ask = screen.getByRole('group', { name: 'Does this sound like you?' })
    fireEvent.click(within(ask).getByRole('button', { name: 'Partly' }))
    expect(await screen.findByText("Noted. I'll hold it loosely and keep watching.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not me' })).not.toBeInTheDocument()
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/ratings')[0])).toMatchObject({
      questionId: 'q-dishes',
      optionId: 'right-away',
      verdict: 'partly',
    })
    expect(JSON.parse(localStorage.getItem('pi.history.v1')!).answers[0]).toMatchObject({ verdict: 'partly' })
  })

  it('after "Not me", asks what is closer and reads that one instead', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    expect(await screen.findByText("You told me this isn't you, so I'll watch rather than assume.")).toBeInTheDocument()
    const closer = screen.getByRole('group', { name: "What's closer to you?" })
    fireEvent.click(within(closer).getByRole('button', { name: /Batching chores suggests you protect your evenings/ }))
    expect(await screen.findByText(/Closer to you: “Batching chores/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.history.v1')!).answers[0]).toMatchObject({
      verdict: 'not_me',
      closer: { optionId: 'end-of-day', traits: {} },
    })
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/ratings')[0])).toMatchObject({ optionId: 'right-away', verdict: 'not_me' })
  })

  it('after "Not me" and "Neither", does not ask again when the card is opened later', async () => {
    stubApi({})
    const first = render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Neither' }))
    expect(screen.queryByText("What's closer to you?")).not.toBeInTheDocument()
    first.unmount()

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByText("You told me this isn't you, so I'll watch rather than assume.")).toBeInTheDocument()
    expect(screen.queryByText("What's closer to you?")).not.toBeInTheDocument()
  })

  it('sends a card tap that did not get through again, with the same key, when the app next opens', async () => {
    const fetchMock = stubApi({
      rating: [
        { status: 503, body: { error: 'unavailable' } },
        { status: 202, body: { status: 'accepted', eventId: 'evt_r' } },
      ],
    })
    const first = render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(1))
    await waitFor(() => expect(localStorage.getItem('pi.unrated.q-dishes')).not.toBeNull())
    first.unmount()

    render(<App />)
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(2))
    const [lost, again] = calls(fetchMock, '/api/ratings')
    const key = (c: unknown[]) => ((c[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key']
    expect(key(again)).toBe(key(lost))
    expect(bodyOf(again)).toMatchObject({ questionId: 'q-dishes', optionId: 'right-away', verdict: 'not_me' })
    await waitFor(() => expect(localStorage.getItem('pi.unrated.q-dishes')).toBeNull())
  })

  it('after "Not me", keeps a line in your own words on this phone and never sends it', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    fireEvent.change(await screen.findByLabelText('Or in a line of your own'), {
      target: { value: 'I wash up fast so I can stop thinking about it' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Keep my line' }))
    expect(await screen.findByText('“I wash up fast so I can stop thinking about it”')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.instead.q-dishes')!)).toMatchObject({
      words: 'I wash up fast so I can stop thinking about it',
    })
    await waitFor(() => expect(calls(fetchMock, '/api/ratings')).toHaveLength(1))
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toContain('wash up fast')
  })

  it('shows the other side of the answer, and ties it to earlier ones only when that is true', async () => {
    const other = structuredClone(today)
    other.questions[0].options[0].insight!.otherSide = 'A clear sink can turn into a rule that keeps you from resting.'
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({
        answers: [{ date: '2026-10-12', questionId: 'x', theme: 'money', depth: 2, traits: { conscientiousness: 1 } }],
        skips: [],
      }),
    )
    stubApi({ today: { status: 200, body: other } })
    render(<App />)
    await answer('Right after eating')
    const card = screen.getByRole('note', { name: 'What your answer may say' })
    expect(card).toHaveTextContent('The other side A clear sink can turn into a rule')
    expect(card).toHaveTextContent('Second time this week your answer leaned towards getting things done.')
    expect(card).toHaveTextContent('For self-reflection, not a diagnosis.')
    // Once the person says the card is not them, the thread no longer counts it.
    fireEvent.click(screen.getByRole('button', { name: 'Not me' }))
    expect(card).not.toHaveTextContent('Second time this week')
    expect(card).toHaveTextContent('The other side A clear sink can turn into a rule')
  })

  it('ends the morning with "Morning done.", the thread, the moves and what opens at 5 pm, without repeating the cards or keeping score', async () => {
    stubApi({ today: { status: 200, body: sixADay } })
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
    expect(thread).toHaveTextContent(
      "Today your answers leaned towards getting things done, and towards worry. One day is only a hint, so here's what each could mean.",
    )
    expect(thread).toHaveTextContent('Getting things done')
    expect(thread).toHaveTextContent('Worry and tension')
    expect(thread).toHaveTextContent('Only a hint so far, from 1 answer.')
    expect(thread).toHaveTextContent('For the rest of today:')
    // One answer is a hint: the honest part waits for a pattern.
    expect(thread).not.toHaveTextContent('The honest part')
    const moves = within(done).getByRole('group', { name: 'One small step for today' })
    expect(moves).toHaveTextContent('Tonight, set one alarm fewer')
    // Something to look forward to: the evening's three themes, and when.
    const later = within(done).getByRole('group', { name: 'Your evening three · 5 pm' })
    expect(later).toHaveTextContent('Food and eating')
    expect(later).toHaveTextContent('Anger')
    expect(later).toHaveTextContent('Friendship')
    expect(later).toHaveTextContent("Go about your day. They'll be waiting for you at 5 pm.")
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

  it('tells the honest part once a leaning is a pattern', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({
        answers: ['2026-10-09', '2026-10-10'].map((date, i) => ({
          date,
          questionId: `x${i}`,
          theme: 'money',
          depth: 2,
          traits: { conscientiousness: 1 },
        })),
        skips: [],
      }),
    )
    stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    await skip()
    const thread = within(await screen.findByRole('region', { name: 'Morning done.' })).getByRole('note', {
      name: "Today's thread",
    })
    expect(thread).toHaveTextContent('Getting things done has come up in 3 answers over 3 days, so a pattern is forming.')
    expect(thread).toHaveTextContent('A pattern is forming: 3 answers over 3 days.')
    // Edwin, 2026-10-15: "not afraid of telling them the negative things ... in a polite human language".
    expect(thread).toHaveTextContent(
      `The honest part: ${honestLine(TRAITS.conscientiousness.high, '2026-10-12', 'morning').text}`,
    )
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
    // Money drew a deep answer yesterday, so its card opens on a box for one line.
    fireEvent.click(await screen.findByRole('button', { name: 'Just tap instead' }))
    await answer('Something for me')
    const h = JSON.parse(localStorage.getItem('pi.history.v1')!)
    expect(h.answers).toContainEqual({
      date: '2026-10-12',
      questionId: 'q-payday',
      theme: 'money',
      depth: 4,
      traits: { present_bias: 2 },
      optionId: 'treat',
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

    // The keep-it-mild switch is always there, on Account, and takes intimacy out again.
    fireEvent.click(screen.getByRole('button', { name: 'You' }))
    fireEvent.click(screen.getByRole('switch', { name: /Keep it mild \(no intimacy questions\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
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

describe('the evening, from 5 pm', () => {
  it('opens on its own at 5 pm with three new questions, and only three', async () => {
    answeredThisMorning()
    vi.setSystemTime(at(17))
    const fetchMock = stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday evening')).toBeInTheDocument()
    // Edwin, 2026-10-15: "questions seems more than 3". Each sitting is three.
    const dashes = within(screen.getByRole('navigation', { name: "Today's questions" })).getAllByRole('button')
    expect(dashes).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Question 1 of 3' })).toHaveAttribute('aria-current', 'step')
    // No check-in on the morning's answers, and no switch between parts of the day: the clock decides.
    expect(screen.queryByText('Did any dishes pile up today?')).not.toBeInTheDocument()
    expect(screen.queryByText('When do you wash the dishes?')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^(morning|afternoon|evening|check-in)/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await answer('I get out for a walk')
    next()
    await answer('Say something calmly')
    next()
    await answer('Text that I will call later')
    next()
    const day = await screen.findByRole('region', { name: "That's your day." })
    expect(within(day).getByRole('list', { name: "This evening's answers" }).children).toHaveLength(3)
    const tomorrow = within(day).getByRole('group', { name: 'Tomorrow' })
    expect(tomorrow).toHaveTextContent('Money')
    expect(tomorrow).toHaveTextContent('Friendship')
    expect(day).toHaveTextContent('Sleep well. Your next three open at 5 am.')
    expect(day).not.toHaveTextContent(crowdOrScore)
    expect(calls(fetchMock, '/api/votes')).toHaveLength(3)

    // This evening's cards are still one tap away on the dashes.
    fireEvent.click(screen.getByRole('button', { name: 'Question 1 of 3' }))
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toHaveTextContent('You chose')

    // Back on Today, the day's five windows show what is done.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    const dayLine = within(screen.getByRole('group', { name: 'Your day' })).getAllByRole('listitem').map(plainText)
    expect(dayLine).toHaveLength(5)
    expect(dayLine[0]).toBe('Morningdone')
    expect(dayLine[3]).toBe('Eveningdone')
    expect(dayLine[4]).toBe('Night21:00')
  })

  it('turns from the afternoon to the evening and to the night while the app stays open', async () => {
    answeredThisMorning()
    vi.setSystemTime(at(15))
    const fetchMock = stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Good afternoon.' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: "Today's questions" })).not.toBeInTheDocument()

    vi.setSystemTime(at(17))
    fireEvent(document, new Event('visibilitychange'))
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()

    vi.setSystemTime(at(0, 13))
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(calls(fetchMock, '/api/editions/2026-10-13')).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: 'Good night.' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'The night is yours' })).toHaveTextContent('Your morning three open at 05:00.')
  })

  it("keeps the morning's questions open until 5 pm, without a word of blame", async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 16, 45))
    stubApi({ today: { status: 200, body: sixADay } })
    const first = render(<App />)
    expect(await screen.findByText('Your morning three are still open until 17:00.')).toBeInTheDocument()
    expect(screen.queryByText('When do you wash the dishes?')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Your day' })).not.toHaveTextContent(/\b(missed|late|failed|behind)\b/i)
    fireEvent.click(screen.getByRole('button', { name: 'Answer them' }))
    expect(await screen.findByRole('region', { name: 'When do you wash the dishes?' })).toBeInTheDocument()
    first.unmount()

    vi.setSystemTime(at(19))
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(screen.queryByText('When do you wash the dishes?')).not.toBeInTheDocument()
  })

  it('rests at night: nothing to answer before 5 am, just what the morning holds', async () => {
    vi.setSystemTime(at(3))
    stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    const night = await screen.findByRole('group', { name: 'The night is yours' })
    expect(night).toHaveTextContent('Your morning three open at 05:00. Nothing to do until then but rest.')
    const rest = screen.getByRole('region', { name: 'The night is yours' })
    expect(within(rest).getByRole('group', { name: 'Your morning three · 5 am' })).toHaveTextContent('Daily habits')
    expect(screen.queryByRole('navigation', { name: "Today's questions" })).not.toBeInTheDocument()
    expect(screen.queryByText('When do you wash the dishes?')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Your day' })).getAllByRole('listitem').map(plainText)).toEqual([
      'Morning05:00',
      'Midday11:30',
      'Pulse14:30',
      'Evening17:00',
      'Night21:00',
    ])
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
    const fetchMock = stubApi({ today: { status: 200, body: sixADay } })
    render(<App />)
    await answer('I get out for a walk')
    next()
    await skip()
    await skip()

    const day = await screen.findByRole('region', { name: "That's your day." })
    expect(day).not.toHaveTextContent(crowdOrScore)
    const moves = within(day).getByRole('group', { name: 'Your small steps' })
    expect(moves).toHaveTextContent('set one alarm fewer')
    expect(moves).toHaveTextContent('How did it go?')
    // A move picked this evening has had no day yet; the mirror asks about it later.
    expect(moves).toHaveTextContent('Take ten minutes outside at lunch.')
    expect(moves).toHaveTextContent('Started this evening')
    expect(within(moves).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'It helped',
      'No change yet',
      'Not today',
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

    // The thought for tomorrow draws on the whole day, this morning included.
    const forTomorrow = within(day).getByRole('note', { name: 'For tomorrow' })
    expect(forTomorrow).toHaveTextContent('Getting things done')
    expect(within(day).getByRole('group', { name: 'Tomorrow' })).toHaveTextContent('Money')
    expect(day).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('never changes a sitting someone has started when the 18+ answer comes in', async () => {
    vi.setSystemTime(at(18))
    stubApi({ today: { status: 200, body: { ...sixADay, pool: [...sixADay.pool!, closeness] } } })
    render(<App />)
    await answer('I get out for a walk')
    const before = within(screen.getByRole('navigation', { name: "Today's questions" })).getAllByRole('button')
    expect(before).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: "Yes, I'm 18 or older" }))
    // Still the same card, answered, and still three.
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toHaveTextContent('You chose')
    expect(within(screen.getByRole('navigation', { name: "Today's questions" })).getAllByRole('button')).toHaveLength(3)
    expect(JSON.parse(localStorage.getItem('pi.pick.2026-10-12.pm')!)).toEqual(['q-lunch', 'q-queue', 'q-ring'])
  })

  it('ends the day quietly when an edition has no evening questions', async () => {
    vi.setSystemTime(at(19))
    stubApi({})
    render(<App />)
    expect(await screen.findByRole('group', { name: "That's today's questions" })).toHaveTextContent('Three good things open at 21:00.')
    expect(screen.queryByRole('navigation', { name: "Today's questions" })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: "This evening's answers" })).not.toBeInTheDocument()
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
    me: 12,
    partly: 2,
    notMe: 1,
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
      days: 9,
      weeks: 3,
      level: 'steady',
      score: 74,
      change: 4,
      history: [
        { week: 40, score: 65 },
        { week: 41, score: 70 },
        { week: 42, score: 74 },
      ],
      evidence: ['Right after eating', 'Before bed'],
      theme: 'habits',
      edition: 1,
    },
    {
      trait: 'attachment_anxiety',
      answers: 9,
      days: 5,
      weeks: 2,
      level: 'pattern',
      score: 68,
      change: 7,
      history: [
        { week: 40 },
        { week: 41, score: 61 },
        { week: 42, score: 68 },
      ],
      evidence: ['Check my phone again'],
      theme: 'friendship',
      edition: 2,
    },
    {
      trait: 'extraversion',
      answers: 4,
      days: 1,
      weeks: 1,
      level: 'hint',
      score: 52,
      history: [
        { week: 40 },
        { week: 41 },
        { week: 42, score: 52 },
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
    me: 0,
    partly: 0,
    notMe: 0,
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
  fireEvent.click(await screen.findByRole('button', { name: 'Insights' }))
  return fetchMock
}

// Both sides of the fixture's clearest leanings, in plain words, not a type label.
const weekTitle = 'This week, you were a steady noticer, and you may let rest wait too long.'

const mirrorCalls = (f: ReturnType<typeof stubApi>) => f.mock.calls.filter(([u]) => String(u).startsWith('/api/mirror?'))

describe('the weekly mirror', () => {
  it("is built from the server's data for this phone, sent with its device token", async () => {
    const fetchMock = await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    expect(await within(page).findByRole('heading', { level: 2, name: weekTitle })).toBeInTheDocument()

    const [url, init] = mirrorCalls(fetchMock)[0]
    expect(url).toBe('/api/mirror?date=2026-10-18')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Device v1.device1.sig')

    expect(page).toHaveTextContent('Sunday · week 42 · 12 to 17 October')
    // Both sides of the clearest leanings, in plain words, not a type label.
    expect(page).toHaveTextContent('Steady follow-through, with a radar tuned for silence.')
    expect(page).toHaveTextContent('You showed up on 5 days this week and gave 18 answers.')

    const tiles = within(page).getByRole('list', { name: 'This week in numbers' })
    expect(tiles).toHaveTextContent('Days active5 of 6Up from 4 last week')
    expect(tiles).toHaveTextContent('Answers18this week, 1 kept private')
    expect(tiles).toHaveTextContent("That's me12 of 15cards you judged, 2 partly")
    // Hard answers are not a score (the review of 2026-10-15).
    expect(tiles).not.toHaveTextContent('Went deepest')
    expect(tiles).toHaveTextContent('Small steps kept2 of 3')

    const line = within(page).getByRole('figure', { name: 'One line from this week' })
    expect(line).toHaveTextContent('“Right after eating”')
    expect(line).toHaveTextContent('The answer that said the most about you this week.')
  })

  it('shows every section that has real data, numbered in order', async () => {
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    await within(page).findByRole('heading', { level: 2, name: weekTitle })
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Where you leaned',
      '02 One line for your week',
      '03 Your week at a glance',
      '04 Your trait read',
      "05 How you've moved",
      '06 All of you',
      '07 Your small steps',
      '08 Next week',
      '09 The road ahead',
    ])

    expect(within(page).getByRole('listitem', { name: /^Monday:/ })).toHaveAccessibleName(
      'Monday: Daily habits, a light answer; Friendship, a deep answer; Intimacy, a private answer',
    )
    expect(within(page).getByRole('listitem', { name: /^Wednesday:/ })).toHaveAccessibleName('Wednesday: missed')
    expect(within(page).getByRole('listitem', { name: /^Sunday:/ })).toHaveAccessibleName('Sunday: review day')

    const traits = within(page).getByRole('list', { name: 'Trait read' })
    expect(traits).toHaveTextContent('Getting things done74 +4 vs last week')
    expect(traits).toHaveTextContent('Steady · 14 answers')
    expect(traits).toHaveTextContent('A pattern · 9 answers')
    expect(traits).toHaveTextContent('A hint · 4 answers')
    expect(page).toHaveTextContent('compares you only with yourself')

    const who = within(page).getByRole('heading', { name: '01 Where you leaned' }).parentElement!
    expect(who).toHaveTextContent('You finish what you start.')
    expect(who).toHaveTextContent('You said: “Right after eating”, “Before bed”')
    expect(who).toHaveTextContent('This keeps showing up: 14 answers over 3 weeks. Worth testing against your real week.')
    expect(who).toHaveTextContent('A pattern is forming: 9 answers over 5 days. Worth testing against your real week.')
    expect(who).toHaveTextContent(
      `The honest part: ${honestLine(TRAITS.conscientiousness.high, '2026-10-18', 'mirror').text}`,
    )
    expect(who).toHaveTextContent(
      `The honest part: ${honestLine(TRAITS.attachment_anxiety.high, '2026-10-18', 'mirror').text}`,
    )
    expect(who).not.toHaveTextContent('Energy from people') // 52 sits in the middle, and is only a hint

    expect(page).toHaveTextContent('4 steps started, 2 tried, 1 helped.')
    // Only a hint: answers on a few more days will tell.
    expect(within(page).getByText('Sharpen your read').parentElement).toHaveTextContent(
      "Energy from people is only a hint so far. Answers on a few more days will show whether it's a pattern.",
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

  it('shows the answers behind a reading, and offers a read on a leaning', async () => {
    const behind = [
      { date: '2026-10-16', theme: 'habits', question: 'When do you wash the dishes?', answer: 'Right after eating', leans: 'high' as const },
      { date: '2026-10-14', theme: 'rest', question: 'A free evening?', answer: 'Catch up on chores', leans: 'high' as const },
      { date: '2026-10-13', theme: 'home', question: 'The laundry pile?', answer: 'Leave it for Sunday', leans: 'low' as const },
    ]
    const traits = mirror.traits.map((t) => (t.trait === 'conscientiousness' ? { ...t, behind } : t))
    await openMirror({ mirror: { status: 200, body: { ...mirror, traits } } })
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    const why = await within(page).findByRole('button', { name: 'Why do you say that?' })
    expect(why).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    const list = document.getElementById(why.getAttribute('aria-controls')!)!
    expect(list).toHaveTextContent('Your read on getting things done comes from 14 answers over 3 weeks. Here are the newest 3.')
    expect(list).toHaveTextContent('16 October When do you wash the dishes? You said “Right after eating”. (points this way)')
    expect(list).toHaveTextContent('13 October The laundry pile? You said “Leave it for Sunday”. (points the other way)')
    fireEvent.click(within(page).getByRole('button', { name: 'Hide the answers' }))

    const read = READS.find((r) => r.kind === 'trait' && r.key === 'conscientiousness.high')!
    fireEvent.click(await within(page).findByRole('button', { name: `A read on this: ${read.title}` }))
    const article = screen.getByRole('article', { name: read.title })
    expect(article).toHaveTextContent('Getting things done ·')
    fireEvent.click(within(article).getByRole('button', { name: '← Back' }))
    expect(await screen.findByRole('region', { name: 'Your weekly mirror' })).toBeInTheDocument()
  })

  it('leaves a leaning marked "Not me" out of the title and the one line', async () => {
    localStorage.setItem('pi.leaning.conscientiousness.high', JSON.stringify({ verdict: 'not_me', date: '2026-10-18' }))
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    const heading = await within(page).findByRole('heading', { level: 2 })
    expect(heading).not.toHaveTextContent(weekTitle)
    expect(heading).not.toHaveTextContent('rest wait too long')
    const line = within(page).getByRole('figure', { name: 'One line from this week' })
    expect(line).toHaveTextContent('“Check my phone again”')
    expect(line).not.toHaveTextContent('Right after eating')
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
    expect(within(page).getByRole('list', { name: 'This week in numbers' })).toHaveTextContent(`That's me–Tap "That's me" on a card that fits`)
    expect(page).not.toHaveTextContent('%')
  })

  it('shows what was written in their own words that week, from this phone only, keeping intimacy answers private', async () => {
    const keep = (id: string, w: object) => localStorage.setItem(`pi.words.${id}`, JSON.stringify({ questionId: id, ...w }))
    keep('q-a', { date: '2026-10-13', prompt: 'Payday arrives. What goes first?', theme: 'money', words: 'Rent, then my mum.', closest: 'Bills' })
    keep('q-b', { date: '2026-10-14', prompt: 'How do you show a partner affection?', theme: 'intimacy', private: true, words: 'Only for me' })
    keep('q-c', { date: '2026-10-05', prompt: 'Last week', words: 'Old words' })
    const fetchMock = await openMirror()
    const section = await screen.findByRole('region', { name: /In your own words/ })
    expect(section).toHaveTextContent('“Rent, then my mum.”')
    expect(section).toHaveTextContent('Closest to: Bills')
    expect(section).toHaveTextContent('A private answer, in your own words.')
    expect(section).not.toHaveTextContent('Only for me')
    expect(section).not.toHaveTextContent('Old words')
    expect(section).toHaveTextContent('These words were never sent anywhere.')
    for (const [u] of fetchMock.mock.calls) expect(String(u)).not.toContain('Rent')
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

  it('sends the person to What I keep to see and delete what is kept', async () => {
    await openMirror()
    const note = await screen.findByRole('note', { name: 'What leaves my phone' })
    expect(note).toHaveTextContent('never what you chose')
    fireEvent.click(screen.getByRole('button', { name: 'What I keep, and how to delete it' }))
    expect(await screen.findByRole('heading', { name: 'What I keep' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← Back' }))
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('gets a new token and asks again when the server no longer accepts the old one', async () => {
    localStorage.setItem('pi.device.v1', 'v1.stale.sig')
    const fetchMock = await openMirror({
      mirror: [
        { status: 401, body: { error: 'invalid_device' } },
        { status: 200, body: mirror },
      ],
    })
    expect(await screen.findByRole('heading', { level: 2, name: weekTitle })).toBeInTheDocument()
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
    expect(await screen.findByRole('heading', { level: 2, name: weekTitle })).toBeInTheDocument()
    expect(mirrorCalls(fetchMock)).toHaveLength(2)
  })

  it('offers support contacts, calmly, when heavy answers repeat in a week', async () => {
    await openMirror({ mirror: { status: 200, body: { ...mirror, lowMood: true } } })
    const note = await screen.findByRole('note', { name: 'Support' })
    expect(within(note).getByRole('link', { name: /Find a helpline/ })).toHaveAttribute('href', 'https://findahelpline.com')
  })
})

// October so far, as GET /api/mirror/month returns it on Sunday 18 October.
const month: PeriodMirror = {
  period: 'month',
  label: '2026-10',
  date: '2026-10-18',
  from: '2026-09-28',
  to: '2026-11-01',
  weeksTotal: 5,
  weeks: [
    { monday: '2026-09-28', week: 40, kept: true, daysActive: 3, daysSoFar: 6, answers: 9, deepest: 2, stepsTried: 1 },
    { monday: '2026-10-05', week: 41, kept: true, daysActive: 0, daysSoFar: 6, answers: 0, deepest: 0, stepsTried: 0 },
    { monday: '2026-10-12', week: 42, kept: true, daysActive: 5, daysSoFar: 6, answers: 18, deepest: 5, stepsTried: 2 },
  ],
  stats: {
    weeksActive: 2,
    weeksSoFar: 3,
    daysActive: 8,
    daysSoFar: 18,
    answers: 27,
    private: 1,
    deepest: 7,
    me: 15,
    partly: 3,
    notMe: 2,
    rated: 20,
    stepsStarted: 4,
    stepsTried: 3,
    stepsHelped: 2,
  },
  previous: {
    weeksActive: 3,
    weeksSoFar: 4,
    daysActive: 6,
    daysSoFar: 24,
    answers: 20,
    private: 0,
    deepest: 3,
    me: 9,
    partly: 2,
    notMe: 1,
    rated: 12,
    stepsStarted: 1,
    stepsTried: 1,
    stepsHelped: 0,
  },
  previousLabel: '2026-09',
  traits: [
    {
      trait: 'conscientiousness',
      answers: 16,
      days: 8,
      weeks: 3,
      level: 'steady',
      score: 72,
      change: 9,
      weekly: [
        { week: 40, score: 65 },
        { week: 41 },
        { week: 42, score: 74 },
      ],
    },
    {
      trait: 'rumination',
      answers: 5,
      days: 3,
      weeks: 1,
      level: 'pattern',
      score: 70,
      weekly: [
        { week: 40 },
        { week: 41 },
        { week: 42, score: 70 },
      ],
    },
  ],
  themes: mirror.themes,
  moments: [
    {
      prompt: 'Someone cuts in front of you in a queue. You…',
      label: 'Boil inside for an hour',
      headline: 'A slight like this can run in your head for hours.',
      theme: 'anger',
      lean: 1,
      depth: 4,
      date: '2026-10-15',
      edition: 4,
    },
    {
      prompt: 'Dishes after dinner?',
      label: 'Right after eating',
      headline: 'You like a clean slate before you rest.',
      theme: 'habits',
      lean: 1,
      depth: 3,
      date: '2026-10-12',
      edition: 1,
    },
  ],
  helped: [{ theme: 'friendship', step: 'This week, call one friend instead of texting.', started: '2026-10-13' }],
}

// A quiet year: weeks 1 to 39 came before the mirror kept notes of weeks.
const year: PeriodMirror = {
  ...month,
  period: 'year',
  label: '2026',
  from: '2025-12-29',
  to: '2027-01-03',
  weeksTotal: 53,
  weeks: Array.from({ length: 42 }, (_, i) => ({
    monday: new Date(Date.UTC(2025, 11, 29 + 7 * i)).toISOString().slice(0, 10),
    week: i + 1,
    kept: i >= 39,
    daysActive: 0,
    daysSoFar: 6,
    answers: 0,
    deepest: 0,
    stepsTried: 0,
  })),
  stats: { ...month.previous!, weeksActive: 0, weeksSoFar: 3, daysActive: 0, daysSoFar: 18, answers: 0, deepest: 0, stepsStarted: 0, stepsTried: 0 },
  previous: undefined,
  previousLabel: undefined,
  traits: [],
  themes: [],
  moments: [],
  helped: [],
}

const monthTitle = 'This month, you were a steady thinker, and you may let rest wait too long.'

const periodCalls = (f: ReturnType<typeof stubApi>) => f.mock.calls.filter(([u]) => /^\/api\/mirror\/\w+\?/.test(String(u)))

describe('the monthly, quarterly and yearly mirrors', () => {
  it("adds up this phone's weeks of the month, set only against its own past", async () => {
    const fetchMock = await openMirror({ period: { status: 200, body: month } })
    await within(screen.getByRole('region', { name: 'Your weekly mirror' })).findByRole('heading', { level: 2, name: weekTitle })
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    const page = screen.getByRole('region', { name: 'Your monthly mirror' })
    expect(await within(page).findByRole('heading', { level: 2, name: monthTitle })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false')

    const [url, init] = periodCalls(fetchMock)[0]
    expect(url).toBe('/api/mirror/month?date=2026-10-18')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Device v1.device1.sig')

    expect(page).toHaveTextContent('Your monthly mirror · October 2026 · Week 3 of 5')
    expect(page).toHaveTextContent('Steady follow-through, with a habit of going over hard moments.')
    expect(page).toHaveTextContent(
      "So far this month you've shown up on 8 days in 2 weeks and given 27 answers. What stood out most: you finish what you start.",
    )
    const tiles = within(page).getByRole('list', { name: 'This month in numbers' })
    expect(tiles).toHaveTextContent('Days active8 of 186 of 24 in September')
    expect(tiles).toHaveTextContent('Weeks you came back2 of 33 of 4 in September')
    expect(tiles).toHaveTextContent('Answers271 kept private')
    expect(tiles).toHaveTextContent('Small steps kept3 of 42 helped')

    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Week by week',
      '02 Your trait read',
      "03 How you've moved",
      '04 The answers that said the most',
      '05 Who you were this month',
      '06 All of you',
      '07 Your small steps',
    ])
    expect(within(page).getByRole('listitem', { name: /^Week 41:/ })).toHaveAccessibleName('Week 41: 0 of 6 days, 0 answers')
    expect(page).toHaveTextContent('You came back in 2 of 3 weeks.')
    expect(page).toHaveTextContent('2 weeks still to come.')
    expect(within(page).getByRole('list', { name: 'Trait read' })).toHaveTextContent(
      'Getting things done72 +9 since your first weeksSteady · 16 answersReplaying70A pattern · 5 answers',
    )

    const moments = within(page).getByRole('list', { name: 'The answers that said the most' })
    expect(moments).toHaveTextContent(
      'Someone cuts in front of you in a queue. You…“Boil inside for an hour”A slight like this can run in your head for hours.',
    )
    expect(moments).toHaveTextContent('Anger · 15 October · Edition #4')
    expect(within(page).getByRole('list', { name: 'Steps that helped' })).toHaveTextContent(
      'This week, call one friend instead of texting.',
    )
    const who = within(page).getByRole('heading', { name: '05 Who you were this month' }).parentElement!
    expect(who).toHaveTextContent(`The honest part: ${honestLine(TRAITS.rumination.high, '2026-10-18', 'mirror').text}`)
    expect(who).toHaveTextContent('A pattern is forming: 5 answers over 3 days. Worth testing against your real month.')
    expect(page).toHaveTextContent('4 steps started, 3 tried, 2 helped.')
    expect(page).toHaveTextContent('A month is long enough to see a pattern, and short enough to change one.')

    expect(within(page).getByRole('note', { name: 'What leaves my phone' })).toHaveTextContent('for 13 months')
    expect(page).toHaveTextContent('For self-reflection, not a diagnosis.')
    expect(page).not.toHaveTextContent(crowdOrScore)
    expect(within(page).queryAllByRole('link')).toEqual([])
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('marks weeks with nothing on record, and keeps a quiet year quiet', async () => {
    await openMirror({ period: { status: 200, body: year } })
    fireEvent.click(await screen.findByRole('button', { name: 'Year' }))
    const page = screen.getByRole('region', { name: 'Your yearly mirror' })
    expect(await within(page).findByText('This year is just getting started.')).toBeInTheDocument()
    expect(page).toHaveTextContent('Your yearly mirror · 2026 · Week 42 of 53')
    expect(page).toHaveTextContent('Nothing answered this year yet.')
    expect(within(page).getByRole('listitem', { name: /^Week 1:/ })).toHaveAccessibleName('Week 1: nothing on record')
    expect(within(page).getByRole('listitem', { name: /^Week 40:/ })).toHaveAccessibleName('Week 40: 0 of 6 days, 0 answers')
    expect(page).toHaveTextContent('Each bar is a week, from week 1 to week 42. A full bar is all six question days. 11 weeks still to come.')
    expect(page).toHaveTextContent('No answers yet this year.')
    expect(within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      '01 Week by week',
      '02 Your trait read',
    ])
    expect(within(page).getByRole('list', { name: 'This year in numbers' })).toHaveTextContent('Days active0 of 18question days on record')
  })

  it('goes back to the week, and offers a retry when a period fails to load', async () => {
    const fetchMock = await openMirror({
      period: [
        { status: 503, body: { error: 'unavailable' } },
        { status: 200, body: month },
      ],
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Quarter' }))
    expect(await screen.findByText("I couldn't load your mirror just now.")).toBeInTheDocument()
    expect(periodCalls(fetchMock)[0][0]).toBe('/api/mirror/quarter?date=2026-10-18')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 2, name: monthTitle })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    const week = screen.getByRole('region', { name: 'Your weekly mirror' })
    expect(await within(week).findByRole('heading', { level: 2, name: weekTitle })).toBeInTheDocument()
    expect(mirrorCalls(fetchMock)).toHaveLength(2)
  })
})

// The week (2026-10-15): three in the morning, three more from 5 pm, Monday
// to Saturday; Sunday is for the mirror.
describe('the week', () => {
  async function morningThree() {
    await answer('Right after eating')
    next()
    await skip()
    await answer('One')
    next()
  }

  it('opens three more questions at 5 pm, not before', async () => {
    stubApi({ today: { status: 200, body: sixADay } })
    const first = render(<App />)
    await morningThree()
    const morning = await screen.findByRole('region', { name: 'Morning done.' })
    expect(within(morning).getByRole('group', { name: 'Your evening three · 5 pm' })).toBeInTheDocument()
    expect(screen.getByText('Edition #3 · Monday')).toBeInTheDocument()
    expect(screen.queryByText('Lunch time. What usually happens?')).not.toBeInTheDocument()
    first.unmount()

    vi.setSystemTime(new Date(2026, 9, 12, 16, 59))
    const second = render(<App />)
    expect(await screen.findByRole('heading', { name: 'Good afternoon.' })).toBeInTheDocument()
    expect(screen.queryByText('Lunch time. What usually happens?')).not.toBeInTheDocument()
    second.unmount()

    vi.setSystemTime(at(17))
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Lunch time. What usually happens?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Question 1 of 3' })).toHaveAttribute('aria-current', 'step')
    expect(screen.queryByRole('button', { name: 'Question 4 of 6' })).not.toBeInTheDocument()
  })

  it('opens on the mirror on Sunday, with no questions to answer', async () => {
    vi.setSystemTime(at(9, 18))
    stubApi({ edition: { status: 200, body: sunday }, mirror: { status: 200, body: mirror } })
    render(<App />)
    expect(await screen.findByRole('heading', { level: 2, name: weekTitle })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    const review = screen.getByRole('region', { name: 'Sunday is for looking back.' })
    expect(review).toHaveTextContent('Fresh questions arrive tomorrow at 5 am.')
    const tomorrow = within(review).getByRole('group', { name: 'Tomorrow' })
    expect(tomorrow).toHaveTextContent('Money')
    expect(tomorrow).toHaveTextContent('Anger')
    expect(review).not.toHaveTextContent(crowdOrScore)
    expect(screen.queryByRole('navigation', { name: "Today's questions" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open: Your Sunday Mirror is ready' }))
    expect(screen.getByRole('button', { name: 'Insights' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('looks ahead to the review day on Saturday evening', async () => {
    vi.setSystemTime(at(19, 17))
    stubApi({ today: { status: 200, body: { ...sixADay, date: '2026-10-17', tomorrowThemes: [] } } })
    render(<App />)
    await skip()
    await skip()
    await skip()
    const done = await screen.findByRole('region', { name: "That's your day." })
    expect(done).toHaveTextContent('Tomorrow is Sunday: no new questions, just your week in the mirror.')
    expect(done).toHaveTextContent('Sleep well. Tomorrow is for looking back')
  })
})

// Review of 2026-10-15, part 1: keep the privacy promise, and fix the ways a
// vote could get stuck.
describe('what the server learns from a vote', () => {
  const intimacyFan = () =>
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

  it('never sends which option was chosen for an intimacy question', async () => {
    intimacyFan()
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ adult: true, mild: false }))
    const fetchMock = stubApi({})
    render(<App />)
    await screen.findByText(closeness.prompt)
    await answer('I wait for them first')
    await waitFor(() => expect(calls(fetchMock, '/api/votes')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/votes')[0])).toMatchObject({ questionId: 'q-close', optionId: '~private' })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('"wait"')
    expect(localStorage.getItem('pi.choice.q-close')).toBe('wait') // the phone knows; the server never does
  })

  it('sends the sitting with each vote, and nothing about the moment', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await answer('Right after eating')
    expect(bodyOf(calls(fetchMock, '/api/votes')[0])).toEqual({
      questionId: 'q-dishes',
      optionId: 'right-away',
      voterId: 'v1.device1.sig',
      sitting: 'morning',
    })
  })
})

describe('a vote never gets stuck', () => {
  const keyOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>)['Idempotency-Key']

  it('takes a new key for a different answer after a failure, and keeps the first answer when it had landed', async () => {
    const fetchMock = stubApi({
      vote: [
        { status: 503, body: { error: 'unavailable' } },
        { status: 409, body: { error: 'duplicate_vote' } },
      ],
    })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('did not go through')
    fireEvent.click(screen.getByRole('button', { name: 'At the end of the day' }))
    expect(await screen.findByText("Your first answer had already reached me, so that's the one I kept.")).toBeInTheDocument()
    const [first, second] = calls(fetchMock, '/api/votes')
    expect(keyOf(first)).not.toBe(keyOf(second))
    expect(screen.getByText('Right after eating')).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'What your answer may say' })).toHaveTextContent('You like a clear sink')
    expect(localStorage.getItem('pi.choice.q-dishes')).toBe('right-away')
  })

  it('sends once more with a fresh key when the server says the key belongs to another answer', async () => {
    localStorage.setItem('pi.pending.q-dishes', 'a-key-from-an-older-version')
    const fetchMock = stubApi({ vote: [{ status: 422, body: { error: 'idempotency_key_reused' } }, { status: 202, body: { status: 'accepted', eventId: 'e' } }] })
    render(<App />)
    await answer('Right after eating')
    const keys = calls(fetchMock, '/api/votes').map(keyOf)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    expect(keys).not.toContain('a-key-from-an-older-version')
    expect(screen.getByRole('note', { name: 'What your answer may say' })).toBeInTheDocument()
  })

  it('gets a new pass and sends again when another tab deleted everything', async () => {
    localStorage.setItem('pi.device.v1', 'v2.gone.pass')
    const fetchMock = stubApi({ vote: [{ status: 410, body: { error: 'device_forgotten' } }, { status: 202, body: { status: 'accepted', eventId: 'e' } }] })
    render(<App />)
    await answer('Right after eating')
    expect(calls(fetchMock, '/api/votes').map((c) => bodyOf(c).voterId)).toEqual(['v2.gone.pass', 'v1.device1.sig'])
  })

  it('follows another tab that answers the same question, and never overwrites what it knows', async () => {
    stubApi({ vote: { status: 409, body: { error: 'duplicate_vote' } } })
    render(<App />)
    await screen.findByRole('button', { name: 'Right after eating' })
    localStorage.setItem('pi.choice.q-dishes', 'end-of-day')
    window.dispatchEvent(new StorageEvent('storage', { key: 'pi.choice.q-dishes' }))
    expect(await screen.findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('Batching chores')
    expect(screen.queryByRole('button', { name: 'Right after eating' })).not.toBeInTheDocument()
    expect(localStorage.getItem('pi.choice.q-dishes')).toBe('end-of-day')
  })

  it('keeps a half-written answer in your own words when the app closes', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /In my own words/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'In your own words' }), { target: { value: 'Honestly, it depends' } })
    unmount()
    render(<App />)
    expect(await screen.findByRole('textbox', { name: 'In your own words' })).toHaveValue('Honestly, it depends')
    fireEvent.click(screen.getByRole('button', { name: 'Keep my words' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Right after eating' }))
    await screen.findByRole('button', { name: /^Next/ })
    expect(localStorage.getItem('pi.draft.q-dishes')).toBeNull()
  })

  it('opens without a connection on the day the phone already holds', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    await screen.findByText('When do you wash the dishes?')
    unmount()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    render(<App />)
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent("You're offline")
  })
})

describe('what I keep', () => {
  const openKept = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'What I keep' }))
    return screen.findByRole('region', { name: 'What I keep' })
  }

  it('shows what is kept on this phone and on the server, and for how long', async () => {
    localStorage.setItem('pi.device.v1', 'v2.mine.pass')
    localStorage.setItem('pi.words.q-x', JSON.stringify({ questionId: 'q-x', date: '2026-10-10', prompt: 'P', words: 'Mine' }))
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [{ date: '2026-10-11', questionId: 'a', theme: 'habits', depth: 2, traits: {} }], skips: [] }))
    const fetchMock = stubApi({})
    render(<App />)
    const page = await openKept()
    const phone = within(page).getByRole('group', { name: 'On this phone' })
    expect(phone).toHaveTextContent('1 answer in your own words. Never sent. Kept 5 weeks')
    expect(phone).toHaveTextContent('1 answer in your history.')
    const server = within(page).getByRole('group', { name: 'On the server' })
    expect(await within(server).findByText(/12 answers/)).toBeInTheDocument()
    expect(server).toHaveTextContent('12 answers, 2 of them private, under an anonymous key')
    expect(server).toHaveTextContent('Kept 5 weeks.')
    expect(server).toHaveTextContent('1 weekly note')
    expect(server).toHaveTextContent('Kept 13 months.')
    expect(server).toHaveTextContent('12 votes')
    expect(server).toHaveTextContent('Kept 1 week, to the hour they came in.')
    const get = calls(fetchMock, '/api/device/data')[0]
    expect((get[1]!.headers as Record<string, string>).Authorization).toBe('Device v2.mine.pass')
    expect(page).not.toHaveTextContent(crowdOrScore)
  })

  it('asks the server nothing for a phone that has never answered', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    const page = await openKept()
    expect(within(page).getByRole('group', { name: 'On the server' })).toHaveTextContent('Nothing. This phone has no answers on the server.')
    expect(calls(fetchMock, '/api/device/data')).toHaveLength(0)
    expect(calls(fetchMock, '/api/device')).toHaveLength(0)
  })

  it('deletes everywhere: the server first, then this phone and its pass, and says how much went', async () => {
    localStorage.setItem('pi.device.v1', 'v2.mine.pass')
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [], skips: [] }))
    localStorage.setItem('pi.words.q-x', JSON.stringify({ questionId: 'q-x', date: '2026-10-10', prompt: 'P', words: 'Mine' }))
    localStorage.setItem('pi.choice.2026-10-12-call', 'text')
    localStorage.setItem('pi.choice.2026-10-01-old', 'text')
    const fetchMock = stubApi({})
    render(<App />)
    const page = await openKept()
    fireEvent.click(within(page).getByRole('button', { name: 'Delete everywhere' }))
    fireEvent.click(within(page).getByRole('button', { name: 'Yes, delete it all' }))
    expect(await within(page).findByText(/Everything is deleted, here and on the server/)).toHaveTextContent(
      '12 answers, 2 small steps, 1 weekly note and 12 votes',
    )
    const dels = fetchMock.mock.calls.filter(([u, init]) => u === '/api/device/data' && init?.method === 'DELETE')
    expect(dels).toHaveLength(1)
    expect((dels[0][1]!.headers as Record<string, string>).Authorization).toBe('Device v2.mine.pass')
    expect(localStorage.getItem('pi.device.v1')).toBeNull()
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
    expect(localStorage.getItem('pi.words.q-x')).toBeNull()
    expect(localStorage.getItem('pi.choice.2026-10-12-call')).toBe('x') // closed today, nothing kept of the answer
    expect(localStorage.getItem('pi.choice.2026-10-01-old')).toBeNull()
  })

  it('keeps everything when the server could not delete it', async () => {
    localStorage.setItem('pi.device.v1', 'v2.mine.pass')
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [], skips: [] }))
    stubApi({ forget: { status: 503, body: { error: 'unavailable' } } })
    render(<App />)
    const page = await openKept()
    fireEvent.click(within(page).getByRole('button', { name: 'Delete everywhere' }))
    fireEvent.click(within(page).getByRole('button', { name: 'Yes, delete it all' }))
    expect(await within(page).findByRole('alert')).toHaveTextContent("I couldn't reach the server, so nothing was deleted.")
    expect(localStorage.getItem('pi.history.v1')).not.toBeNull()
    expect(localStorage.getItem('pi.device.v1')).toBe('v2.mine.pass')
  })

  it('deletes from this phone only, keeping the pass and what the server keeps', async () => {
    localStorage.setItem('pi.device.v1', 'v2.mine.pass')
    localStorage.setItem('pi.history.v1', JSON.stringify({ answers: [], skips: [] }))
    localStorage.setItem('pi.moves.v1', JSON.stringify([{ date: '2026-10-12', questionId: 'q', optionId: 'o', step: 'S', status: 'started' }]))
    const fetchMock = stubApi({})
    render(<App />)
    const page = await openKept()
    fireEvent.click(within(page).getByRole('button', { name: 'Delete from this phone' }))
    fireEvent.click(within(page).getByRole('button', { name: 'Yes, clear this phone' }))
    expect(within(page).getByRole('status')).toHaveTextContent('Deleted from this phone.')
    expect(localStorage.getItem('pi.history.v1')).toBeNull()
    expect(localStorage.getItem('pi.moves.v1')).toBeNull()
    expect(localStorage.getItem('pi.device.v1')).toBe('v2.mine.pass')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    expect(within(page).getByRole('group', { name: 'On this phone' })).toHaveTextContent('0 small steps')
  })
})

describe("today's read", () => {
  it('offers a read on one of the day’s life areas, opens it, and remembers it was read', async () => {
    stubApi({})
    render(<App />)
    // The morning opens on its questions; the read waits on Today.
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    const eyebrow = await screen.findByText(/^Today's read · \d+ min$/)
    const offer = eyebrow.closest('section')!
    const title = within(offer).getByRole('heading', { level: 3 }).textContent!
    const read = READS.find((r) => r.title === title)!
    expect(read.kind === 'theme' && ['habits', 'money'].includes(read.key)).toBe(true)
    fireEvent.click(within(offer).getByRole('button', { name: 'Read it' }))

    const page = screen.getByRole('article', { name: title })
    expect(within(page).getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    expect(page).toHaveTextContent(read.paragraphs[0])
    expect(within(page).getByRole('complementary', { name: 'Something to try' })).toHaveTextContent(read.try)
    expect(page).toHaveTextContent('For self-reflection, not a diagnosis.')
    for (const src of read.sources) expect(page).not.toHaveTextContent(src.title)
    expect(localStorage.getItem(`pi.read.${read.slug}`)).toBe('2026-10-12')

    fireEvent.click(within(page).getByRole('button', { name: '← Back' }))
    const again = (await screen.findByText(/^Today's read/)).closest('section')!
    expect(within(again).getByRole('heading', { level: 3 })).toHaveTextContent(title)
    expect(within(again).getByRole('button', { name: 'Read it again' })).toBeInTheDocument()
  })
})

describe('accessibility', () => {
  it('has one page title, and moves focus to the title of each view it opens', async () => {
    stubApi({})
    render(<App />)
    await screen.findByRole('button', { name: 'Settings' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Persona Index')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Settings' })))
    fireEvent.click(screen.getByRole('button', { name: '← Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reflect' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Notebook' })))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

// The proposal of 2026-10-24, "The app remembers you": change set against
// your own past, your words brought back, one thing you're working on, and
// heavy answers that point to people instead of an insight.
const quietPhone: Question = {
  id: 'q-quiet',
  theme: 'sadness-stress',
  care: 'personal',
  prompt: 'Your phone has been quiet all week. What goes through your head?',
  options: [
    {
      id: 'busy',
      label: 'Everyone is busy',
      depth: 1,
      insight: { reveal: 'You give people room. A quiet phone reads as a busy week.', step: 'Send one hello today.' },
    },
    {
      id: 'forgotten',
      label: 'I wonder if people have forgotten me',
      depth: 4,
      heavy: true,
      traits: { neuroticism: 1 },
      insight: { reveal: 'A quiet phone can feel like a verdict on you.', step: 'Message one person today.' },
    },
  ],
}
const withQuiet: DailySet = { ...today, questions: [quietPhone, today.questions[0], today.questions[2]], pool: [] }

const pastAnswers = (dates: string[], traits: Record<string, number>) =>
  JSON.stringify({
    answers: dates.map((date, i) => ({ date, questionId: `x${i}`, theme: 'money', depth: 2, traits })),
    skips: [],
  })

const seedPlan = (made: string, checks: { date: string; status: 'did' | 'not_yet' }[] = []) =>
  localStorage.setItem(
    'pi.nb.plan.p1',
    JSON.stringify({
      kind: 'plan',
      at: 1,
      id: 'p1',
      made,
      madeAt: Date.parse(`${made}T08:00:00`),
      trait: 'conscientiousness',
      high: true,
      when: 'I sit down for the evening',
      will: 'leave one job for tomorrow',
      checks,
    }),
  )

describe('the app remembers you', () => {
  it('notices on the card when an answer leans a way yours have not for weeks, and ties it to what you are working on', async () => {
    localStorage.setItem('pi.history.v1', pastAnswers(['2026-09-21', '2026-09-28', '2026-10-05'], { conscientiousness: -1 }))
    seedPlan('2026-10-01')
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    const card = screen.getByRole('note', { name: 'What your answer may say' })
    expect(card).toHaveTextContent('First time in three weeks your answer leaned towards getting things done.')
    expect(card).toHaveTextContent(
      "This touches what you're working on: “When I sit down for the evening, I will leave one job for tomorrow.”",
    )
    expect(card).not.toHaveTextContent(crowdOrScore)
  })

  it('meets a heavy answer with kind words, your people and a helpline, never an insight', async () => {
    const fetchMock = stubApi({ today: { status: 200, body: withQuiet } })
    render(<App />)
    await answer('I wonder if people have forgotten me')
    const card = screen.getByRole('region', { name: quietPhone.prompt })
    const heavy = within(card).getByRole('note', { name: 'That sounds really hard' })
    expect(heavy).toHaveTextContent('That sounds really hard.')
    expect(heavy).toHaveTextContent("Thank you for being honest. I won't try to read anything into this one.")
    // No reading, no step, no keeping and no rating on this card.
    expect(card).not.toHaveTextContent('A quiet phone can feel like a verdict')
    expect(within(card).queryByRole('note', { name: 'What your answer may say' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Keep this/ })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: "I'll try it" })).not.toBeInTheDocument()
    expect(within(card).queryByText('Does this sound like you?')).not.toBeInTheDocument()
    expect(within(heavy).getByRole('link', { name: 'Find a helpline' })).toHaveAttribute('href', 'https://findahelpline.com')
    expect(within(heavy).getByRole('link', { name: 'Talk to someone now' })).toHaveAttribute('href', 'https://findahelpline.com')
    expect(heavy).toHaveTextContent('If you ever have thoughts of not wanting to be here, a helpline can talk with you now.')

    // With no people kept yet, it offers to keep them, on this phone only.
    expect(heavy).toHaveTextContent('Is there someone you could tell, even in a short message?')
    fireEvent.click(within(heavy).getByRole('button', { name: 'Add your people' }))
    fireEvent.change(within(heavy).getByRole('textbox', { name: 'Person 1' }), { target: { value: 'Ama' } })
    fireEvent.change(within(heavy).getByRole('textbox', { name: 'Person 2' }), { target: { value: 'Kofi' } })
    fireEvent.change(within(heavy).getByRole('textbox', { name: 'What helps when things are heavy' }), {
      target: { value: 'A walk by the river' },
    })
    fireEvent.click(within(heavy).getByRole('button', { name: 'Keep them' }))
    expect(heavy).toHaveTextContent('Could Ama or Kofi hear from you today? A short message counts.')
    expect(heavy).toHaveTextContent('What helps, in your words: “A walk by the river”')
    expect(JSON.parse(localStorage.getItem('pi.people')!)).toMatchObject({ names: ['Ama', 'Kofi'], helps: 'A walk by the river' })

    // A message to one of them, handed to WhatsApp or the phone's messages:
    // the app sends nothing itself.
    const reach = within(heavy).getByRole('group', { name: 'Reach out' })
    fireEvent.click(within(reach).getByRole('button', { name: 'Kofi' }))
    expect(within(reach).getByRole('textbox')).toHaveValue('Hey Kofi, had a heavy day. Free for a 5-minute call later?')
    expect(within(reach).getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', `https://wa.me/?text=${encodeURIComponent('Hey Kofi, had a heavy day. Free for a 5-minute call later?')}`)
    expect(within(reach).getByRole('link', { name: 'SMS' }).getAttribute('href')).toMatch(/^sms:\?&body=Hey%20Kofi/)
    expect(reach).toHaveTextContent('The app never sends anything for you and never sees the conversation.')
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toMatch(/Ama|Kofi|river/)
    expect(document.body.textContent).not.toMatch(noClinicianWords)
  })

  it('after a heavy answer, closes the sitting with kind words: no honest part and no plan', async () => {
    localStorage.setItem('pi.history.v1', pastAnswers(['2026-10-09', '2026-10-10'], { conscientiousness: 1 }))
    stubApi({ today: { status: 200, body: withQuiet } })
    render(<App />)
    await answer('I wonder if people have forgotten me')
    next()
    await answer('Right after eating')
    next()
    await skip()
    const done = await screen.findByRole('region', { name: "That's your day." })
    const thread = within(done).getByRole('note', { name: "Today's thread" })
    expect(thread).toHaveTextContent('Getting things done has come up in 3 answers over 3 days, so a pattern is forming.')
    expect(thread).not.toHaveTextContent('The honest part')
    expect(within(done).queryByRole('button', { name: /work on this/i })).not.toBeInTheDocument()
    expect(within(done).getByRole('note', { name: 'Support' })).toHaveTextContent('talking to someone you trust')
  })

  // Edwin, 2026-10-24: "some deep answers are typed instead of selected but character controlled".
  it('opens one card a sitting with a one-line box, in the theme you go deepest on, then asks which option is closest', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [{ date: '2026-10-10', questionId: 'x', theme: 'habits', depth: 4, traits: {} }], skips: [] }),
    )
    const fetchMock = stubApi({ today: { status: 200, body: { ...today, pool: [] } } })
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    const box = within(card).getByRole('textbox', { name: 'Say it in one line' })
    expect(box).toHaveAttribute('maxLength', '120')
    expect(card).toHaveTextContent('120 left')
    expect(within(card).queryByRole('button', { name: 'Right after eating' })).not.toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'As soon as I finish, or it nags me all night.' } })
    expect(card).toHaveTextContent('75 left')
    fireEvent.click(within(card).getByRole('button', { name: 'Keep my words' }))
    const closest = within(card).getByRole('group', { name: 'Which of these comes closest? Your insight comes from that one.' })
    fireEvent.click(within(closest).getByRole('button', { name: 'Right after eating' }))
    expect(await within(card).findByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
    expect(card).toHaveTextContent('“As soon as I finish, or it nags me all night.”')
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toContain('nags me')

    // Only one a sitting: the next card opens on its options.
    next()
    expect(await screen.findByRole('button', { name: 'Split it evenly' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('lets a write-first card be tapped instead', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [{ date: '2026-10-10', questionId: 'x', theme: 'habits', depth: 4, traits: {} }], skips: [] }),
    )
    stubApi({ today: { status: 200, body: { ...today, pool: [] } } })
    render(<App />)
    const card = await screen.findByRole('region', { name: 'When do you wash the dishes?' })
    fireEvent.click(within(card).getByRole('button', { name: 'Just tap instead' }))
    await answer('Right after eating')
    expect(within(card).getByRole('note', { name: 'What your answer may say' })).toHaveTextContent('clear sink')
  })

  it('keeps your people in Settings, on this phone only', async () => {
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const people = screen.getByRole('form', { name: 'Your people' })
    fireEvent.change(within(people).getByRole('textbox', { name: 'Person 1' }), { target: { value: 'Esi' } })
    fireEvent.click(within(people).getByRole('button', { name: 'Keep them' }))
    expect(within(people).getByRole('status')).toHaveTextContent('Kept.')
    expect(JSON.parse(localStorage.getItem('pi.people')!)).toMatchObject({ names: ['Esi'] })
  })

  it('on Sunday brings back a line you wrote, asks if it is still true, and keeps what is different now', async () => {
    localStorage.setItem(
      'pi.nb.sentence.2026-09-07',
      JSON.stringify({ kind: 'sentence', at: 1, week: '2026-09-07', text: 'This week I learned that I say yes too fast.' }),
    )
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    const back = await within(page).findByRole('group', { name: 'From your notebook' })
    expect(within(page).getByRole('heading', { name: /Still true\?$/ })).toBeInTheDocument()
    expect(back).toHaveTextContent('The week of 7 September, you wrote:')
    expect(back).toHaveTextContent('“This week I learned that I say yes too fast.”')
    expect(back).toHaveTextContent('Is that still true?')
    fireEvent.click(within(back).getByRole('button', { name: "It's changing" }))
    expect(back).toHaveTextContent("Change is the point; I'll watch which way it goes.")
    fireEvent.change(within(back).getByRole('textbox', { name: /What's different now\?/ }), {
      target: { value: 'I ask for a day to think.' },
    })
    fireEvent.click(within(back).getByRole('button', { name: 'Keep my line' }))
    expect(back).toHaveTextContent('Kept beside the original in your notebook.')
    expect(JSON.parse(localStorage.getItem('pi.nb.sentence.2026-09-07')!).revisits).toEqual([
      { date: '2026-10-18', verdict: 'changing', note: 'I ask for a day to think.' },
    ])
  })

  it('shows in the mirror what changed and what you are working on, and looks back with you at eight weeks', async () => {
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({
        answers: [
          ...['2026-09-21', '2026-09-28', '2026-10-05'].map((date, i) => ({
            date,
            questionId: `x${i}`,
            theme: 'money',
            depth: 2,
            traits: { conscientiousness: -1 },
          })),
          { date: '2026-10-14', questionId: 'y', theme: 'habits', depth: 1, traits: { conscientiousness: 1 } },
        ],
        skips: [],
      }),
    )
    seedPlan('2026-08-20', [
      { date: '2026-08-21', status: 'did' },
      { date: '2026-08-22', status: 'not_yet' },
      { date: '2026-08-25', status: 'did' },
    ])
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    await within(page).findByRole('heading', { level: 2, name: weekTitle })
    const headings = within(page).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings.some((h) => /^\d\d What changed$/.test(h ?? ''))).toBe(true)
    expect(headings.some((h) => /^\d\d What you're working on$/.test(h ?? ''))).toBe(true)

    const changed = within(page).getByRole('heading', { name: /^\d\d What changed$/ }).parentElement!
    expect(changed).toHaveTextContent('14 October First time in three weeks your answer leaned towards getting things done.')
    expect(changed).toHaveTextContent('Set against your own earlier answers only.')

    // The leaning already being worked on says so, rather than offering a second plan.
    const who = within(page).getByRole('heading', { name: /^\d\d Where you leaned$/ }).parentElement!
    expect(who).toHaveTextContent("You're already working on this one. When I sit down for the evening, I will leave one job for tomorrow.")
    expect(who).toHaveTextContent('Work on this instead?')

    const focus = within(page).getByRole('group', { name: "What you're working on" })
    expect(focus).toHaveTextContent('When I sit down for the evening, I will leave one job for tomorrow.')
    // Counted only when done, never what was missed.
    expect(focus).toHaveTextContent('Done 2 times since 20 August.')
    expect(focus).not.toHaveTextContent(/not yet|missed|streak/i)
    expect(focus).toHaveTextContent('Eight weeks on. Keep going, make it smaller, or close it?')
    fireEvent.click(within(focus).getByRole('button', { name: 'Make it smaller' }))
    fireEvent.change(within(focus).getByRole('textbox', { name: 'I will' }), { target: { value: 'put one thing away' } })
    fireEvent.click(within(focus).getByRole('button', { name: 'Keep the smaller plan' }))
    expect(focus).toHaveTextContent('When I sit down for the evening, I will put one thing away.')
    expect(focus).toHaveTextContent('A smaller plan is an easier one to keep.')
    expect(JSON.parse(localStorage.getItem('pi.nb.plan.p1')!)).toMatchObject({ will: 'put one thing away', lookedBack: '2026-10-18' })
  })
})

describe('settings', () => {
  it('changes the 18+ answer and how long your own words stay on this phone', async () => {
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ adult: true, mild: false }))
    localStorage.setItem('pi.words.q-a', JSON.stringify({ questionId: 'q-a', date: '2026-10-02', prompt: 'P', words: 'Ten days ago' }))
    localStorage.setItem('pi.words.q-b', JSON.stringify({ questionId: 'q-b', date: '2026-10-10', prompt: 'P', words: 'Two days ago' }))
    stubApi({})
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const page = screen.getByRole('region', { name: 'Settings' })
    expect(within(page).getByRole('radio', { name: 'Five weeks' })).toBeChecked()
    fireEvent.click(within(page).getByRole('radio', { name: "I'm under 18, or I'd rather not have them" }))
    fireEvent.click(within(page).getByRole('radio', { name: 'One week' }))
    expect(JSON.parse(localStorage.getItem('pi.prefs.v1')!)).toEqual({ adult: false, mild: false, wordsDays: 7 })
    expect(localStorage.getItem('pi.words.q-a')).toBeNull()
    expect(localStorage.getItem('pi.words.q-b')).not.toBeNull()
    fireEvent.click(within(page).getByRole('button', { name: '← Back' }))
    expect(await screen.findByText('When do you wash the dishes?')).toBeInTheDocument()
  })

  it('clears own words past their time each time the app opens', async () => {
    localStorage.setItem('pi.words.q-a', JSON.stringify({ questionId: 'q-a', date: '2026-09-01', prompt: 'P', words: 'Old' }))
    localStorage.setItem('pi.draft.2026-10-01-x', 'an old draft')
    localStorage.setItem('pi.pending.2026-09-30-y', 'old-key')
    stubApi({})
    render(<App />)
    await screen.findByText('When do you wash the dishes?')
    expect(localStorage.getItem('pi.words.q-a')).toBeNull()
    expect(localStorage.getItem('pi.draft.2026-10-01-x')).toBeNull()
    expect(localStorage.getItem('pi.pending.2026-09-30-y')).toBeNull()
  })
})

describe('Sunday', () => {
  it("asks how the week's small steps went", async () => {
    vi.setSystemTime(at(9, 18))
    localStorage.setItem(
      'pi.moves.v1',
      JSON.stringify([
        { date: '2026-10-13', questionId: 'q1', optionId: 'o', step: 'Call one friend', status: 'started' },
        { date: '2026-10-14', questionId: 'q2', optionId: 'o', step: 'Walk at lunch', status: 'helped' },
        { date: '2026-10-05', questionId: 'q3', optionId: 'o', step: 'Last week', status: 'started' },
      ]),
    )
    const fetchMock = stubApi({ edition: { status: 200, body: sunday }, mirror: { status: 200, body: mirror } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Today' }))
    const steps = screen.getByRole('group', { name: "This week's small steps" })
    expect(steps).toHaveTextContent('Call one friend')
    expect(steps).not.toHaveTextContent('Walk at lunch')
    expect(steps).not.toHaveTextContent('Last week')
    fireEvent.click(within(steps).getByRole('button', { name: 'It helped' }))
    expect(steps).toHaveTextContent('Glad it helped.')
    await waitFor(() => expect(calls(fetchMock, '/api/steps')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toMatchObject({ questionId: 'q1', status: 'helped', date: '2026-10-18' })
  })
})

// Stage 2 of the proposal of 2026-10-24 ("What you're reaching for"): every
// answer names the need it reached for, in one soft line; the card offers a
// second step for that need; the evening asks whether the morning's route
// usually gets the person there; and the mirror shows what the week reached
// for. All of it read from this phone, never sent.
const calmStep = "If something knocks you back today, talk to yourself the way you'd talk to a good friend."
const [dishes, ...restOfMorning] = today.questions
const reaching: DailySet = {
  ...today,
  questions: [
    {
      ...dishes,
      options: [
        { ...dishes.options[0], depth: 1, need: 'calm', insight: { ...dishes.options[0].insight!, needStep: calmStep } },
        dishes.options[1],
      ],
    },
    ...restOfMorning,
  ],
}
const seedHistory = (answers: object[]) => localStorage.setItem('pi.history.v1', JSON.stringify({ answers, skips: [] }))
const needAnswer = (date: string, need: string, more: object = {}) => ({
  date,
  questionId: `${date}-${need}-${Math.random().toString(36).slice(2, 7)}`,
  theme: 'work-career',
  depth: 2,
  traits: {},
  need,
  ...more,
})

describe("what you're reaching for", () => {
  it('names what an answer reached for, and lets the person pick the step that serves it', async () => {
    const fetchMock = stubApi({ edition: { status: 200, body: reaching } })
    render(<App />)
    await answer('Right after eating')
    expect(screen.getByText('What it reached for').parentElement).toHaveTextContent('What it reached for feeling settled')

    const tryIt = screen.getByRole('group', { name: 'Something to try' })
    expect(within(tryIt).getByRole('radio', { name: 'Next time a small task appears, notice the itch to finish it.' })).toBeChecked()
    fireEvent.click(within(tryIt).getByRole('radio', { name: calmStep }))
    fireEvent.click(within(tryIt).getByRole('button', { name: "I'll try it" }))
    expect(tryIt).toHaveTextContent(`Something you'll try: ${calmStep}`)
    await waitFor(() => expect(calls(fetchMock, '/api/steps')).toHaveLength(1))
    expect(bodyOf(calls(fetchMock, '/api/steps')[0])).toMatchObject({
      questionId: 'q-dishes',
      optionId: 'right-away',
      status: 'started',
      needStep: true,
    })
    expect(JSON.parse(localStorage.getItem('pi.moves.v1')!)[0]).toMatchObject({ step: calmStep, needStep: true })
    expect(JSON.parse(localStorage.getItem('pi.history.v1')!).answers[0]).toMatchObject({ questionId: 'q-dishes', need: 'calm' })
  })

  it('offers one step, and no line, when the answer names no need', async () => {
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    expect(screen.queryByText('What it reached for')).not.toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Something to try' })).queryByRole('radio')).not.toBeInTheDocument()
  })

  it("asks in the evening whether the morning's route usually gets you there, and keeps the answer on the phone", async () => {
    answeredThisMorning()
    localStorage.setItem('pi.pick.2026-10-12', JSON.stringify(['q-dishes', 'q-bill', 'q-alarm']))
    seedHistory([{ date: '2026-10-12', questionId: 'q-dishes', theme: 'habits', depth: 1, traits: {}, optionId: 'right-away', need: 'calm' }])
    // The evening three are answered too; the day's close is one tap from Today.
    localStorage.setItem('pi.pick.2026-10-12.pm', JSON.stringify(['q-lunch', 'q-queue', 'q-ring']))
    for (const [q, o] of [['q-lunch', 'out'], ['q-queue', 'say'], ['q-ring', 'later']]) localStorage.setItem(`pi.choice.${q}`, o)
    vi.setSystemTime(at(19))
    const evening = { ...reaching, evening: [lunch, queue, ring], pool: [...reaching.questions!, lunch, queue, ring] }
    const fetchMock = stubApi({ edition: { status: 200, body: evening } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'See your evening: Your evening three are answered' }))
    const day = await screen.findByRole('region', { name: "That's your day." })
    const choice = within(day).getByRole('group', { name: "This morning's choice" })
    expect(choice).toHaveTextContent('This morning you chose “Right after eating”. It sounded like feeling settled mattered there.')
    expect(choice).toHaveTextContent('Does that route usually get you there?')
    expect(within(choice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Yes', 'A bit', 'Not really'])
    fireEvent.click(within(choice).getByRole('button', { name: 'A bit' }))
    expect(choice).toHaveTextContent('Noted. Part of the way there still counts.')
    expect(within(choice).queryByRole('button')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.history.v1')!).answers[0]).toMatchObject({ route: 'bit', label: 'Right after eating' })
    for (const [, init] of fetchMock.mock.calls) expect(String(init?.body ?? '')).not.toContain('route')
  })

  it('shows in the mirror what the week reached for, with the routes the person named', async () => {
    seedHistory([
      needAnswer('2026-10-12', 'respect', { route: 'no', label: 'Say nothing and stew' }),
      needAnswer('2026-10-13', 'respect'),
      needAnswer('2026-10-13', 'respect'),
      needAnswer('2026-10-13', 'competence', { route: 'yes', label: 'Make a list first' }),
      needAnswer('2026-10-14', 'competence'),
      needAnswer('2026-10-15', 'competence'),
      needAnswer('2026-10-15', 'calm', { theme: 'intimacy' }), // never counted
    ])
    await openMirror()
    const page = screen.getByRole('region', { name: 'Your weekly mirror' })
    const section = (await within(page).findByRole('heading', { name: /What you reached for/ })).closest('section')!
    expect(section).toHaveTextContent('Most of your choices this week reached for doing well and being respected.')
    expect(within(section).getByRole('group', { name: 'Doing well' })).toHaveTextContent('What got you there: “Make a list first”.')
    expect(within(section).getByRole('group', { name: 'Being respected' })).toHaveTextContent("What didn't: “Say nothing and stew”.")
    expect(section).toHaveTextContent('Doing well and being respected are kept apart here')
    expect(section).toHaveTextContent('Counted from your own answers this week, nothing else.')
    expect(section).not.toHaveTextContent('feeling settled')
    expect(within(section).queryByRole('group', { name: 'Is something else uncertain?' })).not.toBeInTheDocument()
  })

  it('asks, never tells, when feeling safe has come first three weeks running', async () => {
    seedHistory(
      ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-05', '2026-10-06', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-14'].map(
        (d) => needAnswer(d, 'security'),
      ),
    )
    await openMirror()
    const ask = await screen.findByRole('group', { name: 'Is something else uncertain?' })
    expect(ask).toHaveTextContent('Feeling safe came first again. Is something else feeling uncertain right now?')
    fireEvent.click(within(ask).getByRole('button', { name: 'Money' }))
    expect(ask).toHaveTextContent('Thanks for saying.')
    expect(within(ask).queryByRole('button')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.safety.2026-10-12')!)).toBe('money')
  })
})

// Where someone lives (the research of 2026-10-24, "Tailor the setting, never
// the person"): asked once after a sitting, kept on the phone, never sent; it
// points heavy moments to that country's help.
describe('where you live', () => {
  async function finishMorning() {
    await answer('Right after eating')
    next()
    await skip()
    await answer('One')
    next()
    return screen.findByRole('region', { name: "That's your day." })
  }

  it('is asked once after a sitting, kept on this phone, and never sent', async () => {
    const fetchMock = stubApi({})
    render(<App />)
    await finishMorning()
    const ask = screen.getByRole('region', { name: 'Where do you live now?' })
    expect(ask).toHaveTextContent('It stays on this phone.')
    expect(within(ask).getByRole('button', { name: 'Keep this' })).toBeDisabled() // no guess from this phone's clock
    fireEvent.change(within(ask).getByRole('combobox', { name: 'Country' }), { target: { value: 'KE' } })
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep this' }))
    expect(screen.queryByRole('region', { name: 'Where do you live now?' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.prefs.v1')!)).toMatchObject({ country: 'KE' })
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(/KE|country/i)
      expect(String(init?.body ?? '')).not.toMatch(/"KE"|country/i)
    }
  })

  it('can be left unsaid, and is not asked again', async () => {
    stubApi({})
    const { unmount } = render(<App />)
    await finishMorning()
    fireEvent.click(within(screen.getByRole('region', { name: 'Where do you live now?' })).getByRole('button', { name: 'Prefer not to say' }))
    expect(JSON.parse(localStorage.getItem('pi.prefs.v1')!)).toMatchObject({ country: 'none' })
    unmount()
    render(<App />)
    await screen.findByRole('heading', { name: 'Good morning.' })
    expect(screen.queryByRole('region', { name: 'Where do you live now?' })).not.toBeInTheDocument()
  })

  it("points a heavy answer to that country's helplines, and can be changed in Settings", async () => {
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ adult: null, mild: false, wordsDays: 35, country: 'GH' }))
    stubApi({ today: { status: 200, body: withQuiet } })
    render(<App />)
    await answer('I wonder if people have forgotten me')
    const heavy = screen.getByRole('note', { name: 'That sounds really hard' })
    expect(within(heavy).getByRole('link', { name: 'Find a helpline' })).toHaveAttribute('href', 'https://findahelpline.com/countries/gh')
    expect(within(heavy).getByRole('link', { name: 'Talk to someone now' })).toHaveAttribute('href', 'https://findahelpline.com/countries/gh')

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const where = screen.getByRole('group', { name: 'Where you live' })
    const select = within(where).getByRole('combobox', { name: 'Country' })
    expect(select).toHaveValue('GH')
    fireEvent.change(select, { target: { value: 'none' } })
    expect(JSON.parse(localStorage.getItem('pi.prefs.v1')!)).toMatchObject({ country: 'none' })
  })
})

describe('questions about everyday life where you live', () => {
  const homeMoment = {
    id: 'africa-relative-money',
    region: 'africa',
    theme: 'relatives',
    care: 'personal',
    prompt: 'A relative asks for money you had set aside. You usually…',
    options: [
      {
        id: 'give',
        label: 'Give it',
        depth: 1,
        need: 'belonging',
        insight: {
          reveal: 'Family comes before your own plans. You give first and work out the rest later.',
          otherSide: 'Your own plans can keep sliding to the back of the queue.',
          step: 'This week, notice how it feels in the moment you hand money over.',
          needStep: 'This week, ask what the money is for before you decide how much.',
        },
      },
      { id: 'part', label: 'Give part of it', depth: 2, need: 'security' },
      { id: 'no', label: 'Say not this time', depth: 3, need: 'freedom' },
    ],
  }
  const ID = '2026-10-12-africa-relative-money'
  const LOCAL_NOTE = 'About everyday life where you live. Your answer stays on this phone.'

  // A phone in Nigeria whose morning holds the regional question third.
  function inNigeria(prefs: object = {}) {
    localStorage.setItem('pi.prefs.v1', JSON.stringify({ adult: null, mild: false, wordsDays: 35, country: 'NG', ...prefs }))
    localStorage.setItem('pi.regional.v1', JSON.stringify({ questions: [homeMoment] }))
    localStorage.setItem('pi.pick.2026-10-12', JSON.stringify(['q-dishes', 'q-bill', ID]))
  }

  it('is answered, tapped and tried on this phone, and nothing about it is sent', async () => {
    inNigeria()
    const fetchMock = stubApi({ regional: { status: 200, body: { regions: [], questions: [homeMoment] } } })
    render(<App />)
    await answer('Right after eating')
    next()
    await skip()
    expect(await screen.findByText(homeMoment.prompt)).toBeInTheDocument()
    expect(screen.getByText(LOCAL_NOTE)).toBeInTheDocument()
    await answer('Give it')
    fireEvent.click(within(screen.getByRole('group', { name: 'Does this sound like you?' })).getByRole('button', { name: "That's me" }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Something to try' })).getByRole('button', { name: "I'll try it" }))

    await waitFor(() => expect(calls(fetchMock, '/api/regional')).toHaveLength(1))
    // the pack is asked for with nothing about the phone
    expect(calls(fetchMock, '/api/regional')[0][1]).toBeUndefined()
    expect(calls(fetchMock, '/api/votes')).toHaveLength(1) // the dishes only
    expect(calls(fetchMock, '/api/ratings')).toHaveLength(0)
    expect(calls(fetchMock, '/api/steps')).toHaveLength(0)
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(/africa|NG/)
      expect(String(init?.body ?? '')).not.toMatch(/africa|relative|"NG"/)
    }
    const answers = JSON.parse(localStorage.getItem('pi.history.v1')!).answers
    expect(answers.find((a: { questionId: string }) => a.questionId === ID)).toMatchObject({ regional: true, verdict: 'me', need: 'belonging' })
    expect(JSON.parse(localStorage.getItem('pi.moves.v1')!)).toEqual([expect.objectContaining({ questionId: ID, local: true })])
  })

  it('can be switched off in Settings, without changing a sitting already started', async () => {
    inNigeria()
    stubApi({})
    render(<App />)
    await answer('Right after eating')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const where = screen.getByRole('group', { name: 'Where you live' })
    const offer = within(where).getByRole('checkbox', { name: 'Questions about everyday life where I live' })
    expect(offer).toBeChecked()
    fireEvent.click(offer)
    expect(JSON.parse(localStorage.getItem('pi.prefs.v1')!)).toMatchObject({ country: 'NG', regional: false })
    expect(JSON.parse(localStorage.getItem('pi.pick.2026-10-12')!)).toEqual(['q-dishes', 'q-bill', ID])
    // a country with no regional questions has no switch
    fireEvent.change(within(where).getByRole('combobox', { name: 'Country' }), { target: { value: 'KZ' } })
    expect(within(where).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '← Back' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Next/ }))
    await skip()
    expect(await screen.findByText(homeMoment.prompt)).toBeInTheDocument()
  })

  it('is not offered when switched off', async () => {
    inNigeria({ regional: false })
    localStorage.removeItem('pi.pick.2026-10-12')
    localStorage.setItem(
      'pi.history.v1',
      JSON.stringify({ answers: [{ date: '2026-10-08', questionId: 'x', theme: 'habits', depth: 2, traits: {} }], skips: [] }),
    )
    const fetchMock = stubApi({})
    render(<App />)
    await screen.findByRole('navigation', { name: "Today's questions" })
    expect(JSON.parse(localStorage.getItem('pi.pick.2026-10-12')!)).toHaveLength(3)
    expect(JSON.parse(localStorage.getItem('pi.pick.2026-10-12')!)).not.toContain(ID)
    expect(calls(fetchMock, '/api/regional')).toHaveLength(0)
  })
})

describe('Stage 5 in the day', () => {
  const methods = { status: 200, body: { email: true, phone: false, google: false, apple: false } }
  const signIn = () => {
    localStorage.setItem('pi.account.v1', 's1.k.sess.sig')
    localStorage.setItem('pi.account.me', JSON.stringify({ id: 'acc', name: 'Ama', handle: 'ama', suggest: true, connect: true, sync: false }))
  }

  it('offers signing in once, after the first sitting, and "not now" keeps everything here', async () => {
    const fetchMock = stubApi({ social: (url) => (url === '/api/auth/methods' ? methods : undefined) })
    const { unmount } = render(<App />)
    await answer('Right after eating')
    next()
    await answer('Split it evenly')
    next()
    await answer('Several')
    next()
    expect(await screen.findByRole('heading', { name: 'Your three cards are on this phone. Keep them everywhere.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not now — keep it on this phone' }))
    expect(screen.queryByRole('heading', { name: /Keep them everywhere/ })).not.toBeInTheDocument()
    expect(calls(fetchMock, '/api/auth/code')).toHaveLength(0)
    unmount()
    render(<App />)
    await screen.findByRole('heading', { name: /morning/i })
    expect(screen.queryByRole('heading', { name: /Keep them everywhere/ })).not.toBeInTheDocument()
  })

  it('greets a signed-in person by name and shows nods that arrived, never a count', async () => {
    signIn()
    answeredThisMorning()
    vi.setSystemTime(at(12))
    stubApi({
      social: (url) => {
        if (url.startsWith('/api/nods?'))
          return { status: 200, body: { cards: ['Rooting for you this week.'], received: [{ from: { id: 'n', name: 'Nakato', tag: 'family' }, card: 0, text: 'Rooting for you this week.', date: '2026-10-12' }], sentTo: [] } }
        if (url.startsWith('/api/friends/today')) return { status: 200, body: { open: false, have: 1, need: 3 } }
        if (url === '/api/together') return { status: 200, body: [] }
      },
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Good afternoon, Ama.' })).toBeInTheDocument()
    expect(await screen.findByText('sent you a quiet nod · “Rooting for you this week.”', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Since you last looked' })).not.toHaveTextContent(/\d+ nods?/)
  })

  it("names today's friend in the midday hero once the circle has three", async () => {
    signIn()
    answeredThisMorning()
    vi.setSystemTime(at(12))
    stubApi({
      social: (url) => {
        if (url.startsWith('/api/friends/today'))
          return {
            status: 200,
            body: {
              open: true,
              have: 3,
              need: 3,
              friend: { id: 'k', name: 'Kofi', tag: 'work', since: '2026-10-01', active: true, connect: true },
              question: { id: 'fq-work-01', prompt: 'What does Kofi do first?', options: [{ id: 'a', label: 'Takes the hard part' }] },
            },
          }
        if (url.startsWith('/api/nods?')) return { status: 200, body: { cards: [], received: [], sentTo: [] } }
        if (url === '/api/together') return { status: 200, body: [] }
      },
    })
    render(<App />)
    expect(await screen.findByRole('button', { name: "Open: Today's friend is Kofi" })).toBeInTheDocument()
  })

  it('the Outside Mirror, locked, counts friends who answered and never names them', async () => {
    signIn()
    await openMirror({
      social: (url) => (url === '/api/friends/mirror' ? { status: 200, body: { open: false, friends: 2, need: 3, weeks: 3, traits: [] } } : undefined),
    })
    await screen.findByRole('heading', { level: 2, name: weekTitle })
    const section = await screen.findByRole('region', { name: /How your circle experiences you/ })
    expect(await within(section).findByText('Opens when 3 friends have answered', { exact: false })).toBeInTheDocument()
    expect(within(section).getByRole('list', { name: '2 of 3 friends have answered' })).toBeInTheDocument()
    expect(within(section).getAllByText('A friend')).toHaveLength(2)
    expect(section).not.toHaveTextContent(/Kofi|Nakato/)
  })

  it('the Outside Mirror, open, sets the circle beside your own read', async () => {
    signIn()
    await openMirror({
      social: (url) =>
        url === '/api/friends/mirror'
          ? { status: 200, body: { open: true, friends: 4, need: 3, weeks: 3, traits: [{ trait: 'conscientiousness', position: 30 }] } }
          : undefined,
    })
    const section = await screen.findByRole('region', { name: /How your circle experiences you/ })
    expect(await within(section).findByText('Blended from 4 friends over 3 weeks. No single answer is ever shown.')).toBeInTheDocument()
    expect(within(section).getByRole('img', { name: /Getting things done: your circle 30 of 100, you 74/ })).toBeInTheDocument()
    expect(section).toHaveTextContent('What your circle notices that you might miss')
  })

  it('is not in the mirror for someone signed out', async () => {
    await openMirror()
    await screen.findByRole('heading', { level: 2, name: weekTitle })
    expect(screen.queryByRole('region', { name: /How your circle experiences you/ })).not.toBeInTheDocument()
  })
})
