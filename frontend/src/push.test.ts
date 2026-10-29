import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushState, savePush, shouldAskPush, markPushAsked, PUSH_ASK } from './push'
import { signOut } from './social'

// Edwin, 2026-10-29: "tackle that now" — a quiet notice when someone you
// trust shares with you or replies. Offered once, at a moment it makes sense
// (you have someone to hear from), and only on when the person says yes.

describe('offering notices', () => {
  beforeEach(() => localStorage.clear())

  it('offers only to someone with a person to hear from, who has not decided', () => {
    expect(shouldAskPush(pushState(), 0)).toBe(false)
    expect(shouldAskPush(pushState(), 1)).toBe(true)
  })

  it('asks once: Not now, on or off all settle it', () => {
    markPushAsked('2026-10-29')
    expect(shouldAskPush(pushState(), 2)).toBe(false)
    localStorage.clear()
    savePush({ on: false })
    expect(shouldAskPush(pushState(), 2)).toBe(false)
    savePush({ on: true, token: 'ExponentPushToken[x]' })
    expect(shouldAskPush(pushState(), 2)).toBe(false)
  })

  it('reads anything unexpected on the phone as not decided and off', () => {
    localStorage.setItem('pi.push.v1', '{"on":"yes"}')
    expect(pushState()).toEqual({})
  })

  it('says what a notice will and won’t show', () => {
    expect(PUSH_ASK).toContain('never their words')
  })
})

describe('signing out', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('takes this phone’s address back first, so notices stop for that person', async () => {
    localStorage.setItem('pi.account.v1', 's1.pass')
    savePush({ on: true, token: 'ExponentPushToken[x]' })
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push(`${init.method} ${url}`)
        return new Response(null, { status: 204 })
      }),
    )
    await signOut('current')
    expect(calls).toEqual(['DELETE /api/push', 'DELETE /api/account/sessions/current'])
    expect(pushState()).toEqual({ on: false })
  })
})
