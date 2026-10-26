import Foundation
import Testing
@testable import PersonaKit

/// Saved: the web's notebook (frontend/src/notebook.ts), read and written in
/// the same shape so a backup carries it between the web and the app.
@Suite("Saved")
struct NotebookTests {
    func card(_ id: String, date: String = "2026-10-26", private isPrivate: Bool = false) -> KeptCard {
        KeptCard(date: date, questionId: id, theme: "habits", private: isPrivate ? true : nil, prompt: "When do you wash the dishes?",
                 answer: "Right after eating", headline: "You like a clear surface.", body: "It helps you rest.", otherSide: nil, step: "Leave one cup.", verdict: nil)
    }

    @Test("keeps a card under the web's key and shape, stamped with when it changed")
    func keeps() throws {
        let store = MemoryStore()
        Notebook(store: store).keep(card("q1"))
        let json = try #require(store.string(forKey: "pi.nb.card.q1"))
        let obj = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any]
        #expect(obj?["kind"] as? String == "card")
        #expect(obj?["headline"] as? String == "You like a clear surface.")
        #expect((obj?["at"] as? Double ?? 0) > 0)
        #expect(Notebook(store: store).isKept("q1"))
    }

    @Test("lists cards newest first, reading ones the web wrote")
    func lists() {
        let store = MemoryStore()
        store.set(#"{"kind":"card","at":5,"date":"2026-10-20","questionId":"w1","theme":"rest","prompt":"A free evening?","answer":"Chores","headline":"You finish what you start."}"#, forKey: "pi.nb.card.w1")
        Notebook(store: store).keep(card("q1"))
        #expect(Notebook(store: store).cards().map(\.questionId) == ["q1", "w1"])
    }

    @Test("removing leaves a mark, so an older backup can't bring the card back")
    func removes() throws {
        let store = MemoryStore()
        Notebook(store: store).keep(card("q1"))
        Notebook(store: store).remove("q1")
        #expect(Notebook(store: store).cards().isEmpty)
        let obj = try JSONSerialization.jsonObject(with: Data(try #require(store.string(forKey: "pi.nb.card.q1")).utf8)) as? [String: Any]
        #expect(obj?["removed"] as? Bool == true)
        #expect(!Notebook(store: store).isKept("q1"))
    }

    @Test("reads the plans, the names given to weeks, Sunday sentences and good things the web kept")
    func readsTheRest() {
        let store = MemoryStore()
        store.set(#"{"kind":"plan","at":1,"id":"p1","made":"2026-10-20","trait":"conscientiousness","high":true,"when":"after lunch","will":"take a walk","checks":[]}"#, forKey: "pi.nb.plan.p1")
        store.set(#"{"kind":"name","at":1,"week":"2026-10-19","suggested":"a steady finisher","name":"The Quiet Finisher"}"#, forKey: "pi.nb.name.2026-10-19")
        store.set(#"{"kind":"sentence","at":1,"week":"2026-10-19","text":"I rest better after a walk."}"#, forKey: "pi.nb.sentence.2026-10-19")
        store.set(#"{"kind":"good","at":1,"date":"2026-10-24","lines":["Tea with Kofi","A walk"]}"#, forKey: "pi.nb.good.2026-10-24")
        let nb = Notebook(store: store)
        #expect(nb.plans().first?.will == "take a walk")
        #expect(nb.names().first?.name == "The Quiet Finisher")
        #expect(nb.sentences().first?.text == "I rest better after a walk.")
        #expect(nb.goodThings().first?.lines == ["Tea with Kofi", "A walk"])
    }

    @Test("travels in the backup's main copy; reflections stay in the journal copy")
    func backup() {
        #expect(BackupRegistry.copy(of: "pi.nb.card.q1") == .main)
        #expect(BackupRegistry.copy(of: "pi.nb.plan.p1") == .main)
        #expect(BackupRegistry.copy(of: "pi.nb.reflection.r1") == .journal)
        #expect(BackupRegistry.copy(of: "pi.nb.intention.i1") == .journal)
    }

    @Test("exports what Saved holds as a file the person keeps")
    func exports() throws {
        let store = MemoryStore()
        Notebook(store: store).keep(card("q1"))
        let data = Notebook(store: store).export()
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect((obj?["cards"] as? [[String: Any]])?.first?["questionId"] as? String == "q1")
    }

    @Test("reads everything Saved holds in one pass, the same as reading each kind")
    func shelf() {
        let store = CountingStore()
        let nb = Notebook(store: store)
        nb.keep(card("q1"))
        nb.keep(card("q2", date: "2026-10-27"))
        store.set(#"{"kind":"plan","at":1,"id":"p1","made":"2026-10-20","trait":"conscientiousness","high":true,"when":"after lunch","will":"take a walk","checks":[]}"#, forKey: "pi.nb.plan.p1")
        store.set(#"{"kind":"name","at":1,"week":"2026-10-19","suggested":"a steady finisher","name":"The Quiet Finisher"}"#, forKey: "pi.nb.name.2026-10-19")
        store.set(#"{"kind":"sentence","at":1,"week":"2026-10-19","text":"I rest better after a walk."}"#, forKey: "pi.nb.sentence.2026-10-19")
        store.set(#"{"kind":"good","at":1,"date":"2026-10-21","lines":["Tea with Kofi"]}"#, forKey: "pi.nb.good.2026-10-21")
        store.scans = 0
        let shelf = nb.shelf()
        #expect(store.scans == 1)
        #expect(shelf == Notebook.Shelf(cards: nb.cards(), plans: nb.plans(), names: nb.names(), sentences: nb.sentences(), goodThings: nb.goodThings()))
        #expect(shelf.cards.map(\.questionId) == ["q2", "q1"])
    }

    @Test("checks one card by its own key, without reading the rest")
    func isKeptReadsOneKey() {
        let store = CountingStore()
        let nb = Notebook(store: store)
        nb.keep(card("q1"))
        store.scans = 0
        #expect(nb.isKept("q1"))
        #expect(!nb.isKept("q2"))
        nb.remove("q1")
        #expect(!nb.isKept("q1"))
        store.set(#"{"kind":"plan","at":1}"#, forKey: "pi.nb.card.odd")
        #expect(!nb.isKept("odd"))
        #expect(store.scans == 0)
    }
}

/// Memory, counting how often every key is listed (slow on a real device).
final class CountingStore: KeyValueStore, @unchecked Sendable {
    private let inner = MemoryStore()
    var scans = 0
    func string(forKey key: String) -> String? { inner.string(forKey: key) }
    func set(_ value: String?, forKey key: String) { inner.set(value, forKey: key) }
    func keys(withPrefix prefix: String) -> [String] { scans += 1; return inner.keys(withPrefix: prefix) }
}
