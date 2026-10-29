import { describe, expect, it } from 'vitest'
import { BAR, LAUNCH_LINE, LAUNCH_MS, nextStage } from './launch'

const app = { app: true, day: false }
const both = { app: true, day: true }
const none = { app: false, day: false }

// The launch (Edwin's design, 2026-10-29): the logo on midnight, a calm
// loading page with a progress bar, a short personal line, then Welcome or
// Today. Each page shows long enough to be read, and the app never waits on
// a slow network for longer than it has to.
describe('the launch', () => {
  it('keeps the logo up until the app has loaded what this phone kept', () => {
    expect(nextStage('launch', 0, LAUNCH_MS.launch * 3, none)).toBe('launch')
    expect(nextStage('launch', 0, LAUNCH_MS.launch * 3, app)).toBe('loading')
  })

  it('lets the logo settle before the loading page, however fast the phone is', () => {
    expect(nextStage('launch', 0, LAUNCH_MS.launch - 1, both)).toBe('launch')
    expect(nextStage('launch', 0, LAUNCH_MS.launch, both)).toBe('loading')
  })

  it('moves to the personal line once today is in and the loading line has been read', () => {
    expect(nextStage('loading', 1000, 1000 + LAUNCH_MS.loading - 1, both)).toBe('loading')
    expect(nextStage('loading', 1000, 1000 + LAUNCH_MS.loading, both)).toBe('personal')
    expect(nextStage('loading', 1000, 1000 + LAUNCH_MS.loading * 4, app)).toBe('loading')
  })

  it('never keeps anyone on the loading page when today is slow to come', () => {
    expect(nextStage('loading', 0, LAUNCH_MS.wait - 1, app)).toBe('loading')
    expect(nextStage('loading', 0, LAUNCH_MS.wait, app)).toBe('personal')
  })

  it('shows the personal line long enough to read, then gives way', () => {
    expect(nextStage('personal', 500, 500 + LAUNCH_MS.personal - 1, both)).toBe('personal')
    expect(nextStage('personal', 500, 500 + LAUNCH_MS.personal, both)).toBe('gone')
    expect(nextStage('gone', 0, 0, none)).toBe('gone')
  })

  it('fills the bar only as far as the work done: never full before today is in', () => {
    expect(BAR.launch).toBe(0)
    expect(BAR.loading).toBeGreaterThan(0)
    expect(BAR.loading).toBeLessThan(BAR.personal)
    expect(BAR.personal).toBe(1)
  })

  it('says what is happening in Edwin’s words', () => {
    expect(LAUNCH_LINE.loading).toBe('Getting things ready…')
    expect(LAUNCH_LINE.personal).toBe('Preparing a more personal experience for you…')
  })

  it('keeps the whole launch short when everything is quick', () => {
    const quickest = LAUNCH_MS.launch + LAUNCH_MS.loading + LAUNCH_MS.personal + LAUNCH_MS.fade
    expect(quickest).toBeLessThanOrEqual(3500)
  })
})
