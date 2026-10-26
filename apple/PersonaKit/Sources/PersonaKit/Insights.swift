import Foundation

// Insights on the device, in step with the web (frontend/src/insights.ts).
// Everything is worked out here from the person's own answers; the only
// thing fetched is the counts for You're not alone, which are the same for
// everyone (GET /api/not-alone), so asking says nothing about which
// questions this device answered. No percentages, no scores; an evidence
// level is a label, never a rank; heavy answers get people, not a step.

/// The card an answer showed, kept 30 days under pi.insight.<question id>,
/// in the web's shape.
public struct CardText: Codable, Sendable, Hashable {
    public let date: String
    public let questionId: String
    public var theme: String?
    public let prompt: String
    public let label: String
    public var need: String?
    public var heavy: Bool?
    public var reveal: String?
    public var otherSide: String?
    public var step: String?

    /// The card a question's option showed, or nil for an intimate question.
    init?(_ q: Question, optionId: String, date: String) {
        guard q.care != .intimate, let o = q.options.first(where: { $0.id == optionId }) else { return nil }
        let insight = o.heavy == true ? nil : o.insight
        self.date = date
        questionId = q.id
        theme = q.theme
        prompt = q.prompt
        label = o.label
        need = o.need
        heavy = o.heavy == true ? true : nil
        reveal = insight?.reveal
        otherSide = insight?.otherSide
        step = insight?.step
    }
}

public struct CardTexts: Sendable {
    static let prefix = "pi.insight."
    /// The question ids kept, so old cards can be let go of.
    static let indexKey = "pi.insights.index"
    public static let days = 30
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    public func keep(_ q: Question, optionId: String, date: String) {
        guard let text = CardText(q, optionId: optionId, date: date),
              let data = try? JSONEncoder().encode(text), let json = String(data: data, encoding: .utf8) else { return }
        store.set(json, forKey: Self.prefix + q.id)
        let ids = Set(index() + [q.id]).sorted()
        store.set(ids.joined(separator: ","), forKey: Self.indexKey)
    }

    public func text(_ questionId: String) -> CardText? {
        store.string(forKey: Self.prefix + questionId).flatMap { try? JSONDecoder().decode(CardText.self, from: Data($0.utf8)) }
    }

    public func prune(today: String) {
        var kept: [String] = []
        for id in index() {
            if let t = text(id), daysBetween(t.date, today) < Self.days {
                kept.append(id)
            } else {
                store.set(nil, forKey: Self.prefix + id)
            }
        }
        store.set(kept.isEmpty ? nil : kept.joined(separator: ","), forKey: Self.indexKey)
    }

    private func index() -> [String] {
        (store.string(forKey: Self.indexKey) ?? "").split(separator: ",").map(String.init)
    }
}

/// How sure a card can be, from the person's own answers in the last 30 days.
public enum Evidence: Sendable, Equatable {
    case thought, noticing, pattern
}

/// One card in For You: what it said, the answer, and how sure it can be.
public struct ForYouCard: Sendable, Hashable, Identifiable {
    public let text: CardText
    public let optionId: String
    public let evidence: Evidence
    public let verdict: String?
    public let regional: Bool
    public var id: String { text.questionId }
    public var questionId: String { text.questionId }
    public var reveal: String? { text.reveal }
}

// You're not alone: the server's counts (backend/notalone.go).
public struct NotAloneOption: Codable, Sendable, Hashable {
    public let optionId: String
    public let count: Int
    public let few: Bool?
    public init(optionId: String, count: Int, few: Bool?) {
        self.optionId = optionId
        self.count = count
        self.few = few
    }
}

public struct NotAloneQuestion: Codable, Sendable, Hashable {
    public let questionId: String
    public let total: Int
    public let options: [NotAloneOption]
    public init(questionId: String, total: Int, options: [NotAloneOption]) {
        self.questionId = questionId
        self.total = total
        self.options = options
    }
}

public struct NotAlone: Codable, Sendable {
    public let date: String
    public let days: Int
    public let min: Int
    public let questions: [NotAloneQuestion]
}

public enum NotAloneLine: Sendable, Equatable {
    case count(same: Int, total: Int), few, forming
}

public enum Insights {
    /// What an answer reaches for, in the words the web uses (frontend/src/needs.ts).
    public static let needNames: [String: String] = [
        "freedom": "Choosing for yourself",
        "belonging": "Being close to people",
        "respect": "Being respected",
        "competence": "Doing well",
        "security": "Feeling safe, having enough",
        "calm": "Feeling settled",
        "understood": "Being understood",
    ]

    public static func needName(_ need: String) -> String? { needNames[need] }

    static let noticingAnswers = 3 // the same need across several answers…
    static let noticingDays = 2 // …on more than one day
    static let patternSpan = 7 // and, to be a pattern, at least a week apart

    public static func evidence(_ answers: [AnswerHistory.Answer], need: String, today: String) -> Evidence {
        let recent = answers.filter { $0.need == need && $0.theme != "intimacy" && !$0.heavy && daysBetween($0.date, today) < CardTexts.days }
        // "Not me" on any of them: the person has said this is not a pattern.
        if recent.contains(where: { $0.verdict == Verdict.notMe.rawValue }) { return .thought }
        let days = Array(Set(recent.map(\.date))).sorted()
        guard recent.count >= noticingAnswers, days.count >= noticingDays, let first = days.first, let last = days.last else { return .thought }
        return daysBetween(first, last) >= patternSpan ? .pattern : .noticing
    }

    public static func label(_ e: Evidence, date: String, today: String) -> String {
        switch e {
        case .pattern: "A pattern worth exploring"
        case .noticing: "Something you’ve been noticing"
        case .thought: date == today ? "A thought from today" : "A thought from \(Reflection.dayMonth(date))"
        }
    }

    /// The person's own answers from the last `days`, newest first, each with
    /// its card and how sure it can be. A card they said is not them is left
    /// out, and so is an answer whose card was not kept (today's questions
    /// stand in for one given before cards were kept).
    public static func forYou(store: KeyValueStore, today: String, days: Int, questions: [Question] = []) -> [ForYouCard] {
        let answers = AnswerHistory(store: store).answers()
        let texts = CardTexts(store: store)
        let cards: [ForYouCard] = answers.compactMap { a in
            guard let optionId = a.optionId, a.verdict != Verdict.notMe.rawValue, a.theme != "intimacy" else { return nil }
            let age = daysBetween(a.date, today)
            guard age >= 0, age < days else { return nil }
            let fallback = questions.first { $0.id == a.questionId }.flatMap { CardText($0, optionId: optionId, date: a.date) }
            guard let text = texts.text(a.questionId) ?? fallback else { return nil }
            let need = text.need ?? a.need
            let evidence = need.map { text.heavy == true ? Evidence.thought : Self.evidence(answers, need: $0, today: today) } ?? .thought
            return ForYouCard(text: text, optionId: optionId, evidence: evidence, verdict: a.verdict, regional: a.regional)
        }
        return cards.sorted { $0.text.date > $1.text.date }
    }

    public static func notAlone(_ counts: [NotAloneQuestion]?, questionId: String, optionId: String) -> NotAloneLine? {
        guard let counts else { return nil }
        guard let q = counts.first(where: { $0.questionId == questionId }), let o = q.options.first(where: { $0.optionId == optionId }) else { return .forming }
        return o.few == true ? .few : .count(same: o.count, total: q.total)
    }

    public static func line(_ line: NotAloneLine) -> String {
        switch line {
        case .forming: "The picture is still forming."
        case .few: "A few people chose the same response."
        case let .count(same, total): "\(same.formatted()) of \(total.formatted()) people chose the same response."
        }
    }
}

extension APIClient {
    /// The counts for You're not alone: the same for everyone, no pass.
    public func notAlone(_ date: String) async throws -> NotAlone {
        try await request("/api/not-alone", query: ["date": date])
    }
}
