import { beforeEach, describe, expect, it } from 'vitest'
import { planReminders, reminderSettings, REMINDERS_OFF, REMINDERS_ON, setReminderTimes, type ReminderSettings } from './reminders'

const on = (o: Partial<ReminderSettings>): ReminderSettings => ({ ...REMINDERS_OFF, ...o })
// 2026-10-27 is a Tuesday; 2026-11-01 is the Sunday after.
const TUE = '2026-10-27'

describe('planReminders', () => {
  beforeEach(() => localStorage.clear())

  it('plans nothing while every reminder is off', () => {
    expect(planReminders(REMINDERS_OFF, TUE, 0, new Set(), [TUE])).toEqual([])
  })

  it('plans the morning three on question days, and the Sunday Mirror on Sunday', () => {
    const p = planReminders(on({ morning: true, sunday: true }), TUE, 6 * 60, new Set(), [])
    expect(p.map((r) => r.id)).toEqual([
      'reminder.morning.2026-10-27',
      'reminder.morning.2026-10-28',
      'reminder.morning.2026-10-29',
      'reminder.morning.2026-10-30',
      'reminder.morning.2026-10-31',
      'reminder.sunday.2026-11-01',
      'reminder.morning.2026-11-02',
    ])
    expect(p.find((r) => r.id.includes('sunday'))).toMatchObject({ minutes: 10 * 60, opens: 'mirrors' })
  })

  it('drops today once its time has passed or its sitting is done', () => {
    const s = on({ morning: true, evening: true })
    expect(planReminders(s, TUE, 9 * 60, new Set(), []).filter((r) => r.date === TUE).map((r) => r.id)).toEqual(['reminder.evening.2026-10-27'])
    expect(planReminders(s, TUE, 6 * 60, new Set(['morning', 'evening']), []).filter((r) => r.date === TUE)).toEqual([])
  })

  it('keeps a chosen time inside its sitting', () => {
    const p = planReminders(on({ morning: true, morningAt: 3 * 60, evening: true, eveningAt: 23 * 60 + 59 }), TUE, 0, new Set(), [])
    expect(p.find((r) => r.id.startsWith('reminder.morning'))?.minutes).toBe(5 * 60)
    expect(p.find((r) => r.id.startsWith('reminder.evening'))?.minutes).toBe(23 * 60 + 30)
  })

  it('checks in only on the days an intention is due, and opens Today, where the check-in waits', () => {
    const p = planReminders(on({ intentions: true }), TUE, 0, new Set(), ['2026-10-29', '2026-12-01'])
    expect(p).toEqual([expect.objectContaining({ id: 'reminder.checkin.2026-10-29', minutes: 9 * 60, opens: 'today' })])
  })

  it('never carries a word of the person’s own', () => {
    const p = planReminders(on({ morning: true, evening: true, sunday: true, intentions: true }), TUE, 0, new Set(), [TUE])
    for (const r of p) expect(`${r.title} ${r.body}`).not.toMatch(/\{|undefined/)
  })
})

// Edwin, 2026-10-29: "Morning 3, evening 3, Sunday mirror and checking should
// be enabled by default and automatic. it should not be toggle manually."
describe('reminder settings', () => {
  beforeEach(() => localStorage.clear())

  it('are all on from the start, at the usual times', () => {
    expect(reminderSettings()).toEqual(REMINDERS_ON)
    expect(REMINDERS_ON).toMatchObject({ morning: true, evening: true, sunday: true, intentions: true })
  })

  it('keep a chosen time, and stay on', () => {
    setReminderTimes({ eveningAt: 20 * 60 })
    expect(reminderSettings()).toEqual({ ...REMINDERS_ON, eveningAt: 20 * 60 })
  })

  it('stay on even where an older copy had them switched off', () => {
    localStorage.setItem('pi.reminders.v1', JSON.stringify({ morning: false, morningAt: 7 * 60, evening: false, eveningAt: 19 * 60, sunday: false, intentions: false }))
    expect(reminderSettings()).toEqual({ ...REMINDERS_ON, morningAt: 7 * 60 })
  })

  it('read a damaged copy as on, at the usual times', () => {
    localStorage.setItem('pi.reminders.v1', '{"morning":"yes","morningAt":"8"}')
    expect(reminderSettings()).toEqual(REMINDERS_ON)
  })
})
