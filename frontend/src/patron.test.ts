import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FREE_TRIES, freeLeft, isPatron, noteFreeTry, patronStatus, refreshPatron, savePatron, testPurchase } from './patron'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

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

describe('asking the server', () => {
  it('keeps what the server says, asked with the account when signed in', async () => {
    localStorage.setItem('pi.account.v1', 'acct-token')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ plan: 'duo_yearly', until: '2027-10-28', via: 'duo', foundingLeft: 812, test: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await refreshPatron()).toEqual({ plan: 'duo_yearly', until: '2027-10-28', via: 'duo', foundingLeft: 812, test: true })
    expect(patronStatus()).toEqual({ plan: 'duo_yearly', until: '2027-10-28', via: 'duo' })
    expect(fetch).toHaveBeenCalledWith('/api/patron', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Account acct-token' }) }))
  })

  it('keeps the last word it had when the server can’t be reached', async () => {
    savePatron({ plan: 'monthly', until: '2026-11-28' })
    localStorage.setItem('pi.device.v1', 'device-token')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await refreshPatron()).toBeNull()
    expect(patronStatus()).toEqual({ plan: 'monthly', until: '2026-11-28' })
  })

  it('makes a test purchase with this phone’s pass, and keeps the result', async () => {
    localStorage.setItem('pi.device.v1', 'device-token')
    const fetch = vi.fn(async () => new Response(JSON.stringify({ plan: 'founding', until: '', foundingLeft: 999, test: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await testPurchase('founding')
    expect(patronStatus()).toEqual({ plan: 'founding', until: null })
    expect(fetch).toHaveBeenCalledWith('/api/patron/test', expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan: 'founding' }) }))
  })
})
