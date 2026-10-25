import Foundation

// The local day, on the phone's own clock: five short windows (frontend/src/day.ts).
//   05:00 morning, 11:30 midday, 14:30 afternoon, 17:00 evening, 21:00 night.
// Midnight to 5 am is for rest. The morning three stay open until 5 pm and
// the evening three until midnight. Sunday has no questions.

public enum DayWindow: String, CaseIterable, Sendable {
    case rest, morning, midday, afternoon, evening, night

    /// The five a person sees, in the day's order.
    public static let open: [DayWindow] = [.morning, .midday, .afternoon, .evening, .night]

    /// Minutes after midnight when each window opens.
    public var opens: Int {
        switch self {
        case .rest: 0
        case .morning: 5 * 60
        case .midday: 11 * 60 + 30
        case .afternoon: 14 * 60 + 30
        case .evening: 17 * 60
        case .night: 21 * 60
        }
    }

    public var name: String {
        switch self {
        case .rest: "Night"
        case .morning: "Morning"
        case .midday: "Midday"
        case .afternoon: "Afternoon"
        case .evening: "Evening"
        case .night: "Night"
        }
    }

    /// The short name under the day's dots ("Pulse" for the afternoon).
    public var short: String { self == .afternoon ? "Pulse" : name }

    public static func at(_ date: Date, calendar: Calendar = .current) -> DayWindow {
        let m = Day.minutes(date, calendar: calendar)
        if m < DayWindow.morning.opens { return .rest }
        if m < DayWindow.midday.opens { return .morning }
        if m < DayWindow.afternoon.opens { return .midday }
        if m < DayWindow.evening.opens { return .afternoon }
        if m < DayWindow.night.opens { return .evening }
        return .night
    }
}

public enum Day {
    static func minutes(_ date: Date, calendar: Calendar) -> Int {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    /// The sitting the clock offers: the morning three until 5 pm, then the evening three.
    public static func sitting(at date: Date, calendar: Calendar = .current) -> Sitting? {
        let m = minutes(date, calendar: calendar)
        if m < DayWindow.morning.opens { return nil }
        return m < DayWindow.evening.opens ? .morning : .evening
    }

    /// The phone's own date as YYYY-MM-DD.
    public static func localDate(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// "05:00", "21:00".
    public static func clock(_ minutes: Int) -> String {
        String(format: "%02d:%02d", (minutes / 60) % 24, minutes % 60)
    }
}
