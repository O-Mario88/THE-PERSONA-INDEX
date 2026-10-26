import Foundation
import Observation
import PersonaKit

/// Reflect's state on the device: the person's writing, what they want to
/// try, their drafts and choices. Nothing here is ever sent; the backup will
/// carry it only in its end-to-end journal copy.
@MainActor
@Observable
final class ReflectModel {
    private(set) var reflections: [ReflectionEntry] = []
    private(set) var intentions: [Intention] = []
    private(set) var settings = JournalStore.Settings()

    private let defaults: KeyValueStore
    private var store: ReflectionStore { ReflectionStore(store: defaults) }
    private var tries: IntentionStore { IntentionStore(store: defaults) }
    var journal: JournalStore { JournalStore(store: defaults) }

    init(defaults: KeyValueStore) {
        self.defaults = defaults
        load()
    }

    func load() {
        reflections = store.all()
        intentions = tries.all()
        settings = journal.settings
    }

    func due(_ today: String) -> [Intention] { tries.due(today) }
    func thread(_ root: String) -> [ReflectionEntry] { store.thread(root) }

    /// Keeps what was written for a question (or none), with why it appeared.
    @discardableResult
    func save(_ text: String, thought: Thought?, period: ReflectionPeriod, free: Bool, thread: String?, today: String) -> String? {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return nil }
        let id = "\(today)-\(free ? "free" : period.rawValue)-\(UUID().uuidString.prefix(8).lowercased())"
        let source: ReflectionSource = thought?.source == .week ? .yourWeek : .yourAnswers
        store.save(ReflectionEntry(id: id, date: today, period: period, area: thought?.area ?? .self, kind: .learnt, source: source,
                                   about: free ? "" : (thought?.lead ?? ""), question: free ? "Written freely" : (thought?.question ?? ""),
                                   answer: words, followsUp: thought?.followsUp, free: free, why: free ? nil : thought?.why, thread: thread))
        load()
        return id
    }

    /// Puts a saved reflection into the thread an earlier one belongs to.
    func link(_ id: String, to earlier: ReflectionEntry) {
        guard var r = reflections.first(where: { $0.id == id }) else { return }
        r.thread = earlier.root
        store.save(r)
        load()
    }

    /// An intention under a given id, so the same card saved on the web and here is one intention.
    func keepIntention(id: String, text: String, from: String, today: String) {
        tries.save(Intention(id: id, date: today, text: text, from: from))
        load()
    }

    func keepTry(_ text: String, from id: String, today: String) {
        tries.save(Intention(id: "\(id)-try", date: today, text: text, from: id))
        load()
    }

    func check(_ id: String, _ check: Intention.Check, today: String) {
        tries.check(id, check, today: today)
        load()
    }

    func dismissMemory(_ id: String) {
        journal.dismiss(id)
        load()
    }

    func setSettings(_ next: JournalStore.Settings) {
        journal.settings = next
        load()
    }

    /// Everything Reflect keeps, as a file for the person.
    func export() -> Data {
        struct Export: Encodable { let made: String; let reflections: [ReflectionEntry]; let intentions: [Intention] }
        let enc = JSONEncoder()
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? enc.encode(Export(made: ISO8601DateFormatter().string(from: Date()), reflections: reflections, intentions: intentions))) ?? Data()
    }

    func deleteAll() {
        for r in reflections { store.remove(r.id) }
        for i in intentions { tries.remove(i.id) }
        journal.clear()
        load()
    }
}
