import { get, makeApp } from './helpers'

describe('GET /api/health', () => {
  it('returns 200 with {"status":"ok"}', async () => {
    const res = await makeApp().health(get('/api/health'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await res.text()).toBe('{"status":"ok"}')
  })
})
