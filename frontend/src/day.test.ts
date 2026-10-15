import { dayAt, isEvening, isSaturday, localDate, MORNING_CLOSES, morningEnd, nextTurn, sittingAt, opensAt } from './day'
import { loadMoves, moveFor, movesOn, sendUnsent, setMoveStatus, startMove, startedInEvening } from './moves'

describe('the local day', () => {
  it("uses the phone's own date, not UTC", () => {
    expect(localDate(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('knows Saturday, the day before the review day', () => {
    expect(isSaturday('2026-10-17')).toBe(true)
    expect(isSaturday('2026-10-18')).toBe(false)
  })

  // Edwin, 2026-10-15: "from 5:00 AM to 4:30 PM first 3 questions and from
  // 5:00 PM and disappear at 12:00AM".
  it('has two sittings: the morning from 5 am to 4:30 pm, the evening from 5 pm to midnight', () => {
    const at = (h: number, m = 0) => sittingAt(new Date(2026, 9, 12, h, m))
    expect(at(0)).toBe('night')
    expect(at(4, 59)).toBe('night')
    expect(at(5)).toBe('morning')
    expect(at(16, 29)).toBe('morning')
    expect(at(16, 30)).toBe('pause')
    expect(at(16, 59)).toBe('pause')
    expect(at(17)).toBe('evening')
    expect(at(23, 59)).toBe('evening')
    expect(MORNING_CLOSES).toBe(16 * 60 + 30)
  })

  it('counts everything after the morning closes as the evening', () => {
    expect(isEvening(new Date(2026, 9, 12, 16, 29))).toBe(false)
    expect(isEvening(new Date(2026, 9, 12, 16, 30))).toBe(true)
    expect(isEvening(new Date(2026, 9, 12, 2))).toBe(false)
    expect(morningEnd('2026-10-12')).toBe(new Date(2026, 9, 12, 16, 30).getTime())
  })

  it('names when each sitting opens', () => {
    expect(opensAt('morning')).toBe('5 am')
    expect(opensAt('evening')).toBe('5 pm')
  })

  it('turns by itself at 5 am, 4:30 pm, 5 pm and midnight', () => {
    expect(dayAt(new Date(2026, 9, 12, 9))).toEqual({ date: '2026-10-12', sitting: 'morning' })
    expect(dayAt(new Date(2026, 9, 12, 23, 59))).toEqual({ date: '2026-10-12', sitting: 'evening' })
    expect(dayAt(new Date(2026, 9, 13, 0, 0))).toEqual({ date: '2026-10-13', sitting: 'night' })
    expect(nextTurn(new Date(2026, 9, 12, 1))).toBe(new Date(2026, 9, 12, 5).getTime())
    expect(nextTurn(new Date(2026, 9, 12, 9))).toBe(new Date(2026, 9, 12, 16, 30).getTime())
    expect(nextTurn(new Date(2026, 9, 12, 16, 40))).toBe(new Date(2026, 9, 12, 17).getTime())
    expect(nextTurn(new Date(2026, 9, 12, 17))).toBe(new Date(2026, 9, 13, 0).getTime())
    expect(nextTurn(new Date(2026, 9, 31, 20))).toBe(new Date(2026, 10, 1, 0).getTime())
  })
})

describe('small steps', () => {
  let sent: { questionId: string; optionId: string; status: string; date: string }[]
  let fail = false
  beforeEach(() => {
    localStorage.clear()
    sent = []
    fail = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/device') return new Response(JSON.stringify({ token: 'v2.k.d.s' }), { status: 201 })
        if (fail) return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 })
        sent.push(JSON.parse(String(init?.body)))
        return new Response(JSON.stringify({ status: 'saved' }), { status: 200 })
      }),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a step per card, with how it went, on the phone and on the server', async () => {
    await startMove('2026-10-12', 'q1', 'a', 'Step one', new Date(2026, 9, 12, 9).getTime())
    await startMove('2026-10-12', 'q2', 'b', 'Step two', new Date(2026, 9, 12, 17).getTime())
    await startMove('2026-10-12', 'q2', 'c', 'Step two again') // already started: kept as it was
    expect(movesOn('2026-10-12').map((m) => [m.questionId, m.optionId, m.step, m.status])).toEqual([
      ['q1', 'a', 'Step one', 'started'],
      ['q2', 'b', 'Step two', 'started'],
    ])
    await setMoveStatus('q1', 'helped', '2026-10-12')
    await setMoveStatus('q1', 'no_change', '2026-10-12')
    expect(moveFor('q1')?.status).toBe('no_change')
    await setMoveStatus('q9', 'helped', '2026-10-12') // no such step: nothing happens
    expect(loadMoves()).toHaveLength(2)
    expect(sent.map((b) => [b.questionId, b.optionId, b.status])).toEqual([
      ['q1', 'a', 'started'],
      ['q2', 'b', 'started'],
      ['q1', 'a', 'helped'],
      ['q1', 'a', 'no_change'],
    ])
    expect(loadMoves().some((m) => m.unsent)).toBe(false)
  })

  it('sends a step again the next time the app opens when the server could not take it', async () => {
    fail = true
    await expect(startMove('2026-10-12', 'q1', 'a', 'Step one')).rejects.toThrow()
    expect(moveFor('q1')).toMatchObject({ status: 'started', unsent: true })
    fail = false
    await sendUnsent('2026-10-13')
    expect(sent).toEqual([expect.objectContaining({ questionId: 'q1', status: 'started', date: '2026-10-13' })])
    expect(moveFor('q1')?.unsent).toBeUndefined()
  })

  it('keeps a step started from the mirror, which this phone never had', async () => {
    await setMoveStatus('q7', 'helped', '2026-10-18', { optionId: 'o', step: 'Call one friend', date: '2026-10-14' })
    expect(moveFor('q7')).toMatchObject({ date: '2026-10-14', status: 'helped', step: 'Call one friend' })
  })

  it('knows a step started in the evening sitting, which the evening leaves for the mirror', async () => {
    await startMove('2026-10-12', 'q1', 'a', 'Step one', new Date(2026, 9, 12, 9).getTime())
    await startMove('2026-10-12', 'q2', 'b', 'Step two', new Date(2026, 9, 12, 17, 5).getTime())
    const [morning, evening] = movesOn('2026-10-12')
    expect(startedInEvening(morning)).toBe(false)
    expect(startedInEvening(evening)).toBe(true)
  })

  it('reads moves saved before several a day, counting a tried one as tried but never as helped', () => {
    localStorage.setItem(
      'pi.moves.v1',
      JSON.stringify([
        { date: '2026-10-10', questionId: 'a', step: 'x', tried: true },
        { date: '2026-10-11', questionId: 'b', step: 'y', tried: false },
        { date: '2026-10-12', questionId: 'c', step: 'z' },
      ]),
    )
    expect(loadMoves().map((m) => [m.questionId, m.optionId, m.status])).toEqual([
      ['a', '', 'no_change'],
      ['b', '', 'not_tried'],
      ['c', '', 'started'],
    ])
    // A move saved before start times were kept counts as a morning one.
    expect(startedInEvening(loadMoves()[2])).toBe(false)
  })
})
