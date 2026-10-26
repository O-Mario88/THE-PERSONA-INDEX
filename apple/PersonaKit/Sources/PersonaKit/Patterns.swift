import Foundation

// Patterns (Insights Release 3), as on the web (frontend/src/patterns.ts).
// The month, quarter and year Mirrors ask about each need Insights calls a
// pattern or something noticed: "Does this still feel true?". Yes and Partly
// keep it; No retires it, everywhere, and only answers given after that can
// build it again. Kept on this device under pi.pattern.<need>, in the backup;
// nothing is sent.

public struct NeedPattern: Sendable, Hashable, Identifiable {
    public let need: String
    public let evidence: Evidence
    public let answers: Int
    public let days: Int
    public let since: String
    public var id: String { need }
}

public enum PatternCheck: String, Codable, Sendable, CaseIterable {
    case yes, partly, no

    public var label: String {
        switch self {
        case .yes: "Yes"
        case .partly: "Partly"
        case .no: "No"
        }
    }

    public var reply: String {
        switch self {
        case .yes: "Kept. You said it still feels true."
        case .partly: "Kept. You said it’s partly true."
        case .no: "Retired. It won’t be called a pattern again unless new answers build it up."
        }
    }
}

public enum Patterns {
    static let prefix = "pi.pattern."

    public struct Checked: Codable, Sendable, Equatable {
        public let check: PatternCheck
        public let date: String
    }

    public static func checked(_ need: String, store: KeyValueStore) -> Checked? {
        store.string(forKey: prefix + need).flatMap { try? JSONDecoder().decode(Checked.self, from: Data($0.utf8)) }
    }

    public static func check(_ need: String, _ check: PatternCheck, today: String, store: KeyValueStore) {
        let json = (try? JSONEncoder().encode(Checked(check: check, date: today))).flatMap { String(data: $0, encoding: .utf8) }
        store.set(json, forKey: prefix + need)
    }

    /// The day a No retired a need's pattern; only answers after it count.
    static func retired(_ need: String, store: KeyValueStore) -> String? {
        checked(need, store: store).flatMap { $0.check == .no ? $0.date : nil }
    }

    /// Patterns first, then what the person has been noticing.
    public static func all(store: KeyValueStore, today: String) -> [NeedPattern] {
        let answers = AnswerHistory(store: store).answers()
        let found: [NeedPattern] = Insights.needOrder.compactMap { need in
            let d = Insights.evidenceDetail(answers, need: need, today: today, retiredAfter: retired(need, store: store))
            return d.evidence == .thought ? nil : NeedPattern(need: need, evidence: d.evidence, answers: d.answers, days: d.days, since: d.since)
        }
        return found.filter { $0.evidence == .pattern } + found.filter { $0.evidence == .noticing }
    }
}

/// A way into Connect (Insights Release 3): the person's choice to put the
/// suggestion away for a day or for good, under the web's pi.nudge. keys.
public struct ConnectNudge: Sendable {
    static let off = "pi.nudge.off"
    static let later = "pi.nudge.later"
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    public func shows(today: String) -> Bool { store.string(forKey: Self.off) != "1" && store.string(forKey: Self.later) != today }
    public func notToday(_ today: String) { store.set(today, forKey: Self.later) }
    public func turnOff() { store.set("1", forKey: Self.off) }
}
