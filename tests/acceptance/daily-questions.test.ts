import type { TodayQuestionsResponse } from '@/server/contracts'
import { TODAY, todaySet } from '../fixtures/questions'
import { get, makeApp } from './helpers'

describe('GET /api/questions/today', () => {
  it("returns today's 3 questions in order", async () => {
    const res = await makeApp().todayQuestions(get('/api/questions/today'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as TodayQuestionsResponse
    expect(body.date).toBe(TODAY)
    expect(body.questions).toHaveLength(3)
    expect(body.questions.map((q) => q.id)).toEqual(['q-dishes', 'q-bill', 'q-alarm'])
  })

  it('gives every question a prompt and at least two options', async () => {
    const body = (await (await makeApp().todayQuestions(get('/api/questions/today'))).json()) as TodayQuestionsResponse

    expect(body).toEqual(todaySet)
    for (const q of body.questions) {
      expect(q.prompt.length).toBeGreaterThan(0)
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('is publicly cacheable at the edge', async () => {
    const res = await makeApp().todayQuestions(get('/api/questions/today'))

    const cache = res.headers.get('cache-control') ?? ''
    expect(cache).toContain('public')
    expect(cache).toMatch(/s-maxage=\d+/)
  })
})
