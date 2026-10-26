import Foundation
import Testing
@testable import PersonaKit

/// The month, quarter and year Mirrors and the Outside Mirror, read and
/// worded as on the web (frontend/src/Mirror.tsx, mirrorText.ts). No scores.
@Suite("The longer Mirrors")
struct PeriodMirrorTests {
    static let json = #"""
    {"period":"month","label":"2026-10","date":"2026-10-26","from":"2026-09-28","to":"2026-11-01","weeksTotal":5,
     "weeks":[{"monday":"2026-09-28","week":40,"kept":false,"daysActive":0,"daysSoFar":0,"answers":0,"deepest":0,"stepsTried":0},
              {"monday":"2026-10-19","week":43,"kept":true,"daysActive":5,"daysSoFar":6,"answers":18,"deepest":2,"stepsTried":1}],
     "stats":{"weeksActive":2,"weeksSoFar":4,"daysActive":9,"daysSoFar":20,"answers":31,"private":1,"deepest":2,"me":4,"partly":1,"notMe":0,"rated":5,"stepsStarted":2,"stepsTried":1,"stepsHelped":1},
     "traits":[{"trait":"conscientiousness","answers":14,"days":6,"weeks":3,"level":"steady","score":72,"weekly":[{"week":42,"score":70},{"week":43}],"change":4},
               {"trait":"openness","answers":3,"days":2,"weeks":1,"level":"hint","score":80,"weekly":[]}],
     "themes":[],
     "moments":[{"prompt":"A free evening?","label":"Catch up on chores","headline":"You finish what you start.","theme":"rest","lean":0.9,"depth":3,"date":"2026-10-14","edition":12}],
     "helped":[{"theme":"rest","step":"Leave one cup tonight.","started":"2026-10-15"}]}
    """#

    func mirror() throws -> PeriodMirror { try JSONDecoder().decode(PeriodMirror.self, from: Data(Self.json.utf8)) }

    @Test("reads the server's month")
    func decodes() throws {
        let p = try mirror()
        #expect(p.period == .month)
        #expect(p.weeks.count == 2)
        #expect(p.weeks.first?.kept == false)
        #expect(p.stats.answers == 31)
        #expect(p.traits.first?.weekly.last?.score == nil)
        #expect(p.moments.first?.prompt == "A free evening?")
        #expect(p.helped.first?.step == "Leave one cup tonight.")
    }

    @Test("names the span as the web does")
    func names() {
        #expect(MirrorText.periodName(.month, label: "2026-10") == "October 2026")
        #expect(MirrorText.periodName(.quarter, label: "2026-Q4") == "October to December 2026")
        #expect(MirrorText.periodName(.year, label: "2026") == "2026")
    }

    @Test("leans only past the middle, and never on a hint or a side marked Not me")
    func leanings() throws {
        let p = try mirror()
        #expect(MirrorText.leanings(p.traits).map(\.trait) == ["conscientiousness"])
        #expect(MirrorText.leanings(p.traits, notMe: ["conscientiousness.high"]).isEmpty)
    }

    @Test("opens with what happened so far and what stood out, with no numbers for traits")
    func summary() throws {
        let p = try mirror()
        let s = MirrorText.summary(p)
        #expect(s == "So far this month you've shown up on 9 days in 2 weeks and given 31 answers. What stood out most: you finish what you start.")
        #expect(!s.contains("72"))
        #expect(MirrorText.headline(p) == "This month, you leaned towards getting things done.")
    }

    @Test("says so plainly when nothing has been answered")
    func empty() throws {
        let p = try JSONDecoder().decode(PeriodMirror.self, from: Data(Self.json.replacingOccurrences(of: #""answers":31"#, with: #""answers":0"#).utf8))
        #expect(MirrorText.summary(p) == "Nothing answered this month yet. It fills in week by week as you answer, and every week you come back adds to it.")
    }

    @Test("closes each span with the web's line")
    func close() {
        #expect(MirrorText.close(.month) == "A month is long enough to see a pattern, and short enough to change one.")
        #expect(MirrorText.close(.year).hasPrefix("Traits do shift over the years."))
    }

    @Test("the Outside Mirror: shared ground and what the circle notices, from positions, never numbers")
    func outside() throws {
        let o = try JSONDecoder().decode(OutsideMirror.self, from: Data(#"{"open":true,"friends":4,"need":3,"weeks":5,"traits":[{"trait":"conscientiousness","position":75},{"trait":"agreeableness","position":80}]}"#.utf8))
        let own: [String: Double] = ["conscientiousness": 70, "agreeableness": 45]
        let read = MirrorText.outside(o, own: own)
        #expect(read.shared == "You and your circle both see you near getting things done.")
        #expect(read.miss == "Your circle places you nearer keeping the peace than your own answers do. Neither is the truer one: people see the side of you that you show them.")
        #expect(MirrorText.outsideLead(o) == "Blended from 4 friends over 5 weeks. No single answer is ever shown.")
    }

    @Test("reads a locked Outside Mirror, whose traits the server sends as null")
    func lockedOutside() throws {
        let o = try JSONDecoder().decode(OutsideMirror.self, from: Data(#"{"open":false,"friends":1,"need":3,"weeks":0,"traits":null}"#.utf8))
        #expect(o.open == false)
        #expect(o.traits.isEmpty)
    }
}
