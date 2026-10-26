import Foundation

// What the widgets say (home screen, lock screen, Mac desktop): only what
// the clock knows, the sitting that is open and what opens next. They read
// nothing the person answered, kept or wrote, so a glance at a locked phone
// gives nothing away.

public struct WidgetText: Sendable, Equatable {
    public let eyebrow: String
    public let title: String
    public let line: String
    public let window: DayWindow
    public let sunday: Bool

    public static func at(_ date: Date, calendar: Calendar = .current) -> WidgetText {
        let window = DayWindow.at(date, calendar: calendar)
        if calendar.component(.weekday, from: date) == 1 {
            return WidgetText(eyebrow: "Sunday", title: "Sunday is for looking back", line: "Your Sunday Mirror is ready", window: window, sunday: true)
        }
        switch Day.sitting(at: date, calendar: calendar) {
        case nil:
            return WidgetText(eyebrow: "Rest", title: "Rest now", line: "Your morning opens at 5:00", window: window, sunday: false)
        case .morning:
            return WidgetText(eyebrow: "Morning", title: "Your morning three are waiting",
                              line: "Open until \(Day.clock(DayWindow.evening.opens))", window: window, sunday: false)
        case .evening:
            return WidgetText(eyebrow: "Evening", title: "Your evening three are waiting", line: "Open until midnight", window: window, sunday: false)
        }
    }

    /// The moments the words change: 5:00, 17:00 and midnight.
    public static func changes(after date: Date, count: Int, calendar: Calendar = .current) -> [Date] {
        let marks = [0, DayWindow.morning.opens, DayWindow.evening.opens]
        var out: [Date] = []
        var day = calendar.startOfDay(for: date)
        var last = at(date, calendar: calendar)
        while out.count < count {
            for m in marks {
                guard let t = calendar.date(byAdding: .minute, value: m, to: day), t > date else { continue }
                let now = at(t, calendar: calendar)
                if now.title != last.title { out.append(t); last = now }
                if out.count == count { break }
            }
            day = calendar.date(byAdding: .day, value: 1, to: day) ?? day
        }
        return out
    }
}
