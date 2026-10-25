import Foundation
import Testing
@testable import PersonaKit

@Suite("The day's windows")
struct DayTests {
    private func at(_ hour: Int, _ minute: Int = 0, day: Int = 24) -> Date {
        var c = DateComponents()
        c.year = 2026; c.month = 10; c.day = day; c.hour = hour; c.minute = minute
        return Calendar(identifier: .gregorian).date(from: c)!
    }

    @Test("names the window the clock is in", arguments: [
        (3, 0, DayWindow.rest), (5, 0, .morning), (11, 29, .morning), (11, 30, .midday),
        (14, 30, .afternoon), (17, 0, .evening), (21, 0, .night), (23, 59, .night),
    ])
    func windows(hour: Int, minute: Int, expected: DayWindow) {
        #expect(DayWindow.at(at(hour, minute)) == expected)
    }

    @Test("keeps the morning three open until the evening opens")
    func morningStaysOpen() {
        #expect(Day.sitting(at: at(16, 59)) == .morning)
        #expect(Day.sitting(at: at(17, 0)) == .evening)
        #expect(Day.sitting(at: at(3)) == nil)
    }

    @Test("writes the phone's own date as YYYY-MM-DD")
    func localDate() {
        #expect(Day.localDate(at(9, day: 5)) == "2026-10-05")
    }

    @Test("greets by the time of day, with the name once there is one")
    func greeting() {
        #expect(DayWindow.morning.greeting(name: "Ama") == "Good morning, Ama.")
        #expect(DayWindow.midday.greeting(name: nil) == "Good afternoon.")
        #expect(DayWindow.afternoon.greeting(name: nil) == "Good afternoon.")
        #expect(DayWindow.evening.greeting(name: "Ama") == "Good evening, Ama.")
        #expect(DayWindow.night.greeting(name: nil) == "Night wind-down.")
        #expect(DayWindow.rest.greeting(name: nil) == "Good night.")
    }
}
