import { getPulse, hasPulse, noteCount, PULSE_MIN, sameAs, shareOf } from './pulse'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('the Human Pulse', () => {
  it('reads the counts the server keeps, and nothing when it cannot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('q1')
          ? new Response(JSON.stringify({ questionId: 'q1', totalVotes: 40, options: [{ optionId: 'a', count: 10, percent: 25 }] }))
          : new Response(JSON.stringify({ error: 'private_question' }), { status: 403 }),
      ),
    )
    expect(await getPulse('q1')).toEqual({ questionId: 'q1', total: 40, options: [{ optionId: 'a', count: 10, percent: 25 }] })
    expect(await getPulse('q2')).toBeNull()
  })

  it('never shows a split under the minimum, so no one can work out another answer', () => {
    const few = { questionId: 'q', total: PULSE_MIN - 1, options: [{ optionId: 'a', count: 1, percent: 5.3 }] }
    expect(shareOf(few, 'a')).toBeNull()
    expect(shareOf({ ...few, total: PULSE_MIN }, 'a')).toBe(5.3)
  })

  it('leaves out intimacy and regional questions', () => {
    expect(hasPulse({ id: 'a', prompt: '', options: [], care: 'intimate' })).toBe(false)
    expect(hasPulse({ id: 'b', prompt: '', options: [], local: true })).toBe(false)
    expect(hasPulse({ id: 'c', prompt: '', options: [] })).toBe(true)
  })

  it('puts a share into plain words', () => {
    expect(sameAs(23)).toBe('About one in four made the same choice you did.')
    expect(sameAs(50)).toBe('About half made the same choice you did.')
    expect(sameAs(3)).toMatch(/^Few people/)
  })

  it('counts the change only between two real fetches about a minute apart', () => {
    expect(noteCount('q', 100, 0)).toBeNull()
    expect(noteCount('q', 131, 60_000)).toBe(31)
    expect(noteCount('q', 140, 70_000)).toBeNull() // too soon to call it a minute
    expect(noteCount('q', 150, 10 * 60_000)).toBeNull() // too long ago
  })
})
