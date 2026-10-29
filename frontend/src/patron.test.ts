import { beforeEach, describe, expect, it } from 'vitest'
import { FREE_TRIES, freeLeft, isPatron, noteFreeTry, patronStatus, savePatron } from './patron'

beforeEach(() => localStorage.clear())

// Edwin's brief of 2026-10-29: a few Patron features can be tried for free
// first, and Patron itself is whatever the server last said this account or
// phone holds.
describe('Patron on this phone', () => {
  it('is nobody until the server says so, and ends the day after a plan or pass runs out', () => {
    expect(isPatron('2026-10-29')).toBe(false)
    savePatron({ plan: 'pass_90', until: '2026-11-30' })
    expect(isPatron('2026-11-30')).toBe(true)
    expect(isPatron('2026-12-01')).toBe(false)
    savePatron({ plan: 'founding', until: null })
    expect(isPatron('2031-01-01')).toBe(true)
  })

  it('reads a damaged or unknown copy as no Patron, never as Patron', () => {
    localStorage.setItem('pi.patron.v1', '{"plan":"free-for-life","until":null}')
    expect(patronStatus()).toEqual({ plan: null, until: null })
    localStorage.setItem('pi.patron.v1', 'not json')
    expect(isPatron('2026-10-29')).toBe(false)
  })

  it('counts each feature’s free tries on this phone, and never below none', () => {
    expect(freeLeft('voice')).toBe(FREE_TRIES.voice)
    for (let i = 0; i < 5; i++) noteFreeTry('voice')
    expect(freeLeft('voice')).toBe(0)
    expect(freeLeft('sheet')).toBe(FREE_TRIES.sheet)
  })
})
