import { beforeEach, describe, expect, it } from 'vitest'
import { planReminders, reminderSettings, saveReminderSettings, REMINDERS_OFF, type ReminderSettings } from './reminders'

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

  it('checks in only on the days an intention is due, and opens Reflect', () => {
    const p = planReminders(on({ intentions: true }), TUE, 0, new Set(), ['2026-10-29', '2026-12-01'])
    expect(p).toEqual([expect.objectContaining({ id: 'reminder.checkin.2026-10-29', minutes: 9 * 60, opens: 'reflect' })])
  })

  it('never carries a word of the person’s own', () => {
    const p = planReminders(on({ morning: true, evening: true, sunday: true, intentions: true }), TUE, 0, new Set(), [TUE])
    for (const r of p) expect(`${r.title} ${r.body}`).not.toMatch(/\{|undefined/)
  })
})

describe('reminder settings', () => {
  beforeEach(() => localStorage.clear())

  it('start off, and keep what was saved', () => {
    expect(reminderSettings()).toEqual(REMINDERS_OFF)
    saveReminderSettings(on({ evening: true, eveningAt: 20 * 60 }))
    expect(reminderSettings()).toEqual(on({ evening: true, eveningAt: 20 * 60 }))
  })

  it('read a damaged copy as off', () => {
    localStorage.setItem('pi.reminders.v1', '{"morning":"yes","morningAt":"8"}')
    expect(reminderSettings()).toEqual(REMINDERS_OFF)
  })
})
