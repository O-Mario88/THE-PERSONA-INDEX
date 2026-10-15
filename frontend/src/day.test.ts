import { EVENING_HOUR, eveningStart, isEvening, localDate } from './day'
import { awardEvening, awardReflection, loadGame, loadMoves, moveFor, movesOn, setMoveStatus, startMove } from './game'

describe('the local day', () => {
  it("uses the phone's own date, not UTC", () => {
    expect(localDate(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('turns to evening at 5 pm local time', () => {
    expect(EVENING_HOUR).toBe(17)
    expect(isEvening(new Date(2026, 9, 12, 16, 59))).toBe(false)
    expect(isEvening(new Date(2026, 9, 12, 17, 0))).toBe(true)
    expect(eveningStart('2026-10-12')).toBe(new Date(2026, 9, 12, 17, 0).getTime())
  })
})

describe('moves', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a move per card, and trying it earns points once', () => {
    startMove('2026-10-12', 'q1', 'a', 'Step one')
    startMove('2026-10-12', 'q2', 'b', 'Step two')
    startMove('2026-10-12', 'q2', 'c', 'Step two again') // already started: kept as it was
    expect(movesOn('2026-10-12')).toEqual([
      { date: '2026-10-12', questionId: 'q1', optionId: 'a', step: 'Step one', status: 'started' },
      { date: '2026-10-12', questionId: 'q2', optionId: 'b', step: 'Step two', status: 'started' },
    ])
    expect(setMoveStatus('q1', 'helped')).toBe(5)
    expect(setMoveStatus('q1', 'no_change')).toBe(0)
    expect(setMoveStatus('q2', 'not_tried')).toBe(0)
    expect(moveFor('q1')?.status).toBe('no_change')
    expect(setMoveStatus('q9', 'helped')).toBe(0) // no such move
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
  })

  it('awards evening reflections and the finished day once each, without counting them as insights', () => {
    expect(awardReflection('q1')).toBe(10)
    expect(awardReflection('q1')).toBe(0)
    expect(awardEvening('2026-10-12')).toBe(20)
    expect(awardEvening('2026-10-12')).toBe(0)
    expect(loadGame()).toMatchObject({ points: 30, insights: 0 })
  })
})
