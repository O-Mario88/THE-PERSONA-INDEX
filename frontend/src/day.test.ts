import { EVENING_HOUR, eveningStart, isEvening, localDate } from './day'
import { awardEvening, awardReflection, loadGame, markMove, movesThisWeek, pickMove, todaysMove } from './game'

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

  it('keeps one move a day, and trying it earns points once', () => {
    pickMove('2026-10-12', 'q1', 'Step one')
    pickMove('2026-10-12', 'q2', 'Step two')
    expect(todaysMove('2026-10-12')).toEqual({ date: '2026-10-12', questionId: 'q2', step: 'Step two' })
    expect(markMove('2026-10-12', true)).toBe(5)
    expect(markMove('2026-10-12', true)).toBe(0)
    expect(todaysMove('2026-10-12')?.tried).toBe(true)
    expect(markMove('2026-10-13', true)).toBe(0) // no move picked that day
  })

  it('counts the moves picked and tried in the last 7 days', () => {
    pickMove('2026-10-01', 'a', 'old')
    markMove('2026-10-01', true)
    pickMove('2026-10-10', 'b', 'x')
    markMove('2026-10-10', true)
    pickMove('2026-10-11', 'c', 'y')
    markMove('2026-10-11', false)
    pickMove('2026-10-12', 'd', 'z')
    expect(movesThisWeek('2026-10-12')).toEqual({ picked: 3, tried: 1 })
  })

  it('awards evening reflections and the finished day once each, without counting them as insights', () => {
    expect(awardReflection('q1')).toBe(10)
    expect(awardReflection('q1')).toBe(0)
    expect(awardEvening('2026-10-12')).toBe(20)
    expect(awardEvening('2026-10-12')).toBe(0)
    expect(loadGame()).toMatchObject({ points: 30, insights: 0 })
  })
})
