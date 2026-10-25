import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AfterReflection, ReachOutPicker, ShareComposer } from './Closer'
import { ACCOUNT_KEY, type AccountView } from './social'
import { save, saveJSON } from './storage'

// Closer Together (Connect 3.0) as a person meets it: sharing approved words
// with friends they pick, and reaching out with a fixed phrase. The server
// is faked; what matters is what is sent and what is said.

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Call = { url: string; method: string; body: unknown }
let calls: Call[]

const friend = (id: string, name: string, extra = {}) => ({ id, name, tag: 'work', since: '2026-10-12', active: true, connect: true, ...extra })
const circle = { me: {}, friends: [friend('f-kofi', 'Kofi'), friend('f-sarah', 'Sarah'), friend('f-joel', 'Joel', { muted: true })], active: 2, need: 3, joined: [], suggestions: [] }
const themes = [
  { id: 'managing-stress', label: 'Managing stress' },
  { id: 'building-habits', label: 'Building habits' },
]
const phrases = {
  support: [{ id: 'talk', label: 'Could we talk for a few minutes?' }],
  celebrate: [{ id: 'win', label: 'Something went well for me today. I wanted you to know.' }],
}

beforeEach(() => {
  localStorage.clear()
  calls = []
  save(ACCOUNT_KEY, 's1.k.sess.sig')
  saveJSON('pi.account.me', { id: 'acc-ama', name: 'Ama', handle: 'ama', suggest: true, connect: true, sync: false } satisfies AccountView)
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null }
    calls.push(c)
    if (url === '/api/circle') return json(200, circle)
    if (url === '/api/shares' && c.method === 'GET') return json(200, { themes, received: [], sent: [] })
    if (url === '/api/shares' && c.method === 'POST') return json(201, { id: 'sh1' })
    if (url === '/api/reachouts' && c.method === 'GET') return json(200, { phrases, received: [] })
    if (url === '/api/reachouts' && c.method === 'POST') return json(201, { status: 'sent' })
    return json(404, { error: 'not_found' })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('sharing an insight', () => {
  it('sends the exact approved words to the friends picked, and nothing else', async () => {
    render(<ShareComposer kind="helped" text="A short walk before replying helped me think." onDone={() => {}} onCancel={() => {}} />)
    const words = await screen.findByLabelText('What your friends will see')
    expect(words).toHaveValue('A short walk before replying helped me think.')
    fireEvent.change(words, { target: { value: 'A short walk before replying helped me think more clearly.' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Managing stress' }))
    const share = screen.getByRole('button', { name: /^Share/ })
    expect(share).toBeDisabled() // no one picked yet: private by default
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Kofi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share with 1 friend' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/shares' && c.method === 'POST')).toBe(true))
    const sent = calls.find((c) => c.url === '/api/shares' && c.method === 'POST')!.body
    expect(sent).toEqual({ kind: 'helped', theme: 'managing-stress', text: 'A short walk before replying helped me think more clearly.', to: ['f-kofi'] })
    expect(await screen.findByRole('status')).toHaveTextContent('Shared with Kofi. You can withdraw it any time in Connect.')
    // A move towards a friend, noted on this phone for the Mirror: the kind and the day, never who.
    expect(localStorage.getItem('pi.connection.v1')).toMatch(/"k":"share"/)
    expect(localStorage.getItem('pi.connection.v1')).not.toContain('kofi')
  })

  it('offers only friends who are not muted', async () => {
    render(<ShareComposer kind="win" text="I kept my walk going all week." onDone={() => {}} onCancel={() => {}} />)
    expect(await screen.findByRole('checkbox', { name: 'Sarah' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Joel' })).not.toBeInTheDocument()
  })
})

describe('reaching out', () => {
  it('sends one fixed phrase to one friend, and never asks them to reply', async () => {
    render(<ReachOutPicker kind="support" onDone={() => {}} onCancel={() => {}} />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Kofi' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Could we talk for a few minutes?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/reachouts' && c.method === 'POST')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ to: 'f-kofi', kind: 'support', phrase: 'talk' })
    expect(await screen.findByRole('status')).toHaveTextContent('Sent to Kofi. They are not asked to reply.')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('after a reflection', () => {
  it('offers to share what is going well, and is gone with “Not now”', () => {
    render(<AfterReflection group="strength" answer="I kept my walk going all week." />)
    const offer = screen.getByRole('group', { name: 'Closer together' })
    expect(within(offer).getByRole('button', { name: 'Share a win' })).toBeInTheDocument()
    fireEvent.click(within(offer).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByRole('group', { name: 'Closer together' })).not.toBeInTheDocument()
  })

  it('offers to share what helped after something learnt', () => {
    render(<AfterReflection group="learnt" answer="Pausing before I reply helps." />)
    expect(screen.getByRole('button', { name: 'Share what helped' })).toBeInTheDocument()
  })

  it('offers to ask for support after a hard one', () => {
    render(<AfterReflection group="grow" answer="I kept everything to myself this week." />)
    expect(screen.getByRole('button', { name: 'Ask someone for support' })).toBeInTheDocument()
  })

  it('offers nothing when not signed in', () => {
    localStorage.clear()
    render(<AfterReflection group="strength" answer="I kept my walk going all week." />)
    expect(screen.queryByRole('group', { name: 'Closer together' })).not.toBeInTheDocument()
  })
})
