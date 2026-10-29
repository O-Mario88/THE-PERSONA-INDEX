import { beforeEach, describe, expect, it } from 'vitest'
import { isMirrorDay, MIRROR_DAYS, mirrorDay, mirrorName, readyBack, setMirrorDay } from './mirrorDay'

// Edwin's brief, 2026-10-29: the weekly benefit, not a daily obligation, and
// a choice of Mirror day. 2026-10-28 is a Wednesday; 2026-11-01 a Sunday.

describe('the Mirror day', () => {
  beforeEach(() => localStorage.clear())

  it('is Sunday until the person chooses another', () => {
    expect(mirrorDay()).toBe(0)
    setMirrorDay(3)
    expect(mirrorDay()).toBe(3)
  })

  it('reads a damaged copy as Sunday', () => {
    localStorage.setItem('pi.mirror.day', '"someday"')
    expect(mirrorDay()).toBe(0)
    localStorage.setItem('pi.mirror.day', '9')
    expect(mirrorDay()).toBe(0)
  })

  it('offers the days from Monday to Sunday', () => {
    expect(MIRROR_DAYS).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('knows the day, and names the Mirror after it', () => {
    expect(isMirrorDay('2026-11-01', 0)).toBe(true)
    expect(isMirrorDay('2026-10-28', 3)).toBe(true)
    expect(isMirrorDay('2026-10-28', 0)).toBe(false)
    expect(mirrorName(0)).toBe('Sunday Mirror')
    expect(mirrorName(3)).toBe('Wednesday Mirror')
  })

  // Sunday is the last day of the week, so a Sunday Mirror shows the week it
  // ends; any other day shows the week that has just finished.
  it('shows the week that just ended: this one on Sunday, the last one on any other day', () => {
    expect(readyBack(0)).toBe(0)
    expect(readyBack(3)).toBe(1)
  })
})
