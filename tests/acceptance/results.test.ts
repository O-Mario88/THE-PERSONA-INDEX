import type { ApiError, QuestionResults } from '@/server/contracts'
import { get, makeApp, postVote } from './helpers'

async function readResults(app: ReturnType<typeof makeApp>, questionId: string) {
  const res = await app.results(get(`/api/questions/${questionId}/results`), questionId)
  return { res, body: (await res.json()) as QuestionResults }
}

describe('GET /api/questions/:questionId/results', () => {
  it('reports real zeros, not invented numbers, before anyone votes', async () => {
    const { res, body } = await readResults(makeApp(), 'q-bill')

    expect(res.status).toBe(200)
    expect(body).toEqual({
      questionId: 'q-bill',
      totalVotes: 0,
      options: [
        { optionId: 'even', count: 0, percent: 0 },
        { optionId: 'itemised', count: 0, percent: 0 },
      ],
    })
  })

  it('reflects accepted votes once the aggregation worker has run', async () => {
    const app = makeApp()
    await app.castVote(postVote({ questionId: 'q-dishes', optionId: 'right-away', voterId: 'a' }, 'k1'))
    await app.castVote(postVote({ questionId: 'q-dishes', optionId: 'right-away', voterId: 'b' }, 'k2'))
    await app.castVote(postVote({ questionId: 'q-dishes', optionId: 'when-full', voterId: 'c' }, 'k3'))
    await app.castVote(postVote({ questionId: 'q-dishes', optionId: 'end-of-day', voterId: 'd' }, 'k4'))
    await app.runAggregation()

    const { body } = await readResults(app, 'q-dishes')
    expect(body.totalVotes).toBe(4)
    expect(body.options).toEqual([
      { optionId: 'right-away', count: 2, percent: 50 },
      { optionId: 'end-of-day', count: 1, percent: 25 },
      { optionId: 'when-full', count: 1, percent: 25 },
    ])
  })

  it('does not double count when the worker runs twice', async () => {
    const app = makeApp()
    await app.castVote(postVote({ questionId: 'q-alarm', optionId: 'one', voterId: 'a' }, 'k1'))
    await app.runAggregation()
    await app.runAggregation()

    const { body } = await readResults(app, 'q-alarm')
    expect(body.totalVotes).toBe(1)
  })

  it('is publicly cacheable for a short time', async () => {
    const { res } = await readResults(makeApp(), 'q-bill')

    const cache = res.headers.get('cache-control') ?? ''
    expect(cache).toContain('public')
    expect(cache).toMatch(/s-maxage=\d+/)
  })

  it('returns 404 for an unknown question', async () => {
    const res = await makeApp().results(get('/api/questions/q-nope/results'), 'q-nope')

    expect(res.status).toBe(404)
    expect(((await res.json()) as ApiError).error).toBe('unknown_question')
  })
})
