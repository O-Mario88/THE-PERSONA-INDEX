import { beforeEach, describe, expect, it } from 'vitest'
import { APPLOCK_KEY, appLock, needsUnlock, NO_LOCK, parseAppLock, pinOpens, RELOCK_AFTER_MS, saveAppLock, sealPin, validPin } from './appLock'

beforeEach(() => localStorage.clear())

// Edwin's brief, 2026-10-29: the privacy curtain. "Opening the app, or
// switching back to it after more than 30 seconds" asks for the phone's own
// check; a guest PIN opens an empty space instead of the person's own.
describe('the app lock', () => {
  it('is off until the person turns it on, and a damaged copy reads as off', () => {
    expect(appLock()).toEqual(NO_LOCK)
    localStorage.setItem(APPLOCK_KEY, '{"on":"yes","icon":"rocket"}')
    expect(appLock()).toEqual(NO_LOCK)
    saveAppLock({ ...NO_LOCK, on: true, cover: true, icon: 'pebble' })
    expect(appLock()).toMatchObject({ on: true, cover: true, icon: 'pebble' })
  })

  it('asks again when the app opens, or after 30 seconds away, never sooner', () => {
    const on = { ...NO_LOCK, on: true }
    expect(needsUnlock(on, null)).toBe(true)
    expect(needsUnlock(on, RELOCK_AFTER_MS - 1)).toBe(false)
    expect(needsUnlock(on, RELOCK_AFTER_MS)).toBe(true)
    expect(needsUnlock(NO_LOCK, null)).toBe(false)
  })

  it('takes a PIN of four digits only', () => {
    expect(validPin('0427')).toBe(true)
    expect(validPin('427')).toBe(false)
    expect(validPin('04a7')).toBe(false)
  })

  it('keeps a PIN sealed, never as it was typed', async () => {
    const sealed = await sealPin('0427')
    expect(sealed).not.toContain('0427')
    expect(await sealPin('0427')).not.toBe(sealed)
  })

  it('opens the person’s own space with their PIN, the empty guest space with the guest PIN, and nothing else', async () => {
    const lock = { ...NO_LOCK, on: true, pin: await sealPin('2580'), guest: await sealPin('1111') }
    expect(await pinOpens('2580', lock)).toBe('real')
    expect(await pinOpens('1111', lock)).toBe('guest')
    expect(await pinOpens('0000', lock)).toBeNull()
    expect(await pinOpens('2580', NO_LOCK)).toBeNull()
  })

  it('reads a stored lock whatever space the app is in', () => {
    expect(parseAppLock({ on: true, cover: false, icon: 'horizon', pin: null, guest: null })).toMatchObject({ on: true, icon: 'horizon' })
    expect(parseAppLock('nonsense')).toEqual(NO_LOCK)
  })
})
