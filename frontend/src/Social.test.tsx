import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deviceToken, rememberChoice, type Question } from './api'
import { CircleScreen } from './Circle'
import { FriendQuestion, NodPicker, TogetherAsk, TogetherCard } from './Friends'
import { ShareSheet } from './ShareCard'
import { SignInSheet } from './SignIn'
import { ACCOUNT_KEY, type AccountView, type CircleView, type FriendToday, type TogetherView } from './social'
import { load, save, saveJSON } from './storage'

// Stage 5 as a person meets it: signing in without a password, the circle,
// today's friend question, quiet nods, Answer Together and the share card.
// The server is faked; what matters is what is sent and what is shown.

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Call = { url: string; method: string; body: unknown; auth: string | null }
let calls: Call[]
let routes: (c: Call) => Response | undefined

beforeEach(() => {
  localStorage.clear()
  calls = []
  routes = () => undefined
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    const c: Call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, auth: headers.Authorization ?? null }
    calls.push(c)
    return routes(c) ?? json(404, { error: 'not_found' })
  })
})
afterEach(() => vi.unstubAllGlobals())

const ama: AccountView = { id: 'acc-ama', name: 'Ama', handle: 'ama', suggest: true, connect: true, sync: false }

function signedInAs(me: AccountView = ama) {
  save(ACCOUNT_KEY, 's1.k.sess.sig')
  saveJSON('pi.account.me', me)
}

const friend = (id: string, name: string, extra: Partial<CircleView['friends'][0]> = {}) => ({
  id,
  name,
  tag: 'work' as const,
  since: '2026-10-12',
  active: true,
  connect: true,
  ...extra,
})

describe('signing in', () => {
  it('offers nothing it cannot do, and says everything stays on the phone', async () => {
    routes = (c) => (c.url === '/api/auth/methods' ? json(200, { email: false, phone: false, google: false, apple: false }) : undefined)
    render(<SignInSheet onDone={() => {}} onNotNow={() => {}} />)
    expect(await screen.findByText(/isn’t switched on here yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send code' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not now — keep it on this phone' })).toBeInTheDocument()
  })

  it('signs in with a code, brings this phone’s pass along and takes the account’s, then asks for a name', async () => {
    save('pi.device.v1', 'v2.k.phone.sig')
    routes = (c) => {
      if (c.url === '/api/auth/methods') return json(200, { email: true, phone: true, google: false, apple: false })
      if (c.url === '/api/auth/code') return json(202, { status: 'sent', kind: 'email' })
      if (c.url === '/api/auth/verify')
        return (c.body as { code: string }).code === '123456'
          ? json(200, { account: { ...ama, name: '', handle: '' }, accountToken: 's1.k.new.sig', deviceToken: 'v2.k.account.sig', created: true, merged: true })
          : json(401, { error: 'wrong_code' })
      if (c.url === '/api/account' && c.method === 'PATCH') return json(200, { ...ama, ...(c.body as object) })
    }
    const done = vi.fn()
    render(<SignInSheet onDone={done} />)
    fireEvent.change(await screen.findByLabelText('Or email, phone or WhatsApp number'), { target: { value: 'ama@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    const box = await screen.findByLabelText('The code')
    fireEvent.change(box, { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('didn’t match')

    fireEvent.change(box, { target: { value: '12 34 56' } })
    expect(box).toHaveValue('123456')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'Ama' } })
    fireEvent.change(screen.getByLabelText('Handle for invites (optional)'), { target: { value: '@ama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(done).toHaveBeenCalled())

    const verify = calls.find((c) => c.url === '/api/auth/verify' && (c.body as { code: string }).code === '123456')!
    expect(verify.body).toMatchObject({ address: 'ama@example.com', voterId: 'v2.k.phone.sig' })
    expect(load(ACCOUNT_KEY)).toBe('s1.k.new.sig')
    expect(load('pi.device.v1')).toBe('v2.k.account.sig')
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.body).toEqual({ name: 'Ama', handle: 'ama' })
    expect(patch.auth).toBe('Account s1.k.new.sig')
  })

  it('the login page sends a code by email, phone or WhatsApp, and offers the 12 words for lost access', async () => {
    routes = (c) => {
      if (c.url === '/api/auth/methods') return json(200, { email: true, phone: true, google: false, apple: false })
      if (c.url === '/api/auth/code') return json(202, { status: 'sent', kind: 'phone' })
    }
    render(<SignInSheet page={{ label: 'Sign in, or come back', title: 'Your Notebook is waiting.', lead: 'No password.' }} onDone={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Your Notebook is waiting.' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }))
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('WhatsApp number, with its country code'), { target: { value: '+256700000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send my 6-digit code' }))
    expect(await screen.findByText('Check your messages')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/auth/code')!.body).toMatchObject({ address: '+256700000000' })
  })

  it('lost access on the login page opens the recovery phrase', async () => {
    routes = (c) => (c.url === '/api/auth/methods' ? json(200, { email: true, phone: false, google: false, apple: false }) : undefined)
    render(<SignInSheet page={{ label: 'Sign in', title: 'Your Notebook is waiting.', lead: 'No password.' }} onDone={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Lost access? Use your 12-word recovery phrase' }))
    expect(screen.getByLabelText('Your 12 words')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
  })

  it('a signed-in phone whose pass is gone takes the account’s, never an anonymous one', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/account/device' ? json(200, { token: 'v2.k.account.sig' }) : undefined)
    expect(await deviceToken()).toBe('v2.k.account.sig')
    expect(calls.map((c) => c.url)).toEqual(['/api/account/device'])
    expect(calls[0].auth).toBe('Account s1.k.sess.sig')
  })

  it('a session the server ended signs this phone out', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/circle' ? json(401, { error: 'signed_out' }) : undefined)
    render(<CircleScreen />)
    await waitFor(() => expect(load(ACCOUNT_KEY)).toBeNull())
    expect(await screen.findByText('Sign in to start your circle.')).toBeInTheDocument()
  })
})

describe('the circle', () => {
  const circle = (over: Partial<CircleView> = {}): CircleView => ({
    me: ama,
    friends: [friend('k', 'Kofi M.'), friend('n', 'Nakato', { tag: 'family' }), friend('d', 'Daniel', { muted: true, tag: 'school' })],
    active: 2,
    need: 3,
    joined: [],
    suggestions: [
      { id: 'j', name: 'Joel A.', mutual: ['Kofi', 'Nakato'] },
      { id: 's', name: 'Sarah O.', room: 'LIMA-42' },
    ],
    ...over,
  })

  it('is a sign-in until there is an account', () => {
    render(<CircleScreen />)
    expect(screen.getByRole('heading', { name: 'Your circle' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to start your circle.')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/circle')).toBe(false)
  })

  it('shows who is connected, how far to the Outside Mirror, and mutes silently', async () => {
    signedInAs()
    let muted: unknown = null
    routes = (c) => {
      if (c.url === '/api/circle') return json(200, circle())
      if (c.url === '/api/circle/friends/k' && c.method === 'PATCH') {
        muted = c.body
        return json(200, friend('k', 'Kofi M.', { muted: true }))
      }
      if (c.url === '/api/circle/connect/j') return json(200, { status: 'asked' })
    }
    render(<CircleScreen />)
    expect(await screen.findByRole('heading', { name: 'Your circle' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Your circle in numbers' })).toHaveTextContent('3People in your circle')
    expect(screen.getByText('Your circle · @ama')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 of 3 friends active this week' })).toBeInTheDocument()
    expect(screen.getByText('One more friend unlocks your Outside Mirror')).toBeInTheDocument()

    expect(screen.getByText('Work · since 12 Oct')).toBeInTheDocument()
    expect(screen.getByText('Silently muted · they’ll never know')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mute Kofi M.' }))
    await waitFor(() => expect(muted).toEqual({ muted: true }))

    expect(screen.getByText('Knows Kofi and Nakato')).toBeInTheDocument()
    expect(screen.getByText('In room LIMA-42')).toBeInTheDocument()
    fireEvent.click(within(screen.getByText('Joel A.').closest('li')!).getByRole('button', { name: 'Connect' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/circle/connect/j' && c.method === 'POST')).toBe(true))

    expect(screen.getByText(/Never your answers, your readings, or who else is here/)).toBeInTheDocument()
  })

  // Edwin, 2026-10-25: three circles, biggest to smallest, and the person
  // places each friend: inner (trust with a secret), close, and friends.
  it('lets the person place each friend in one of three circles, kept on this phone', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/circle' ? json(200, circle()) : undefined)
    render(<CircleScreen />)
    const rings = await screen.findByRole('group', { name: 'Your three circles' })
    expect(rings).toHaveTextContent('Inner circle')
    expect(within(rings).getByRole('img', { name: /Wider circle: Kofi M\., Nakato, Daniel/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kofi M.' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Which circle is Kofi M. in?' })).getByRole('button', { name: 'Inner circle' }))
    expect(within(rings).getByRole('img', { name: /Inner circle: Kofi M\./ })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('pi.rings')!)).toEqual({ k: 'inner' })
    // Never sent: no request carries which circle anyone is in.
    expect(calls.some((c) => JSON.stringify(c.body ?? '').includes('inner'))).toBe(false)
  })

  it('finds a friend by name', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/circle' ? json(200, circle()) : undefined)
    render(<CircleScreen />)
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Search people in your circle' }), { target: { value: 'nak' } })
    expect(screen.getByRole('button', { name: 'Nakato' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kofi M.' })).not.toBeInTheDocument()
  })

  it('makes an invite link and a QR code for the tag chosen', async () => {
    signedInAs()
    routes = (c) => {
      if (c.url === '/api/circle') return json(200, circle())
      if (c.url === '/api/circle/invites') return json(200, { code: 'abcdefghjk', tag: (c.body as { tag: string }).tag, expiresOn: '2026-11-11' })
    }
    render(<CircleScreen />)
    await screen.findByRole('heading', { name: 'Your circle' })
    fireEvent.click(screen.getByRole('button', { name: 'My QR' }))
    expect(await screen.findByRole('img', { name: 'QR code for your invite link' })).toBeInTheDocument()
    expect(screen.getByText(/\/c\/abcdefghjk$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Family' }))
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/circle/invites').map((c) => c.body)).toEqual([{ tag: 'friends' }, { tag: 'family' }]))
  })

  it('joins a room by its code and opens one for a team', async () => {
    signedInAs()
    routes = (c) => {
      if (c.url === '/api/circle') return json(200, circle({ suggestions: [] }))
      if (c.url === '/api/circle/rooms/LIMA-42') return json(200, { code: 'LIMA-42', tag: 'work', inside: 4, expires: '2026-10-25T10:00:00Z', host: 'Kofi' })
      if (c.url === '/api/circle/rooms/NOPE-11') return json(404, { error: 'no_room' })
    }
    render(<CircleScreen />)
    await screen.findByRole('heading', { name: 'Your circle' })
    fireEvent.click(screen.getByRole('button', { name: 'Room code' }))
    const box = screen.getByLabelText(/Join a room/)
    fireEvent.change(box, { target: { value: 'nope-11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText('No open room has that code.')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'lima-42' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(await screen.findByText(/You’re in Kofi’s room/)).toBeInTheDocument()
  })

  it('turns a followed invite into a connection once signed in', async () => {
    signedInAs()
    save('pi.invite', 'abcdefghjk')
    routes = (c) => {
      if (c.url === '/api/circle') return json(200, circle({ friends: [], active: 0, suggestions: [] }))
      if (c.url === '/api/circle/invites/abcdefghjk' && c.method === 'GET') return json(200, { name: 'Kofi', tag: 'work' })
      if (c.url === '/api/circle/invites/abcdefghjk' && c.method === 'POST') return json(200, friend('k', 'Kofi'))
    }
    render(<CircleScreen />)
    expect(await screen.findByText('invited you to their circle.', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Join Kofi’s circle' }))
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('abcdefghjk'))?.body).toEqual({ tag: 'work' }))
    expect(load('pi.invite')).toBeNull()
  })
})

describe("today's friend question", () => {
  const open: FriendToday = {
    open: true,
    have: 3,
    need: 3,
    friend: friend('k', 'Kofi'),
    question: {
      id: 'fq-work-01',
      prompt: 'When a shared deadline gets tight or plans suddenly shift, what does Kofi usually do first?',
      options: [
        { id: 'a', label: 'Quietly takes on the hardest part alone' },
        { id: 'b', label: 'Gathers people quickly to talk through a new plan' },
      ],
    },
  }

  it('waits for three friends', () => {
    signedInAs()
    render(<FriendQuestion date="2026-10-12" today={{ open: false, have: 2, need: 3 }} onCircle={() => {}} onAnswered={() => {}} />)
    expect(screen.getByText('One more friend and the midday friend question begins.')).toBeInTheDocument()
  })

  it('sends only today’s friend and question, and says it is anonymous', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/friends/votes' ? json(202, { status: 'accepted' }) : undefined)
    const answered = vi.fn()
    render(<FriendQuestion date="2026-10-12" today={open} onCircle={() => {}} onAnswered={answered} />)
    expect(screen.getByText(/Today’s friend · Kofi/)).toBeInTheDocument()
    expect(screen.getByText(/Anonymous · blended after 3 friends/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gathers people quickly to talk through a new plan' }))
    expect(await screen.findByText('Thank you. That goes into Kofi’s Outside Mirror.')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/friends/votes')!.body).toEqual({ date: '2026-10-12', friendId: 'k', questionId: 'fq-work-01', optionId: 'b' })
    expect(answered).toHaveBeenCalled()
  })
})

describe('quiet nods', () => {
  it('sends one fixed card to one friend, and never a word typed', async () => {
    signedInAs()
    const cards = Array.from({ length: 24 }, (_, i) => `Card ${i}`)
    routes = (c) => {
      if (c.url === '/api/circle') return json(200, { me: ama, friends: [friend('k', 'Kofi'), friend('d', 'Daniel', { muted: true })], active: 1, need: 3, joined: [], suggestions: [] })
      if (c.url.startsWith('/api/nods?')) return json(200, { cards, received: [], sentTo: [] })
      if (c.url === '/api/nods') return json(202, { status: 'sent' })
    }
    render(<NodPicker date="2026-10-12" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Kofi' }))
    expect(screen.queryByRole('button', { name: /Daniel/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    const offered = screen.getAllByRole('radio')
    expect(offered).toHaveLength(4)
    fireEvent.click(offered[1])
    fireEvent.click(screen.getByRole('button', { name: 'Send the nod' }))
    expect(await screen.findByText(/you won’t be told when/)).toBeInTheDocument()
    const sent = calls.find((c) => c.url === '/api/nods' && c.method === 'POST')!.body as { to: string; card: number }
    expect(sent.to).toBe('k')
    expect(offered[1]).toHaveTextContent(`Card ${sent.card}`)
  })

  it('is not offered when nods are switched off', () => {
    signedInAs({ ...ama, connect: false })
    render(<NodPicker date="2026-10-12" />)
    expect(calls).toHaveLength(0)
  })
})

describe('Answer Together', () => {
  const base: TogetherView = {
    id: 't1',
    with: friend('k', 'Kofi'),
    asked: false,
    questionId: 'q-favour',
    prompt: 'A friend texts at 7am asking for a favour. What do you actually do first?',
    options: [
      { id: 'a', label: 'Say yes before I have thought it through' },
      { id: 'b', label: 'Ask what it involves before deciding' },
    ],
    state: 'yours',
    expires: '2026-10-14T10:00:00Z',
  }

  it('the invitee answers before seeing anything, and can say not this one', async () => {
    signedInAs()
    routes = (c) => (c.url === '/api/together/t1' && c.method === 'POST' ? json(200, { mine: 'b', theirs: 'a' }) : c.method === 'DELETE' ? json(204) : undefined)
    const changed = vi.fn()
    render(<TogetherCard t={base} onChange={changed} />)
    expect(screen.queryByText(/Kofi chose|theirs/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask what it involves before deciding' }))
    fireEvent.click(screen.getByRole('button', { name: 'Answer · reveals both' }))
    await waitFor(() => expect(changed).toHaveBeenCalled())
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ optionId: 'b' })
  })

  it('shows both choices only when revealed, and never as a score', () => {
    render(<TogetherCard t={{ ...base, asked: true, state: 'revealed', mine: 'a', theirs: 'b' }} onChange={() => {}} />)
    expect(screen.getByText('Say yes before I have thought it through')).toBeInTheDocument()
    expect(screen.getByText('Ask what it involves before deciding')).toBeInTheDocument()
    expect(screen.getByText(/Neither is the right one/)).toBeInTheDocument()
    expect(screen.getByText(/It never feeds your mirror/)).toBeInTheDocument()
  })

  it('waiting shows nothing of theirs, and lapsing is quiet', () => {
    const { unmount } = render(<TogetherCard t={{ ...base, asked: true, state: 'waiting', mine: 'a' }} onChange={() => {}} />)
    expect(screen.getByText(/Your choice stays sealed/)).toBeInTheDocument()
    expect(screen.queryByText('Ask what it involves before deciding')).not.toBeInTheDocument()
    unmount()
    render(<TogetherCard t={{ ...base, asked: true, state: 'expired', mine: 'a' }} onChange={() => {}} />)
    expect(screen.getByText(/came and went/)).toBeInTheDocument()
    expect(screen.queryByText(/declined|ignored/i)).not.toBeInTheDocument()
  })

  it('is never offered for an intimate question or one with a heavy answer', () => {
    signedInAs()
    const q = (over: Partial<Question>): Question => ({ id: 'q1', prompt: 'P?', options: [{ id: 'a', label: 'A' }], ...over })
    rememberChoice('q1', 'a')
    const { rerender } = render(<TogetherAsk question={q({ care: 'intimate' })} />)
    expect(screen.queryByRole('button', { name: /Answer with a friend/ })).not.toBeInTheDocument()
    rerender(<TogetherAsk question={q({ options: [{ id: 'a', label: 'A', heavy: true }] })} />)
    expect(screen.queryByRole('button', { name: /Answer with a friend/ })).not.toBeInTheDocument()
    rerender(<TogetherAsk question={q({})} />)
    expect(screen.getByRole('button', { name: /Answer with a friend/ })).toBeInTheDocument()
  })
})

describe('the share card', () => {
  it('carries the week’s name and nothing about the answers', () => {
    render(<ShareSheet content={{ eyebrow: 'Week 43 · My Sunday Mirror', name: 'The Steady Finisher', line: 'Steady follow-through.' }} onClose={() => {}} />)
    const card = screen.getByRole('figure', { name: 'The card' })
    expect(card).toHaveTextContent('The Steady Finisher')
    expect(card).toHaveTextContent('personaindex.com')
    expect(screen.getByText(/never on the card/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Square 1:1' }))
    expect(card).toHaveClass('square')
  })

  it('shares through the phone’s own sheet', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share })
    render(<ShareSheet content={{ eyebrow: 'Week 43', name: 'The Steady Finisher' }} onClose={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'More ways to share' })))
    expect(share).toHaveBeenCalledWith({ text: 'This week I was The Steady Finisher. personaindex.com' })
  })
})
