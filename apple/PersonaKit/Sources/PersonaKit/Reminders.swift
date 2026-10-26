import Foundation

// Reminders, planned on the device (frontend has none; this is the app's own).
// Off until the person turns them on. The plan covers the week ahead, one
// notification per day per kind, so today's can be dropped once its sitting
// is done; the app re-plans whenever it opens or a sitting is finished. The
// text never carries a word of the person's answers or writing.

public struct ReminderSettings: Codable, Sendable, Equatable {
    public var morning = false
    /// Minutes after midnight.
    public var morningAt = 8 * 60
    public var evening = false
    public var eveningAt = 19 * 60
    public var sunday = false
    public var intentions = false

    public init(morning: Bool = false, morningAt: Int = 8 * 60, evening: Bool = false, eveningAt: Int = 19 * 60,
                sunday: Bool = false, intentions: Bool = false) {
        self.morning = morning
        self.morningAt = morningAt
        self.evening = evening
        self.eveningAt = eveningAt
        self.sunday = sunday
        self.intentions = intentions
    }

    /// The morning three are open from 5 am until 5 pm.
    public var morningMinutes: Int { min(max(morningAt, DayWindow.morning.opens), DayWindow.evening.opens - 30) }
    /// The evening three are open from 5 pm until midnight.
    public var eveningMinutes: Int { min(max(eveningAt, DayWindow.evening.opens), 23 * 60 + 30) }

    public var any: Bool { morning || evening || sunday || intentions }
}

public struct PlannedReminder: Sendable, Equatable {
    public let id: String
    public let date: String
    public let minutes: Int
    public let title: String
    public let body: String
}

public enum Reminders {
    public static let idPrefix = "pi.reminder."
    static let daysAhead = 7
    static let sundayAt = 10 * 60
    static let checkInAt = 9 * 60

    private static func weekday(_ iso: String) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = cal.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso).map { cal.component(.weekday, from: $0) } ?? 0 // 1 is Sunday
    }

    /// Where a tapped reminder opens, by its id: the day's sitting, the Mirrors or Reflect.
    public static func opens(_ id: String) -> String {
        if id.hasPrefix(idPrefix + "sunday.") { return "mirrors" }
        if id.hasPrefix(idPrefix + "checkin.") { return "reflect" }
        return "today"
    }

    public static func plan(_ s: ReminderSettings, today: String, minutesNow: Int, doneToday: Set<Sitting>, intentionDays: [String]) -> [PlannedReminder] {
        guard s.any else { return [] }
        var out: [PlannedReminder] = []
        let due = Set(intentionDays)
        for i in 0..<daysAhead {
            let day = addDays(today, i)
            let isToday = i == 0
            func later(_ m: Int) -> Bool { !isToday || m > minutesNow }
            if weekday(day) == 1 {
                if s.sunday, later(sundayAt) {
                    out.append(PlannedReminder(id: "\(idPrefix)sunday.\(day)", date: day, minutes: sundayAt,
                                               title: "Your Sunday Mirror is ready", body: "A look back at your week, set only against your own."))
                }
            } else {
                if s.morning, later(s.morningMinutes), !(isToday && doneToday.contains(.morning)) {
                    out.append(PlannedReminder(id: "\(idPrefix)morning.\(day)", date: day, minutes: s.morningMinutes,
                                               title: "Your morning three are waiting", body: "Two minutes, then the day is yours."))
                }
                if s.evening, later(s.eveningMinutes), !(isToday && doneToday.contains(.evening)) {
                    out.append(PlannedReminder(id: "\(idPrefix)evening.\(day)", date: day, minutes: s.eveningMinutes,
                                               title: "Your evening three are waiting", body: "A quiet look back at the day."))
                }
            }
            if s.intentions, due.contains(day), later(checkInAt) {
                out.append(PlannedReminder(id: "\(idPrefix)checkin.\(day)", date: day, minutes: checkInAt,
                                           title: "A gentle check-in", body: "A gentle check-in on something you wanted to try. Only you see it."))
            }
        }
        return out
    }
}

/// Reminder settings, on this device only: reminders belong to a device, so they are never backed up.
public struct ReminderStore: Sendable {
    public static let key = "pi.reminders.v1"
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    public var settings: ReminderSettings {
        store.string(forKey: Self.key).flatMap { try? JSONDecoder().decode(ReminderSettings.self, from: Data($0.utf8)) } ?? ReminderSettings()
    }

    public func save(_ s: ReminderSettings) {
        store.set((try? JSONEncoder().encode(s)).flatMap { String(data: $0, encoding: .utf8) }, forKey: Self.key)
    }
}
