import Foundation

// On-device pieces of the new Connect, ported from the web so a backup reads
// the same on either side (frontend/src/profile.ts, connection.ts,
// commonTags.ts): the answer history, the person's own moves towards
// friends ("Your week in connection"), and Common Ground suggestions.

private func shift(_ date: String, by days: Int) -> String {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: date) else { return date }
    return f.string(from: d.addingTimeInterval(TimeInterval(days * 86_400)))
}

/// The answers of the last 60 days, under the web's pi.history.v1, keeping
/// any fields the web wrote that this app does not use.
public struct AnswerHistory: Sendable {
    public static let key = "pi.history.v1"
    static let keepDays = 60
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    public struct Answer: Sendable, Hashable {
        public let date: String
        public let questionId: String
        public let theme: String
        public let optionId: String?
        public let verdict: String?
        public var need: String? = nil
        public var heavy = false
        public var regional = false
    }

    private func raw() -> (answers: [[String: Any]], skips: [[String: Any]]) {
        guard let s = store.string(forKey: Self.key), let data = s.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return ([], []) }
        return (obj["answers"] as? [[String: Any]] ?? [], obj["skips"] as? [[String: Any]] ?? [])
    }

    public func answers() -> [Answer] {
        raw().answers.compactMap { a in
            guard let date = a["date"] as? String, let q = a["questionId"] as? String, let theme = a["theme"] as? String else { return nil }
            return Answer(date: date, questionId: q, theme: theme, optionId: a["optionId"] as? String, verdict: a["verdict"] as? String,
                          need: a["need"] as? String, heavy: a["heavy"] as? Bool ?? false, regional: a["regional"] as? Bool ?? false)
        }
    }

    /// Keeps the tap under a card ("That's me", "Partly", "Not me") with its answer.
    public func setVerdict(_ verdict: Verdict, for questionId: String) {
        var (answers, skips) = raw()
        guard let i = answers.firstIndex(where: { ($0["questionId"] as? String) == questionId }) else { return }
        answers[i]["verdict"] = verdict.rawValue
        save(answers, skips)
    }

    private func save(_ answers: [[String: Any]], _ skips: [[String: Any]]) {
        if let data = try? JSONSerialization.data(withJSONObject: ["answers": answers, "skips": skips]), let s = String(data: data, encoding: .utf8) {
            store.set(s, forKey: Self.key)
        }
    }

    /// Records an answer, replacing an earlier one to the same question.
    public func record(_ question: Question, optionId: String, date: String) {
        guard let theme = question.theme, let option = question.options.first(where: { $0.id == optionId }) else { return }
        var (answers, skips) = raw()
        answers.removeAll { ($0["questionId"] as? String) == question.id }
        var entry: [String: Any] = ["date": date, "questionId": question.id, "theme": theme, "depth": option.depth ?? 1, "traits": [String: Int](), "optionId": optionId]
        if option.heavy == true { entry["heavy"] = true }
        if let need = option.need { entry["need"] = need }
        answers.append(entry)
        let from = shift(date, by: -Self.keepDays)
        answers = answers.filter { ($0["date"] as? String ?? "") >= from }
        skips = skips.filter { ($0["date"] as? String ?? "") >= from }
        if let data = try? JSONSerialization.data(withJSONObject: ["answers": answers, "skips": skips]), let s = String(data: data, encoding: .utf8) {
            store.set(s, forKey: Self.key)
        }
    }
}

public enum ConnectionKind: String, Codable, Sendable, CaseIterable {
    case nod, share, support, celebrate
}

public struct ConnectionCounts: Sendable, Equatable {
    public var nod = 0, share = 0, support = 0, celebrate = 0, days = 0
    public var total: Int { nod + share + support + celebrate }
    subscript(kind: ConnectionKind) -> Int {
        get { switch kind { case .nod: nod; case .share: share; case .support: support; case .celebrate: celebrate } }
        set { switch kind { case .nod: nod = newValue; case .share: share = newValue; case .support: support = newValue; case .celebrate: celebrate = newValue } }
    }
}

/// "Your week in connection": each move towards a friend, noted on this
/// device with only its day and kind, never who, and never sent. A year.
public struct ConnectionLog: Sendable {
    public static let key = "pi.connection.v1"
    static let keepDays = 366
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    private struct Entry: Codable { let d: String; let k: ConnectionKind }

    private func entries() -> [Entry] {
        guard let s = store.string(forKey: Self.key), let data = s.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([Entry].self, from: data)) ?? []
    }

    public func note(_ kind: ConnectionKind, on date: String) {
        let from = shift(date, by: -Self.keepDays)
        let next = entries().filter { $0.d >= from } + [Entry(d: date, k: kind)]
        if let data = try? JSONEncoder().encode(next) { store.set(String(data: data, encoding: .utf8), forKey: Self.key) }
    }

    public func between(_ from: String, _ to: String) -> ConnectionCounts {
        let within = entries().filter { $0.d >= from && $0.d <= to }
        var c = ConnectionCounts()
        c.days = Set(within.map(\.d)).count
        for e in within { c[e.k] += 1 }
        return c
    }

    private static let numbers = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
    private static func say(_ n: Int) -> String { n < numbers.count ? numbers[n] : String(n) }

    /// One plain sentence. A quiet span is only quiet: no nudge, no judgement.
    public static func line(_ c: ConnectionCounts, span: String) -> String {
        var parts: [String] = []
        if c.nod > 0 { parts.append(c.nod == 1 ? "sent a quiet nod" : "sent \(say(c.nod)) quiet nods") }
        if c.share > 0 { parts.append(c.share == 1 ? "shared one thing that helped" : "shared \(say(c.share)) things that helped") }
        if c.support > 0 { parts.append(c.support == 1 ? "asked someone for support" : "asked for support \(say(c.support)) times") }
        if c.celebrate > 0 { parts.append(c.celebrate == 1 ? "celebrated a win with someone" : "celebrated \(say(c.celebrate)) wins with friends") }
        guard !parts.isEmpty else { return "A quiet \(span) for connection. That is all it was." }
        let list = parts.count == 1 ? parts[0] : parts.dropLast().joined(separator: ", ") + " and " + parts.last!
        return "This \(span) you \(list)."
    }
}

/// Common Ground suggestions from the themes answered most. Only a
/// suggestion: the person reviews them before anything is sent. Intimate
/// themes and cards called "Not me" never count.
public enum CommonSuggestions {
    static let tagOf: [String: String] = [
        "rest": "peace-calm", "sadness-stress": "peace-calm", "anger": "peace-calm", "happiness": "peace-calm",
        "work-career": "work-life", "colleagues": "work-life", "plans": "work-life", "phone": "work-life",
        "confidence": "growth", "habits": "growth", "ambition-desire": "growth",
        "friendship": "meaningful-time", "celebrations": "meaningful-time", "quality-quantity": "meaningful-time", "partnership": "meaningful-time", "faith": "meaningful-time",
        "body": "health", "food": "health", "sleep-health": "health", "getting-around": "health",
        "family": "family", "relatives": "family", "parenting": "family", "home": "family",
        "learning": "learning", "school": "learning",
        "honesty": "honesty",
        "helping": "kindness", "neighbours": "kindness",
        "money": "independence", "wealth-luxury": "independence",
    ]
    static let minAnswers = 3
    static let maxSuggested = 4

    public static func from(_ answers: [AnswerHistory.Answer]) -> [String] {
        var counts: [String: Int] = [:]
        for a in answers where a.verdict != "not_me" {
            if let tag = tagOf[a.theme] { counts[tag, default: 0] += 1 }
        }
        return counts.filter { $0.value >= minAnswers }
            .sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(maxSuggested)
            .map(\.key)
    }
}
