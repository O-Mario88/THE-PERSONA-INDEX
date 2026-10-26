import Foundation

// The writing in Reflect, on the device, in the same shapes and keys as the
// web (frontend/src/notebook.ts, journal.ts, thoughts.ts), so the end-to-end
// journal copy of the backup reads the same on either side. Every key here
// is one the web's registry marks "journal": pi.nb.reflection.*,
// pi.nb.intention.* and pi.reflect.*.

nonisolated(unsafe) let isoDay: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

func addDays(_ date: String, _ n: Int) -> String {
    guard let d = isoDay.date(from: date) else { return date }
    return isoDay.string(from: d.addingTimeInterval(TimeInterval(n * 86_400)))
}

func daysBetween(_ from: String, _ to: String) -> Int {
    guard let a = isoDay.date(from: from), let b = isoDay.date(from: to) else { return 0 }
    return Int((b.timeIntervalSince(a) / 86_400).rounded())
}

/// One reflection the person wrote.
public struct ReflectionEntry: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let date: String
    public let period: ReflectionPeriod
    public let area: LifeArea
    public let kind: ReflectionKind
    public let source: ReflectionSource
    public let about: String
    public let question: String
    public let answer: String
    public var followsUp: String?
    public var free: Bool
    public var why: String?
    public var thread: String?
    public var at: Double

    public init(id: String, date: String, period: ReflectionPeriod, area: LifeArea, kind: ReflectionKind, source: ReflectionSource,
                about: String, question: String, answer: String, followsUp: String? = nil, free: Bool = false, why: String? = nil, thread: String? = nil) {
        self.id = id
        self.date = date
        self.period = period
        self.area = area
        self.kind = kind
        self.source = source
        self.about = about
        self.question = question
        self.answer = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        self.followsUp = followsUp
        self.free = free
        self.why = why
        self.thread = thread
        self.at = Date().timeIntervalSince1970 * 1000
    }

    /// The thread this reflection belongs to: its own id if it started one.
    public var root: String { thread ?? id }

    enum CodingKeys: String, CodingKey {
        case kind, id, date, period, area, group, source, about, question, answer, followsUp, free, why, thread, at
    }

    private static let webSource: [ReflectionSource: String] = [.yourAnswers: "answers", .yourWeek: "week", .yourCircle: "circle"]

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("reflection", forKey: .kind)
        try c.encode(id, forKey: .id)
        try c.encode(date, forKey: .date)
        try c.encode(period, forKey: .period)
        try c.encode(area, forKey: .area)
        try c.encode(kind, forKey: .group)
        try c.encode(Self.webSource[source], forKey: .source)
        try c.encode(about, forKey: .about)
        try c.encode(question, forKey: .question)
        try c.encode(answer, forKey: .answer)
        try c.encodeIfPresent(followsUp, forKey: .followsUp)
        if free { try c.encode(true, forKey: .free) }
        try c.encodeIfPresent(why, forKey: .why)
        try c.encodeIfPresent(thread, forKey: .thread)
        try c.encode(at, forKey: .at)
    }

    /// Reads the web's shape, and the native shape of before (kind: learnt).
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        date = try c.decode(String.self, forKey: .date)
        period = try c.decode(ReflectionPeriod.self, forKey: .period)
        area = try c.decode(LifeArea.self, forKey: .area)
        kind = try c.decodeIfPresent(ReflectionKind.self, forKey: .group) ?? c.decode(ReflectionKind.self, forKey: .kind)
        let raw = try c.decode(String.self, forKey: .source)
        source = Self.webSource.first { $0.value == raw }?.key ?? ReflectionSource(rawValue: raw) ?? .yourAnswers
        about = try c.decode(String.self, forKey: .about)
        question = try c.decode(String.self, forKey: .question)
        answer = try c.decode(String.self, forKey: .answer)
        followsUp = try c.decodeIfPresent(String.self, forKey: .followsUp)
        free = try c.decodeIfPresent(Bool.self, forKey: .free) ?? false
        why = try c.decodeIfPresent(String.self, forKey: .why)
        thread = try c.decodeIfPresent(String.self, forKey: .thread)
        at = try c.decodeIfPresent(Double.self, forKey: .at) ?? 0
    }
}

/// A list of ids under one key, for stores the device cannot list by prefix.
private struct Index {
    let store: KeyValueStore
    let key: String
    var legacy: String? = nil

    func ids() -> [String] {
        let read = { (k: String) in self.store.string(forKey: k)?.split(separator: ",").map(String.init) ?? [] }
        return Array(Set(read(key) + (legacy.map(read) ?? []))).sorted()
    }

    func add(_ id: String) { store.set(Array(Set(ids() + [id])).sorted().joined(separator: ","), forKey: key) }
    func remove(_ id: String) { store.set(ids().filter { $0 != id }.joined(separator: ","), forKey: key) }
}

/// Every reflection, under pi.nb.reflection.<id>.
public struct ReflectionStore: Sendable {
    private let store: KeyValueStore
    static let prefix = "pi.nb.reflection."
    private var index: Index { Index(store: store, key: "pi.reflect.index", legacy: "pi.nb.reflections") }

    public init(store: KeyValueStore) { self.store = store }

    public func save(_ entry: ReflectionEntry) {
        guard let data = try? JSONEncoder().encode(entry), let json = String(data: data, encoding: .utf8) else { return }
        store.set(json, forKey: Self.prefix + entry.id)
        index.add(entry.id)
    }

    public func remove(_ id: String) {
        store.set(nil, forKey: Self.prefix + id)
        index.remove(id)
    }

    /// Newest first.
    public func all() -> [ReflectionEntry] {
        index.ids().compactMap { id in
            store.string(forKey: Self.prefix + id).flatMap { try? JSONDecoder().decode(ReflectionEntry.self, from: Data($0.utf8)) }
        }
        .sorted { ($0.date, $0.at) > ($1.date, $1.at) }
    }

    /// A thread's entries, oldest first.
    public func thread(_ root: String) -> [ReflectionEntry] {
        all().filter { $0.id == root || $0.thread == root }.sorted { ($0.date, $0.at) < ($1.date, $1.at) }
    }
}

/// "Something I'd like to try", and how it went a week later. No scores:
/// "let it go" is an answer like any other.
public struct Intention: Codable, Sendable, Hashable, Identifiable {
    public enum Check: String, Codable, Sendable, CaseIterable {
        case helped, some, notYet = "not_yet", letGo = "let_go"
        public var label: String {
            switch self {
            case .helped: "It helped"
            case .some: "A little"
            case .notYet: "Not yet"
            case .letGo: "Let it go"
            }
        }
    }

    public var kind = "intention"
    public let id: String
    public let date: String
    public let text: String
    public let from: String
    public let checkOn: String
    public var check: Check?
    public var checkedOn: String?
    public var at: Double = Date().timeIntervalSince1970 * 1000

    static let checkDays = 7

    public init(id: String, date: String, text: String, from: String) {
        self.id = id
        self.date = date
        self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.from = from
        self.checkOn = addDays(date, Self.checkDays)
    }
}

public struct IntentionStore: Sendable {
    private let store: KeyValueStore
    static let prefix = "pi.nb.intention."
    private var index: Index { Index(store: store, key: "pi.reflect.intentions") }

    public init(store: KeyValueStore) { self.store = store }

    public func save(_ i: Intention) {
        guard !i.text.isEmpty, let data = try? JSONEncoder().encode(i) else { return }
        store.set(String(data: data, encoding: .utf8), forKey: Self.prefix + i.id)
        index.add(i.id)
    }

    public func all() -> [Intention] {
        index.ids().compactMap { id in store.string(forKey: Self.prefix + id).flatMap { try? JSONDecoder().decode(Intention.self, from: Data($0.utf8)) } }
            .sorted { $0.date > $1.date }
    }

    public func check(_ id: String, _ check: Intention.Check, today: String) {
        guard var i = all().first(where: { $0.id == id }) else { return }
        i.check = check
        i.checkedOn = today
        i.at = Date().timeIntervalSince1970 * 1000
        save(i)
    }

    public func remove(_ id: String) {
        store.set(nil, forKey: Self.prefix + id)
        index.remove(id)
    }

    /// The check-ins due today, oldest first.
    public func due(_ today: String) -> [Intention] { all().filter { $0.check == nil && $0.checkOn <= today }.reversed() }
}

/// Drafts, memories put away and the two Reflect choices: pi.reflect.*.
public struct JournalStore: Sendable {
    private let store: KeyValueStore
    public init(store: KeyValueStore) { self.store = store }

    public func draft(_ space: String) -> String { store.string(forKey: "pi.reflect.draft.\(space)") ?? "" }
    public func saveDraft(_ space: String, _ text: String) {
        store.set(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text, forKey: "pi.reflect.draft.\(space)")
    }

    private func dismissed() -> [String] {
        store.string(forKey: "pi.reflect.dismissed").flatMap { try? JSONDecoder().decode([String].self, from: Data($0.utf8)) } ?? []
    }
    public func dismiss(_ id: String) {
        let next = Array(Set(dismissed() + [id])).sorted()
        store.set(String(data: (try? JSONEncoder().encode(next)) ?? Data(), encoding: .utf8), forKey: "pi.reflect.dismissed")
    }

    public struct Settings: Codable, Sendable, Equatable {
        public var threadsInMirror = false
        public var reflectionsInNoticed = false
        public var reflectionsInGrowth = false
        public init() {}

        /// Choices saved before a newer one existed keep their values; the
        /// missing one starts off, as on the web.
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            threadsInMirror = try c.decodeIfPresent(Bool.self, forKey: .threadsInMirror) ?? false
            reflectionsInNoticed = try c.decodeIfPresent(Bool.self, forKey: .reflectionsInNoticed) ?? false
            reflectionsInGrowth = try c.decodeIfPresent(Bool.self, forKey: .reflectionsInGrowth) ?? false
        }
    }
    public var settings: Settings {
        get { store.string(forKey: "pi.reflect.settings").flatMap { try? JSONDecoder().decode(Settings.self, from: Data($0.utf8)) } ?? Settings() }
        nonmutating set { store.set(String(data: (try? JSONEncoder().encode(newValue)) ?? Data(), encoding: .utf8), forKey: "pi.reflect.settings") }
    }

    /// Clears drafts, memories put away and choices, when reflections are deleted.
    public func clear() {
        for s in ["day", "week", "month", "free"] { store.set(nil, forKey: "pi.reflect.draft.\(s)") }
        store.set(nil, forKey: "pi.reflect.dismissed")
        store.set(nil, forKey: "pi.reflect.settings")
    }

    static func ago(_ days: Int) -> String {
        if days < 14 { return "Last week" }
        if days < 21 { return "Two weeks ago" }
        if days < 45 { return "A few weeks ago" }
        let months = Int((Double(days) / 30).rounded())
        let words = ["", "One", "Two", "Three", "Four", "Five", "Six"]
        return months <= 1 ? "A month ago" : "\(months < words.count ? words[months] : String(months)) months ago"
    }

    /// Words from a week or a few back, not followed up or put away.
    public func memory(in all: [ReflectionEntry], today: String) -> (entry: ReflectionEntry, when: String)? {
        let followed = Set(all.compactMap(\.followsUp))
        let away = Set(dismissed())
        guard let r = all.first(where: { let d = daysBetween($0.date, today); return d >= 5 && d <= 40 && !followed.contains($0.id) && !away.contains($0.id) })
        else { return nil }
        return (r, Self.ago(daysBetween(r.date, today)))
    }

    /// Words from two months or more ago, the start of a thread first.
    public func journey(in all: [ReflectionEntry], today: String) -> (entry: ReflectionEntry, when: String, since: Int)? {
        let old = all.filter { daysBetween($0.date, today) >= 60 && $0.thread == nil }
        struct Ranked { let entry: ReflectionEntry; let since: Int }
        let ranked: [Ranked] = old.map { r in Ranked(entry: r, since: all.filter { $0.thread == r.id }.count) }
        let sorted = ranked.sorted { a, b in a.since != b.since ? a.since > b.since : a.entry.date < b.entry.date }
        guard let top = sorted.first else { return nil }
        return (top.entry, Self.ago(daysBetween(top.entry.date, today)), top.since)
    }

    static let reminders = [
        "You don’t need to have everything figured out to make progress.",
        "A few honest words are enough. There is no right length.",
        "Missing a day undoes nothing. Come back whenever you like.",
        "Noticing is already a kind of change.",
        "You can write about a small thing. Small things count.",
    ]

    /// One line a day, never a nudge to do more.
    public static func reminder(_ today: String) -> String {
        reminders[(Int(today.replacingOccurrences(of: "-", with: "")) ?? 0) % reminders.count]
    }
}
