import Foundation
import Testing
@testable import PersonaKit

/// What the widgets say: only what the clock knows, the sitting that is open
/// and what opens next, never anything the person answered or wrote.
@Suite("Widgets")
struct WidgetTextTests {
    var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    func at(_ day: Int, _ h: Int, _ m: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 10, day: day, hour: h, minute: m))!
    }

    @Test("a weekday morning: the morning three are waiting")
    func morning() {
        let t = WidgetText.at(at(26, 8), calendar: cal)
        #expect(t.eyebrow == "Morning")
        #expect(t.title == "Your morning three are waiting")
        #expect(t.line == "Open until 17:00")
        #expect(t.window == .morning)
    }

    @Test("the evening three from five")
    func evening() {
        let t = WidgetText.at(at(26, 18), calendar: cal)
        #expect(t.title == "Your evening three are waiting")
        #expect(t.line == "Open until midnight")
    }

    @Test("after midnight, rest, and the morning opens at five")
    func rest() {
        let t = WidgetText.at(at(26, 2), calendar: cal)
        #expect(t.eyebrow == "Rest")
        #expect(t.title == "Rest now")
        #expect(t.line == "Your morning opens at 5:00")
    }

    @Test("Saturday night turns into Sunday at midnight")
    func intoSunday() {
        #expect(WidgetText.changes(after: at(24, 20), count: 2, calendar: cal) == [at(25, 0), at(26, 0)])
    }

    @Test("Sunday has no questions: it is for looking back")
    func sunday() {
        let t = WidgetText.at(at(25, 10), calendar: cal)
        #expect(t.title == "Sunday is for looking back")
        #expect(t.line == "Your Sunday Mirror is ready")
    }

    @Test("the timeline changes exactly when a window opens or a sitting closes")
    func changes() {
        let times = WidgetText.changes(after: at(26, 8), count: 4, calendar: cal)
        #expect(times == [at(26, 17), at(27, 0), at(27, 5), at(27, 17)])
    }

    @Test("never a number about the person, and the voice rules' no-score line")
    func nothingPersonal() {
        for h in 0..<24 {
            let t = WidgetText.at(at(26, h), calendar: cal)
            #expect(!(t.title + t.line).contains("%"))
        }
    }
}
