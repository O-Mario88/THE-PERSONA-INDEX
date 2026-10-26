import Foundation
import Testing
@testable import PersonaKit

/// Reminders, planned on the device: a week ahead, re-planned whenever the
/// app opens or a sitting is done. Off until turned on; never a word of the
/// person's answers or writing in the text.
@Suite("Reminders")
struct RemindersTests {
    let monday = "2026-10-26"

    func plan(_ s: ReminderSettings, now: Int = 7 * 60, done: Set<Sitting> = [], due: [String] = []) -> [PlannedReminder] {
        Reminders.plan(s, today: monday, minutesNow: now, doneToday: done, intentionDays: due)
    }

    @Test("plans nothing until turned on")
    func off() {
        #expect(plan(ReminderSettings()).isEmpty)
        #expect(ReminderSettings().morning == false && ReminderSettings().evening == false && ReminderSettings().sunday == false)
    }

    @Test("reminds of the morning sitting on the six question days ahead, never Sunday")
    func morning() {
        let p = plan(ReminderSettings(morning: true))
        #expect(p.map(\.date) == ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"])
        #expect(p.allSatisfy { $0.minutes == 8 * 60 && $0.title == "Your morning three are waiting" })
    }

    @Test("skips today once the sitting is done, or once its time has passed")
    func skipsToday() {
        #expect(plan(ReminderSettings(morning: true), done: [.morning]).first?.date == "2026-10-27")
        #expect(plan(ReminderSettings(morning: true), now: 9 * 60).first?.date == "2026-10-27")
        #expect(plan(ReminderSettings(evening: true), now: 9 * 60).first?.date == "2026-10-26")
    }

    @Test("keeps a chosen time inside the sitting's window")
    func clamps() {
        #expect(ReminderSettings(morning: true, morningAt: 3 * 60).morningMinutes == 5 * 60)
        #expect(ReminderSettings(evening: true, eveningAt: 15 * 60).eveningMinutes == 17 * 60)
        #expect(ReminderSettings(evening: true, eveningAt: 23 * 60 + 50).eveningMinutes == 23 * 60 + 30)
    }

    @Test("the Sunday Mirror on Sunday morning")
    func sunday() {
        let p = plan(ReminderSettings(sunday: true))
        #expect(p.map(\.date) == ["2026-11-01"])
        #expect(p.first?.title == "Your Sunday Mirror is ready")
    }

    @Test("an intention check-in names no words of the intention")
    func intentions() {
        let p = plan(ReminderSettings(intentions: true), due: ["2026-10-28", "2026-12-01"])
        #expect(p.map(\.date) == ["2026-10-28"])
        #expect(p.first?.body == "A gentle check-in on something you wanted to try. Only you see it.")
    }

    @Test("ids are stable, so re-planning replaces rather than doubles")
    func ids() {
        let a = plan(ReminderSettings(morning: true, evening: true)).map(\.id)
        let b = plan(ReminderSettings(morning: true, evening: true)).map(\.id)
        #expect(a == b && Set(a).count == a.count)
        #expect(a.allSatisfy { $0.hasPrefix(Reminders.idPrefix) })
    }

    @Test("settings are kept on this device only, never in a backup")
    func stored() {
        let store = MemoryStore()
        ReminderStore(store: store).save(ReminderSettings(morning: true, morningAt: 7 * 60 + 30))
        #expect(ReminderStore(store: store).settings.morningAt == 7 * 60 + 30)
        #expect(BackupRegistry.copy(of: ReminderStore.key) == nil)
    }

    @Test("a tapped reminder opens where it points: the sitting, the Mirrors or Reflect")
    func opens() {
        #expect(Reminders.opens("pi.reminder.morning.2026-10-26") == "today")
        #expect(Reminders.opens("pi.reminder.evening.2026-10-26") == "today")
        #expect(Reminders.opens("pi.reminder.sunday.2026-11-01") == "mirrors")
        #expect(Reminders.opens("pi.reminder.checkin.2026-10-28") == "reflect")
    }
}
