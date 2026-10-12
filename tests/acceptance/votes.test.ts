import type { ApiError, VoteAccepted } from '@/server/contracts'
import { get, makeApp, postVote } from './helpers'

// PLACEHOLDER duplicate rule: one vote per question per voterId.
// Update these tests when the real rule (browser/day, account, or token) is decided.

const vote = { questionId: 'q-dishes', optionId: 'right-away', voterId: 'voter-a' }

async function totalVotes(app: ReturnType<typeof makeApp>, questionId: string) {
  await app.runAggregation()
  const res = await app.results(get(`/api/questions/${questionId}/results`), questionId)
  return ((await res.json()) as { totalVotes: number }).totalVotes
}

describe('POST /api/votes', () => {
  it('accepts a valid vote with 202 and an event id', async () => {
    const res = await makeApp().castVote(postVote(vote, 'key-1'))

    expect(res.status).toBe(202)
    const body = (await res.json()) as VoteAccepted
    expect(body.status).toBe('accepted')
    expect(body.eventId).toEqual(expect.any(String))
    expect(body.eventId.length).toBeGreaterThan(0)
  })

  it('is never cached', async () => {
    const res = await makeApp().castVote(postVote(vote, 'key-1'))

    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('treats a retry with the same Idempotency-Key as the same vote', async () => {
    const app = makeApp()
    const first = (await (await app.castVote(postVote(vote, 'key-1'))).json()) as VoteAccepted
    const retry = await app.castVote(postVote(vote, 'key-1'))

    expect(retry.status).toBe(202)
    expect(((await retry.json()) as VoteAccepted).eventId).toBe(first.eventId)
    expect(await totalVotes(app, 'q-dishes')).toBe(1)
  })

  it('rejects a second vote by the same voter on the same question with 409', async () => {
    const app = makeApp()
    await app.castVote(postVote(vote, 'key-1'))
    const dup = await app.castVote(postVote({ ...vote, optionId: 'when-full' }, 'key-2'))

    expect(dup.status).toBe(409)
    expect(((await dup.json()) as ApiError).error).toBe('duplicate_vote')
    expect(await totalVotes(app, 'q-dishes')).toBe(1)
  })

  it('lets the same voter answer a different question', async () => {
    const app = makeApp()
    await app.castVote(postVote(vote, 'key-1'))
    const other = await app.castVote(postVote({ questionId: 'q-bill', optionId: 'even', voterId: 'voter-a' }, 'key-2'))

    expect(other.status).toBe(202)
  })

  it('requires an Idempotency-Key header', async () => {
    const res = await makeApp().castVote(postVote(vote))

    expect(res.status).toBe(400)
    expect(((await res.json()) as ApiError).error).toBe('missing_idempotency_key')
  })

  it('rejects malformed bodies with 400', async () => {
    const app = makeApp()
    for (const body of ['not json', {}, { questionId: 'q-dishes', optionId: 'right-away' }]) {
      const res = await app.castVote(postVote(body, `key-${JSON.stringify(body)}`))
      expect(res.status).toBe(400)
      expect(((await res.json()) as ApiError).error).toBe('invalid_request')
    }
  })

  it('rejects an unknown question with 404', async () => {
    const res = await makeApp().castVote(postVote({ ...vote, questionId: 'q-nope' }, 'key-1'))

    expect(res.status).toBe(404)
    expect(((await res.json()) as ApiError).error).toBe('unknown_question')
  })

  it('rejects an option that does not belong to the question with 400', async () => {
    const res = await makeApp().castVote(postVote({ ...vote, optionId: 'even' }, 'key-1'))

    expect(res.status).toBe(400)
    expect(((await res.json()) as ApiError).error).toBe('unknown_option')
  })
})
