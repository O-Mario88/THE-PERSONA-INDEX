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
}
