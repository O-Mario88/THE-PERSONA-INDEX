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

    private func entries<T: Decodable>(_ kind: String, as: T.Type, among keys: [String]? = nil) -> [(at: Double, value: T)] {
        let prefix = Self.prefix + kind + "."
        let keys = keys?.filter { $0.hasPrefix(prefix) } ?? store.keys(withPrefix: prefix)
        return keys.compactMap { decode($0, kind: kind, as: T.self).map { ($0.at, $0.value) } }
    }

    private func decode<T: Decodable>(_ key: String, kind: String, as: T.Type) -> (at: Double, value: T)? {
        guard let json = store.string(forKey: key), let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              obj["kind"] as? String == kind, let at = obj["at"] as? Double,
              let value = try? JSONDecoder().decode(T.self, from: data) else { return nil }
        return (at, value)
    }

    /// Everything Saved shows, read with one listing of the keys: listing
    /// UserDefaults copies all of it, so screens hold this rather than reading
    /// each kind on every redraw.
    public struct Shelf: Sendable, Equatable {
        public var cards: [KeptCard] = []
        public var plans: [KeptPlan] = []
        public var names: [WeekName] = []
        public var sentences: [WeekSentence] = []
        public var goodThings: [GoodThings] = []

        public init(cards: [KeptCard] = [], plans: [KeptPlan] = [], names: [WeekName] = [], sentences: [WeekSentence] = [], goodThings: [GoodThings] = []) {
            self.cards = cards
            self.plans = plans
            self.names = names
            self.sentences = sentences
            self.goodThings = goodThings
        }
    }

    public func shelf() -> Shelf {
        let keys = store.keys(withPrefix: Self.prefix)
        return Shelf(cards: cards(among: keys), plans: plans(among: keys), names: names(among: keys),
                     sentences: sentences(among: keys), goodThings: goodThings(among: keys))
    }

    // MARK: Kept cards

    public func cards() -> [KeptCard] { cards(among: nil) }

    private func cards(among keys: [String]?) -> [KeptCard] {
        entries("card", as: KeptCard.self, among: keys).map(\.value).sorted { ($0.date, $0.at) > ($1.date, $1.at) }
    }

    /// One key read: a card is kept under its own question's key.
    public func isKept(_ questionId: String) -> Bool {
        decode(Self.prefix + "card." + questionId, kind: "card", as: KeptCard.self) != nil
    }

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

    public func plans() -> [KeptPlan] { plans(among: nil) }
    public func names() -> [WeekName] { names(among: nil) }
    public func sentences() -> [WeekSentence] { sentences(among: nil) }
    public func goodThings() -> [GoodThings] { goodThings(among: nil) }

    private func plans(among keys: [String]?) -> [KeptPlan] {
        entries("plan", as: KeptPlan.self, among: keys).map(\.value).sorted { $0.made > $1.made }
    }
    private func names(among keys: [String]?) -> [WeekName] {
        entries("name", as: WeekName.self, among: keys).map(\.value).sorted { $0.week > $1.week }
    }
    private func sentences(among keys: [String]?) -> [WeekSentence] {
        entries("sentence", as: WeekSentence.self, among: keys).map(\.value).sorted { $0.week > $1.week }
    }
    private func goodThings(among keys: [String]?) -> [GoodThings] {
        entries("good", as: GoodThings.self, among: keys).map(\.value).sorted { $0.date > $1.date }
    }

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
