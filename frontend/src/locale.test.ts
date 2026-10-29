import { afterEach, describe, expect, it } from 'vitest'
import { clock } from './day'
import { clockAt, dateOf, language, numberOf, setLocale } from './locale'

afterEach(() => setLocale('en-GB'))

describe("the phone's own way of writing times and dates", () => {
  it('keeps the 24-hour clock and day-first dates by default', () => {
    expect(clock(17 * 60)).toBe('17:00')
    expect(clockAt(5 * 60 + 30)).toBe('05:30')
    expect(dateOf('2026-10-27', { day: 'numeric', month: 'long' })).toBe('27 October')
  })

  it('writes them the American way on an American phone', () => {
    setLocale('en-US')
    expect(clock(17 * 60)).toBe('5:00 PM')
    expect(dateOf('2026-10-27', { day: 'numeric', month: 'long' })).toBe('October 27')
    expect(numberOf(12345)).toBe('12,345')
  })

  it('follows other languages too, and ignores a broken tag', () => {
    setLocale('es-MX')
    expect(language()).toBe('es')
    expect(dateOf('2026-10-27', { day: 'numeric', month: 'long' })).toBe('27 de octubre')
    setLocale('not a locale!!')
    expect(language()).toBe('es')
  })
})
