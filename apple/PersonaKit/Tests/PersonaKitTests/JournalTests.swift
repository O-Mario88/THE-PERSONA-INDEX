import Foundation
import Testing
@testable import PersonaKit

/// A store that remembers every key written, for checking where writing goes.
final class RecordingStore: KeyValueStore, @unchecked Sendable {
    private var values: [String: String] = [:]
    private let lock = NSLock()
    var keys: [String] { lock.withLock { Array(values.keys) } }
    func string(forKey key: String) -> String? { lock.withLock { values[key] } }
    func set(_ value: String?, forKey key: String) { lock.withLock { values[key] = value } }
    func keys(withPrefix prefix: String) -> [String] { lock.withLock { values.keys.filter { $0.hasPrefix(prefix) } } }
}

@Suite("Reflect's writing on the device")
struct JournalTests {
    private func entry(_ id: String, _ date: String, _ answer: String, thread: String? = nil, followsUp: String? = nil) -> ReflectionEntry {
        ReflectionEntry(id: id, date: date, period: .day, area: .family, kind: .learnt, source: .yourAnswers, about: "", question: "Where did you feel most like yourself today?", answer: answer, followsUp: followsUp, thread: thread)
    }

    @Test("writes the web's shape, and still reads the native shape of before")
    func webShape() throws {
        let data = try JSONEncoder().encode(entry("r1", "2026-10-25", "At the market."))
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["kind"] as? String == "reflection")
        #expect(json["group"] as? String == "learnt")
        #expect(json["source"] as? String == "answers")
        #expect(json["at"] is Double)
        let old = #"{"id":"x","date":"2026-10-20","period":"day","area":"work","kind":"grow","source":"yourAnswers","about":"","question":"q","answer":"a"}"#
        let read = try JSONDecoder().decode(ReflectionEntry.self, from: Data(old.utf8))
        #expect(read.kind == .grow && read.source == .yourAnswers)
    }

    @Test("every key Reflect writes is one the backup carries only end to end")
    func journalKeys() {
        let store = RecordingStore()
        ReflectionStore(store: store).save(entry("r1", "2026-10-25", "Private words."))
        IntentionStore(store: store).save(Intention(id: "i1", date: "2026-10-18", text: "Ask for help earlier", from: "r1"))
        IntentionStore(store: store).check("i1", .helped, today: "2026-10-25")
        let journal = JournalStore(store: store)
        journal.saveDraft("day", "half")
        journal.dismiss("r1")
        journal.settings = { var s = JournalStore.Settings(); s.threadsInMirror = true; return s }()
        #expect(store.keys.count >= 6)
        for k in store.keys {
            #expect(k.hasPrefix("pi.nb.reflection.") || k.hasPrefix("pi.nb.intention.") || k.hasPrefix("pi.reflect."), "\(k) is not a journal key")
        }
    }

    @Test("checks in on something to try a week later, gently")
    func intentions() {
        let s = IntentionStore(store: MemoryStore())
        s.save(Intention(id: "i1", date: "2026-10-18", text: "Ask for help earlier", from: "r1"))
        #expect(s.due("2026-10-24").isEmpty)
        #expect(s.due("2026-10-25").map(\.id) == ["i1"])
        s.check("i1", .some, today: "2026-10-25")
        #expect(s.due("2026-10-25").isEmpty)
        #expect(Intention.Check.allCases.map(\.label) == ["It helped", "A little", "Not yet", "Let it go"])
    }

    @Test("brings back last week’s words once, and a thread oldest first")
    func memoryAndThreads() {
        let store = MemoryStore()
        let r = ReflectionStore(store: store)
        r.save(entry("a", "2026-07-20", "I want to be more present with my family."))
        r.save(entry("b", "2026-09-20", "Phones away at dinner helped.", thread: "a"))
        r.save(entry("c", "2026-10-17", "I want to listen more carefully."))
        let j = JournalStore(store: store)
        #expect(j.memory(in: r.all(), today: "2026-10-25")?.when == "Last week")
        j.dismiss("c")
        // Put away: the next one in range comes instead, and then none.
        #expect(j.memory(in: r.all(), today: "2026-10-25")?.entry.id == "b")
        j.dismiss("b")
        #expect(j.memory(in: r.all(), today: "2026-10-25") == nil)
        let journey = j.journey(in: r.all(), today: "2026-10-25")
        #expect(journey?.entry.id == "a" && journey?.when == "Three months ago" && journey?.since == 1)
        #expect(r.thread("a").map(\.id) == ["a", "b"])
    }

    @Test("keeps a half-written reflection per space")
    func drafts() {
        let j = JournalStore(store: MemoryStore())
        j.saveDraft("week", "Half a thought")
        #expect(j.draft("week") == "Half a thought" && j.draft("day").isEmpty)
        j.saveDraft("week", "  ")
        #expect(j.draft("week").isEmpty)
    }
}

@Suite("A thought for you")
struct ThoughtTests {
    @Test("an ordinary day has a question for any day")
    func general() {
        let t = Thoughts.make(period: .day, today: "2026-10-25", answered: [], mirror: nil, past: [], due: [])
        #expect(t.first?.question == "Where did you feel most like yourself today?")
        #expect(t.first?.why == "A question for any day")
    }

    @Test("builds on an answer and says which day, never an intimate one")
    func answers() {
        let q = Question(id: "q1", theme: "habits", care: .everyday, prompt: "When do you wash the dishes?", options: [])
        let i = Question(id: "q2", theme: "intimacy", care: .intimate, prompt: "Private", options: [])
        let t = Thoughts.make(period: .day, today: "2026-10-25", answered: [.init(question: q, option: Option(id: "a", label: "Right after eating"), date: "2026-10-20"), .init(question: i, option: Option(id: "b", label: "B"), date: "2026-10-25")], mirror: nil, past: [], due: [])
        let built = t.filter { $0.source == .answers }
        #expect(built.count == 1)
        #expect(built.first?.why == "From your answers on Tuesday")
        #expect(built.first?.question.contains("“Right after eating”") == true)
    }

    @Test("checks in on an intention first, in plain words")
    func intention() {
        let t = Thoughts.make(period: .day, today: "2026-10-25", answered: [], mirror: nil, past: [], due: [Intention(id: "i1", date: "2026-10-18", text: "Ask for help earlier", from: "r1")])
        #expect(t.first?.question == "Did asking for help earlier make any difference?")
        #expect(t.first?.why == "From something you wanted to try, on 18 October")
    }

    @Test("gives the month its own questions, and earlier words")
    func month() {
        let past = [ReflectionEntry(id: "r1", date: "2026-10-06", period: .day, area: .family, kind: .learnt, source: .yourAnswers, about: "", question: "q", answer: "I want to listen more carefully when family members speak.")]
        let t = Thoughts.make(period: .month, today: "2026-10-25", answered: [], mirror: nil, past: past, due: [])
        #expect(t.map(\.question).contains("Which intentions matter to you going into next month?"))
        #expect(!t.map(\.question).contains("Where did you feel most like yourself today?"))
        #expect(t.first { $0.source == .reflections }?.why == "From your reflection on 6 October")
    }
}
