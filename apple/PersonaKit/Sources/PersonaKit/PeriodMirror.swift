import Foundation

// The month, quarter and year Mirrors (backend/period.go, frontend/src/api.ts
// `PeriodMirror`) and the Outside Mirror (frontend/src/social.ts), with the
// web's wording (mirrorText.ts). A trait is shown as a leaning, never a score.

public enum Period: String, Codable, Sendable, CaseIterable {
    case month, quarter, year
}

public struct PeriodMirror: Codable, Sendable, Hashable {
    public struct Stats: Codable, Sendable, Hashable {
        public let weeksActive: Int
        public let weeksSoFar: Int
        public let daysActive: Int
        public let daysSoFar: Int
        public let answers: Int
        public let `private`: Int
        public let deepest: Int
        public let me: Int
        public let partly: Int
        public let notMe: Int
        public let rated: Int
        public let stepsStarted: Int
        public let stepsTried: Int
        public let stepsHelped: Int
    }

    public struct Week: Codable, Sendable, Hashable {
        public let monday: String
        public let week: Int
        public let kept: Bool
        public let daysActive: Int
        public let daysSoFar: Int
        public let answers: Int
        public let deepest: Int
        public let stepsTried: Int
    }

    public struct WeekScore: Codable, Sendable, Hashable {
        public let week: Int
        public let score: Double?
    }

    public struct Trait: Codable, Sendable, Hashable {
        public let trait: String
        public let answers: Int
        public let days: Int
        public let weeks: Int
        public let level: Level
        /// Where the answers sit between the two ends; drawn as a dot, never shown as a number.
        public let score: Double
        public let weekly: [WeekScore]
        public let change: Double?

        public var levelLine: String { "\(level.name) · \(answers) \(answers == 1 ? "answer" : "answers")" }
    }

    public struct Moment: Codable, Sendable, Hashable {
        public let prompt: String
        public let label: String
        public let headline: String
        public let theme: String
        public let date: String
        public let edition: Int
    }

    public struct Helped: Codable, Sendable, Hashable {
        public let theme: String
        public let step: String
        public let started: String
    }

    public let period: Period
    public let label: String
    public let date: String
    public let from: String
    public let to: String
    public let weeksTotal: Int
    public let weeks: [Week]
    public let stats: Stats
    public let traits: [Trait]
    public let moments: [Moment]
    public let helped: [Helped]
}

/// The Outside Mirror: how friends experience you, blended once enough have answered.
public struct OutsideMirror: Codable, Sendable, Hashable {
    public struct Position: Codable, Sendable, Hashable {
        public let trait: String
        public let position: Double
    }
    public let open: Bool
    public let friends: Int
    public let need: Int
    public let weeks: Int
    public let traits: [Position]

    enum CodingKeys: String, CodingKey { case open, friends, need, weeks, traits }

    /// While locked the server sends `traits` as null (an empty Go slice).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        open = try c.decode(Bool.self, forKey: .open)
        friends = try c.decode(Int.self, forKey: .friends)
        need = try c.decode(Int.self, forKey: .need)
        weeks = try c.decodeIfPresent(Int.self, forKey: .weeks) ?? 0
        traits = try c.decodeIfPresent([Position].self, forKey: .traits) ?? []
    }
}

public enum MirrorText {
    /// A read leans one way past these; between them it sits in the middle.
    public static let high = 60.0
    public static let low = 40.0

    private static let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    public static func periodName(_ period: Period, label: String) -> String {
        let parts = label.split(separator: "-").map(String.init)
        guard let year = parts.first else { return label }
        switch period {
        case .month:
            guard parts.count > 1, let m = Int(parts[1]), (1...12).contains(m) else { return label }
            return "\(months[m - 1]) \(year)"
        case .quarter:
            guard parts.count > 1, let q = Int(parts[1].dropFirst()), (1...4).contains(q) else { return label }
            return "\(months[(q - 1) * 3]) to \(months[(q - 1) * 3 + 2]) \(year)"
        case .year:
            return year
        }
    }

    public struct Leaning: Sendable, Hashable {
        public let trait: String
        public let high: Bool
        public let side: Traits.Side
    }

    /// The traits that clearly lean one way: not a hint, past the middle, and not a side the person said is not them.
    public static func leanings(_ traits: [PeriodMirror.Trait], notMe: [String] = []) -> [Leaning] {
        traits.compactMap { t in
            guard let text = Traits.all[t.trait], t.level != .hint, t.score <= low || t.score >= high else { return nil }
            let isHigh = t.score >= high
            guard !notMe.contains("\(t.trait).\(isHigh ? "high" : "low")") else { return nil }
            return Leaning(trait: t.trait, high: isHigh, side: isHigh ? text.high : text.low)
        }
    }

    private static func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

    public static func headline(_ p: PeriodMirror, notMe: [String] = []) -> String {
        guard let top = leanings(p.traits, notMe: notMe).first else { return "This \(p.period.rawValue) is just getting started." }
        return "This \(p.period.rawValue), you leaned towards \(top.side.lean)."
    }

    /// The opening paragraph, spoken to the person.
    public static func summary(_ p: PeriodMirror, notMe: [String] = []) -> String {
        let s = p.stats, noun = p.period.rawValue
        if s.answers == 0 {
            return "Nothing answered this \(noun) yet. It fills in week by week as you answer, and every week you come back adds to it."
        }
        let over = p.weeks.count == p.weeksTotal && (p.weeks.last?.daysSoFar ?? 0) >= 6
        let spread = "\(plural(s.daysActive, "day", "days")) in \(plural(s.weeksActive, "week", "weeks"))"
        let lead = over
            ? "This \(noun) you showed up on \(spread) and gave \(plural(s.answers, "answer", "answers"))."
            : "So far this \(noun) you've shown up on \(spread) and given \(plural(s.answers, "answer", "answers"))."
        guard let top = leanings(p.traits, notMe: notMe).first else {
            let leaning = p.traits.contains { Traits.all[$0.trait] != nil && ($0.score <= low || $0.score >= high) }
            return lead + " " + (leaning
                ? "Nothing has come up often enough yet to call it a pattern. A few more days this \(noun) will show what holds."
                : "Your answers sit close to the middle on everything so far, which is its own kind of balance.")
        }
        let h = top.side.headline
        return "\(lead) What stood out most: \(h.prefix(1).lowercased())\(h.dropFirst().dropLast())."
    }

    public static func close(_ period: Period) -> String {
        switch period {
        case .month: "A month is long enough to see a pattern, and short enough to change one."
        case .quarter: "Many new habits take around two months to feel automatic, so a quarter is where small steps start to show."
        case .year: "Traits do shift over the years. A year is where the slow changes show, the ones you only notice looking back."
        }
    }

    public static func outsideLead(_ o: OutsideMirror) -> String {
        "Blended from \(o.friends) friends over \(o.weeks) weeks. No single answer is ever shown."
    }

    /// Where the circle and the person's own read meet, and where they differ most.
    public static func outside(_ o: OutsideMirror, own: [String: Double]) -> (shared: String?, miss: String?) {
        let gaps = o.traits.compactMap { t -> (trait: String, position: Double, gap: Double)? in
            guard Traits.all[t.trait] != nil, let mine = own[t.trait] else { return nil }
            return (t.trait, t.position, t.position - mine)
        }
        .sorted { abs($0.gap) < abs($1.gap) }
        var shared: String?, miss: String?
        if let g = gaps.first, abs(g.gap) < 15, let text = Traits.all[g.trait] {
            shared = "You and your circle both see you near \((g.position >= 50 ? text.high : text.low).lean)."
        }
        if let g = gaps.last, abs(g.gap) >= 20, let text = Traits.all[g.trait] {
            miss = "Your circle places you nearer \((g.gap > 0 ? text.high : text.low).lean) than your own answers do. Neither is the truer one: people see the side of you that you show them."
        }
        return (shared, miss)
    }
}

extension APIClient {
    public func periodMirror(_ period: Period, date: String) async throws -> PeriodMirror {
        try await withDevice { pass in
            try await request("/api/mirror/\(period.rawValue)", query: ["date": date], headers: ["Authorization": "Device \(pass)"])
        }
    }

    public func outsideMirror() async throws -> OutsideMirror {
        try await request("/api/friends/mirror", headers: accountHeader)
    }
}
