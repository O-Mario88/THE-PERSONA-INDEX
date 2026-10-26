import Foundation

// Saved: the web's notebook (frontend/src/notebook.ts), in the same shape so
// a backup carries it between the web and the app. Each entry is its own key
// under pi.nb.<kind>., stamped with when it last changed (at) so a merge keeps
// the newer copy. Removing an entry leaves a mark ({removed, at}) so a backup
// from before the removal cannot bring it back. Nothing here is sent.

public struct KeptCard: Codable, Sendable, Hashable, Identifiable {
    public var kind = "card"
    public var at: Double = 0
    public let date: String
    public let questionId: String
    public let theme: String
    public var `private`: Bool?
    public let prompt: String
    public let answer: String
    public var words: String?
    public let headline: String
    public var body: String?
    public var otherSide: String?
    public var step: String?
    public var verdict: String?
    public var id: String { questionId }

    public init(date: String, questionId: String, theme: String, private isPrivate: Bool?, prompt: String, answer: String,
                headline: String, body: String?, otherSide: String?, step: String?, verdict: String?) {
        self.date = date
        self.questionId = questionId
        self.theme = theme
        self.private = isPrivate
        self.prompt = prompt
        self.answer = answer
        self.headline = headline
        self.body = body
        self.otherSide = otherSide
        self.step = step
        self.verdict = verdict
    }
}

public struct KeptPlan: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let made: String
    public let trait: String
    public let high: Bool
    public let when: String
    public let will: String
    public var closed: Bool?
}

public struct WeekName: Codable, Sendable, Hashable {
    public let week: String
    public let suggested: String
    public let name: String
}

public struct WeekSentence: Codable, Sendable, Hashable {
    public let week: String
    public let text: String
}

public struct GoodThings: Codable, Sendable, Hashable {
    public let date: String
    public let lines: [String]
}

public struct Notebook: Sendable {
    static let prefix = "pi.nb."
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    private func entries<T: Decodable>(_ kind: String, as: T.Type) -> [(at: Double, value: T)] {
        store.keys(withPrefix: Self.prefix + kind + ".").compactMap { key in
            guard let json = store.string(forKey: key), let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  obj["kind"] as? String == kind, let at = obj["at"] as? Double,
                  let value = try? JSONDecoder().decode(T.self, from: data) else { return nil }
            return (at, value)
        }
    }

    // MARK: Kept cards

    public func cards() -> [KeptCard] {
        entries("card", as: KeptCard.self).map(\.value).sorted { ($0.date, $0.at) > ($1.date, $1.at) }
    }

    public func isKept(_ questionId: String) -> Bool { cards().contains { $0.questionId == questionId } }

    public func keep(_ card: KeptCard) {
        var c = card
        c.kind = "card"
        c.at = max(Date().timeIntervalSince1970 * 1000, c.at + 1)
        guard let data = try? JSONEncoder().encode(c) else { return }
        store.set(String(data: data, encoding: .utf8), forKey: Self.prefix + "card." + c.questionId)
    }

    public func remove(_ questionId: String) {
        let key = Self.prefix + "card." + questionId
        guard store.string(forKey: key) != nil else { return }
        store.set(#"{"removed":true,"at":\#(Int(Date().timeIntervalSince1970 * 1000))}"#, forKey: key)
    }

    // MARK: What the web keeps that the app shows

    public func plans() -> [KeptPlan] { entries("plan", as: KeptPlan.self).map(\.value).sorted { $0.made > $1.made } }
    public func names() -> [WeekName] { entries("name", as: WeekName.self).map(\.value).sorted { $0.week > $1.week } }
    public func sentences() -> [WeekSentence] { entries("sentence", as: WeekSentence.self).map(\.value).sorted { $0.week > $1.week } }
    public func goodThings() -> [GoodThings] { entries("good", as: GoodThings.self).map(\.value).sorted { $0.date > $1.date } }

    /// Everything Saved holds, as a file the person keeps.
    public func export() -> Data {
        struct File: Encodable {
            let cards: [KeptCard]
            let plans: [KeptPlan]
            let names: [WeekName]
            let sentences: [WeekSentence]
            let goodThings: [GoodThings]
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? encoder.encode(File(cards: cards(), plans: plans(), names: names(), sentences: sentences(), goodThings: goodThings()))) ?? Data()
    }
}
