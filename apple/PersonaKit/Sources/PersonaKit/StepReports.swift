import Foundation

// What Helped (Insights Release 2, 2026-10-26), as on the web
// (frontend/src/stepReports.ts). After someone saves "Something you could
// try" from an Insights card, they may say how it went, from the next day:
// tried and it helped a lot, a little, no change, or didn't try. Only if they
// want to. The report goes to the server under a key of its own
// (backend/whathelped.go), never with the person's words, and the totals come
// back the same for everyone, counts only, once 50 people have reported on a
// step, with any outcome under 10 folded into "a few". Those who report back
// chose to, and the app says so wherever it shows the totals.

public enum HelpedOutcome: String, Codable, Sendable, CaseIterable {
    case helpedLot = "helped_lot", helpedLittle = "helped_little", noChange = "no_change", notTried = "not_tried"

    public var label: String {
        switch self {
        case .helpedLot: "Tried it: helped a lot"
        case .helpedLittle: "Tried it: helped a little"
        case .noChange: "Tried it: no change"
        case .notTried: "Didn’t try it"
        }
    }
}

public struct HelpedCount: Codable, Sendable, Hashable {
    public let outcome: HelpedOutcome
    public let count: Int
    public let few: Bool?

    public init(outcome: HelpedOutcome, count: Int, few: Bool? = nil) {
        self.outcome = outcome
        self.count = count
        self.few = few
    }
}

/// One step's totals, as GET /api/what-helped gives them.
public struct WhatHelpedStep: Codable, Sendable, Hashable {
    public let questionId: String
    public let optionId: String
    public let total: Int
    public let outcomes: [HelpedCount]

    public init(questionId: String, optionId: String, total: Int, outcomes: [HelpedCount]) {
        self.questionId = questionId
        self.optionId = optionId
        self.total = total
        self.outcomes = outcomes
    }
}

/// A step this phone saved from Insights, and the answer whose card offered it.
public struct SavedStep: Sendable, Hashable, Identifiable {
    public let questionId: String
    public let optionId: String
    public let text: String
    public let saved: String
    public var id: String { questionId + "." + optionId }
}

public struct StepReports: Sendable {
    /// Insights' "Save as an intention" keeps a step under this id prefix.
    static let fromInsights = "insight-"
    static let prefix = "pi.helped."
    /// The server keeps a phone's answers for 35 days and takes a report only
    /// for an answer it still has, so a step is asked about for 30 days.
    static let askDays = 30

    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    /// Saved from Insights before today (a day to try it) and within 30 days,
    /// whose answer is still on the phone, newest first.
    public func stepsToAsk(today: String) -> [SavedStep] {
        let answers = AnswerHistory(store: store).answers()
        let since = addDays(today, -Self.askDays)
        return IntentionStore(store: store).all()
            .filter { $0.id.hasPrefix(Self.fromInsights) && $0.date < today && $0.date >= since }
            .sorted { $0.date > $1.date }
            .compactMap { i in
                guard let option = answers.first(where: { $0.questionId == i.from })?.optionId else { return nil }
                return SavedStep(questionId: i.from, optionId: option, text: i.text, saved: i.date)
            }
    }

    /// What this phone told the server about a step, once the server had it.
    public func reported(questionId: String, optionId: String) -> HelpedOutcome? {
        store.string(forKey: Self.prefix + questionId + "." + optionId).flatMap(HelpedOutcome.init(rawValue:))
    }

    public func remember(questionId: String, optionId: String, _ outcome: HelpedOutcome) {
        store.set(outcome.rawValue, forKey: Self.prefix + questionId + "." + optionId)
    }

    /// The totals in words, as on the web. Counts only, never a percentage;
    /// "a few" where the server folded a small group; a real zero is left out.
    public static func lines(_ step: WhatHelpedStep) -> (tried: String?, notTried: String?) {
        func amount(_ o: HelpedOutcome) -> String? {
            guard let c = step.outcomes.first(where: { $0.outcome == o }) else { return nil }
            if c.few == true { return "a few" }
            return c.count > 0 ? String(c.count) : nil
        }
        let parts = [(HelpedOutcome.helpedLot, "said it helped a lot"), (.helpedLittle, "said it helped a little"), (.noChange, "saw no change")]
            .compactMap { o, words in amount(o).map { "\($0) \(words)" } }
        let tried = parts.isEmpty ? nil : "Of those who tried this and reported back, \(joined(parts))."
        guard let n = amount(.notTried) else { return (tried, nil) }
        let who = n == "a few" ? "A few" : n
        return (tried, tried == nil ? "\(who) who reported back said they didn’t get to try it." : "\(who) more said they didn’t get to try it.")
    }

    private static func joined(_ parts: [String]) -> String {
        parts.count < 2 ? parts.first ?? "" : parts.dropLast().joined(separator: ", ") + " and " + parts[parts.count - 1]
    }
}
