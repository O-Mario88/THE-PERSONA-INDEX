import { dayAt, EVENING_HOUR, eveningStart, isEvening, isSaturday, localDate, nextTurn } from './day'
import { loadMoves, moveFor, movesOn, setMoveStatus, startMove, startedInEvening } from './moves'

describe('the local day', () => {
  it("uses the phone's own date, not UTC", () => {
    expect(localDate(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('knows Saturday, the day before the review day', () => {
    expect(isSaturday('2026-10-17')).toBe(true)
    expect(isSaturday('2026-10-18')).toBe(false)
  })

  it('turns to evening at 4 pm local time', () => {
    expect(EVENING_HOUR).toBe(16)
    expect(isEvening(new Date(2026, 9, 12, 15, 59))).toBe(false)
    expect(isEvening(new Date(2026, 9, 12, 16, 0))).toBe(true)
    expect(eveningStart('2026-10-12')).toBe(new Date(2026, 9, 12, 16, 0).getTime())
  })

  it('turns by itself: to evening at 4 pm, then to the next day at midnight', () => {
    expect(dayAt(new Date(2026, 9, 12, 9))).toEqual({ date: '2026-10-12', evening: false })
    expect(dayAt(new Date(2026, 9, 12, 23, 59))).toEqual({ date: '2026-10-12', evening: true })
    expect(dayAt(new Date(2026, 9, 13, 0, 0))).toEqual({ date: '2026-10-13', evening: false })
    expect(nextTurn(new Date(2026, 9, 12, 9))).toBe(new Date(2026, 9, 12, 16).getTime())
    expect(nextTurn(new Date(2026, 9, 12, 16))).toBe(new Date(2026, 9, 13, 0).getTime())
    expect(nextTurn(new Date(2026, 9, 31, 20))).toBe(new Date(2026, 10, 1, 0).getTime())
  })
})

describe('moves', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a move per card, with how it went', () => {
    startMove('2026-10-12', 'q1', 'a', 'Step one', new Date(2026, 9, 12, 9).getTime())
    startMove('2026-10-12', 'q2', 'b', 'Step two', new Date(2026, 9, 12, 17).getTime())
    startMove('2026-10-12', 'q2', 'c', 'Step two again') // already started: kept as it was
    expect(movesOn('2026-10-12').map((m) => [m.questionId, m.optionId, m.step, m.status])).toEqual([
      ['q1', 'a', 'Step one', 'started'],
      ['q2', 'b', 'Step two', 'started'],
    ])
    setMoveStatus('q1', 'helped')
    setMoveStatus('q1', 'no_change')
    expect(moveFor('q1')?.status).toBe('no_change')
    setMoveStatus('q9', 'helped') // no such move: nothing happens
    expect(loadMoves()).toHaveLength(2)
  })

  it('knows a move started in the evening sitting, which the check-in leaves for later', () => {
    startMove('2026-10-12', 'q1', 'a', 'Step one', new Date(2026, 9, 12, 9).getTime())
    startMove('2026-10-12', 'q2', 'b', 'Step two', new Date(2026, 9, 12, 16, 5).getTime())
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
