import { beforeEach, describe, expect, it } from 'vitest'
import { acceptError, inviteCodeIn, keepInvite, pendingInvite } from './invites'
import { dropInvite } from './social'

// Found on the iPhone, 2026-10-29: the app made and shared invite links, but
// nothing in the app could follow one. These are the pieces that let a person
// open an invite from a link or paste one in, and keep it until they accept.

describe('reading an invite', () => {
  it('finds the code in a shared link, an app link, an old ?invite= link, or the bare code', () => {
    expect(inviteCodeIn('https://personaindex.com/c/m5c73ht28d')).toBe('m5c73ht28d')
    expect(inviteCodeIn('Join my circle on The Persona Index: https://personaindex.com/c/m5c73ht28d')).toBe('m5c73ht28d')
    expect(inviteCodeIn('personaindex://c/m5c73ht28d')).toBe('m5c73ht28d')
    expect(inviteCodeIn('http://localhost:8091/?invite=m5c73ht28d')).toBe('m5c73ht28d')
    expect(inviteCodeIn('  M5C73HT28D ')).toBe('m5c73ht28d')
  })

  it('finds nothing in text that holds no invite', () => {
    expect(inviteCodeIn('')).toBeNull()
    expect(inviteCodeIn('hello there')).toBeNull()
    expect(inviteCodeIn('https://personaindex.com/c/short')).toBeNull()
    expect(inviteCodeIn('https://personaindex.com/c/m5c73ht28d0extra')).toBeNull()
  })
})

describe('keeping an invite until the person accepts', () => {
  beforeEach(() => localStorage.clear())

  it('keeps one invite on this device and forgets it once dropped', () => {
    expect(pendingInvite()).toBeNull()
    keepInvite('m5c73ht28d')
    expect(pendingInvite()).toBe('m5c73ht28d')
    dropInvite()
    expect(pendingInvite()).toBeNull()
  })

  it('ignores anything stored that is not an invite code', () => {
    localStorage.setItem('pi.invite', 'not a code')
    expect(pendingInvite()).toBeNull()
  })
})

describe('when accepting does not work', () => {
  it('says why in plain words', () => {
    expect(acceptError('no_invite')).toBe('That invite has expired or was already used. Ask them for a new link.')
    expect(acceptError('own_invite')).toBe('That’s your own invite link. Send it to someone you trust.')
    expect(acceptError('name_needed')).toBe('Add your name in You first, so they know who you are.')
    expect(acceptError('unavailable')).toBe('That didn’t go through. Try again in a moment.')
  })
})
