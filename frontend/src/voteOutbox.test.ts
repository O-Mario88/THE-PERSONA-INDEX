import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, sendUnvoted, sendVote, unsentVotes } from './api'

// Found in the 2026-10-29 audit as a new US user: when the server could not
// take an answer (offline, busy, or too many new phones on one network), the
// sitting stopped on "Your answer did not go through". An answer is the
// person's own and is kept on the phone at once; the server gets it now or the
// next time the app opens, with the same key, so it never counts twice.

type Call = { url: string; key: string | null; body: Record<string, unknown> }

function server(replies: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === '/api/device') return new Response(JSON.stringify({ token: 'v2.pass' }), { status: 201 })
      const headers = (init.headers ?? {}) as Record<string, string>
      calls.push({ url, key: headers['Idempotency-Key'] ?? null, body: JSON.parse(String(init.body ?? '{}')) })
      const r = replies.shift() ?? { status: 201, body: { status: 'accepted', eventId: 'e' } }
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status })
    }),
  )
  return calls
}

describe('an answer the server could not take yet', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('is kept and sent again later with the same key, when the server was busy or unreachable', async () => {
    const calls = server([{ status: 429, body: { error: 'rate_limited' } }])
    const r = await sendVote('q1', 'a', 'key-1', 'morning', false)
    expect(r).toBe('later')
    expect(unsentVotes()).toEqual(['q1'])
    await sendUnvoted()
    expect(calls.map((c) => c.key)).toEqual(['key-1', 'key-1'])
    expect(calls[1].body).toMatchObject({ questionId: 'q1', optionId: 'a', sitting: 'morning', count: false })
    expect(unsentVotes()).toEqual([])
  })

  it('keeps it when there is no connection at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await sendVote('q2', 'b', 'key-2')).toBe('later')
    expect(unsentVotes()).toEqual(['q2'])
  })

  it('says sent when the server takes it, and keeps nothing waiting', async () => {
    server([])
    expect(await sendVote('q3', 'c', 'key-3')).toBe('sent')
    expect(unsentVotes()).toEqual([])
  })

  it('lets a clear refusal through to the screen, and never sends it again', async () => {
    server([{ status: 409, body: { error: 'duplicate_vote' } }])
    await expect(sendVote('q4', 'd', 'key-4')).rejects.toBeInstanceOf(ApiError)
    expect(unsentVotes()).toEqual([])
  })

  it('drops a waiting answer the server later refuses outright', async () => {
    server([{ status: 503 }, { status: 400, body: { error: 'invalid_request' } }])
    expect(await sendVote('q5', 'e', 'key-5')).toBe('later')
    await sendUnvoted()
    expect(unsentVotes()).toEqual([])
  })
})
