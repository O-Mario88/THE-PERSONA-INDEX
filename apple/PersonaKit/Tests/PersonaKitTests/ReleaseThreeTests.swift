import Foundation
import Testing
@testable import PersonaKit

/// Insights Release 3, as on the web (frontend/src/growth.ts, patterns.ts):
/// Your Growth's earlier and more recent pairs, and the longer Mirrors'
/// "Does this still feel true?", where No retires a pattern.
@Suite("Insights Release 3")
struct ReleaseThreeTests {
    let today = "2026-10-26"

    /// Answers in pi.history.v1, in the web's shape, with a kept card each.
    func answered(_ store: MemoryStore, _ entries: [(date: String, id: String, theme: String, need: String?, prompt: String, label: String)], heavy: Set<String> = []) {
        let answers = entries.map { e -> [String: Any] in
            var a: [String: Any] = ["date": e.date, "questionId": e.id, "theme": e.theme, "depth": 2, "traits": [String: Int](), "optionId": "a"]
            if let need = e.need { a["need"] = need }
            if heavy.contains(e.id) { a["heavy"] = true }
            return a
        }
        let data = try! JSONSerialization.data(withJSONObject: ["answers": answers, "skips": []])
        store.set(String(data: data, encoding: .utf8), forKey: AnswerHistory.key)
        for e in entries {
            let card: [String: Any] = ["date": e.date, "questionId": e.id, "theme": e.theme, "prompt": e.prompt, "label": e.label]
            store.set(String(data: try! JSONSerialization.data(withJSONObject: card), encoding: .utf8), forKey: "pi.insight." + e.id)
        }
    }

    // MARK: Your Growth

    @Test("pairs the earliest and latest answers in one part of life, two weeks apart or more")
    func growthPairs() {
        let store = MemoryStore()
        answered(store, [
            ("2026-10-02", "q-old", "colleagues", nil, "Stuck on a task for an hour?", "Stay late alone"),
            ("2026-10-10", "q-mid", "colleagues", nil, "A meeting runs over?", "Say nothing"),
            ("2026-10-24", "q-new", "work-career", nil, "Your idea is ignored?", "Raise it again"),
        ])
        #expect(Growth.pairs(store: store, today: today) == [
            GrowthPair(area: .work, kind: .answers,
                       earlier: GrowthSide(date: "2026-10-02", asked: "Stuck on a task for an hour?", words: "Stay late alone"),
                       recent: GrowthSide(date: "2026-10-24", asked: "Your idea is ignored?", words: "Raise it again")),
        ])
    }

    @Test("needs two weeks between two real answers, and leaves out private and heavy ones")
    func growthHonest() {
        let close = MemoryStore()
        answered(close, [("2026-10-12", "q1", "colleagues", nil, "A?", "x"), ("2026-10-25", "q2", "colleagues", nil, "B?", "y")])
        #expect(Growth.pairs(store: close, today: today).isEmpty)
        let hidden = MemoryStore()
        answered(hidden, [("2026-10-01", "q-p", "intimacy", nil, "P?", "p"), ("2026-10-02", "q-h", "family", nil, "H?", "h"), ("2026-10-25", "q-n", "family", nil, "N?", "n")], heavy: ["q-h"])
        #expect(Growth.pairs(store: hidden, today: today).isEmpty)
    }

    @Test("uses reflections only when the person turned that on, in their own words")
    func growthReflections() {
        let store = MemoryStore()
        let journal = ReflectionStore(store: store)
        journal.save(ReflectionEntry(id: "r1", date: "2026-10-01", period: .day, area: .health, kind: .learnt, source: .yourAnswers, about: "", question: "What did today teach you?", answer: "I keep staying up."))
        journal.save(ReflectionEntry(id: "r2", date: "2026-10-23", period: .day, area: .health, kind: .learnt, source: .yourAnswers, about: "", question: "What did today teach you?", answer: "I slept better after the walk."))
        #expect(Growth.pairs(store: store, today: today).isEmpty)
        var settings = JournalStore(store: store).settings
        settings.reflectionsInGrowth = true
        JournalStore(store: store).settings = settings
        #expect(Growth.pairs(store: store, today: today).map(\.kind) == [.reflections])
        #expect(Growth.pairs(store: store, today: today).first?.recent.words == "I slept better after the walk.")
    }

    @Test("Reflect choices saved before this switch existed keep their values, and it starts off")
    func settingsCarryOver() {
        let store = MemoryStore()
        store.set(#"{"threadsInMirror":true,"reflectionsInNoticed":true}"#, forKey: "pi.reflect.settings")
        let s = JournalStore(store: store).settings
        #expect(s.threadsInMirror && s.reflectionsInNoticed && !s.reflectionsInGrowth)
    }

    // MARK: Patterns

    func calmPattern(_ store: MemoryStore, extra: [(String, String, String, String?, String, String)] = []) {
        answered(store, [("2026-10-10", "c1", "colleagues", "calm", "A?", "a"), ("2026-10-17", "c2", "colleagues", "calm", "B?", "b"),
                         ("2026-10-24", "c3", "colleagues", "calm", "C?", "c")] + extra)
    }

    @Test("lists the needs Insights calls a pattern or something noticed, with the real counts")
    func patterns() {
        let store = MemoryStore()
        calmPattern(store)
        #expect(Patterns.all(store: store, today: today) == [NeedPattern(need: "calm", evidence: .pattern, answers: 3, days: 3, since: "2026-10-10")])
    }

    @Test("Yes and Partly keep a pattern; No retires it here and in Insights, until new answers build it")
    func retire() {
        let store = MemoryStore()
        calmPattern(store)
        Patterns.check("calm", .partly, today: today, store: store)
        #expect(Patterns.checked("calm", store: store)?.check == .partly)
        #expect(Patterns.all(store: store, today: today).count == 1)
        Patterns.check("calm", .no, today: today, store: store)
        #expect(Patterns.all(store: store, today: today).isEmpty)
        #expect(Insights.forYou(store: store, today: today, days: 30).allSatisfy { $0.evidence == .thought })
        #expect(store.string(forKey: "pi.pattern.calm")?.contains(#""check":"no""#) == true)
        #expect(BackupRegistry.copy(of: "pi.pattern.calm") == .main)

        let later = MemoryStore()
        calmPattern(later, extra: [("2026-10-27", "c4", "colleagues", "calm", "D?", "d"), ("2026-11-03", "c5", "colleagues", "calm", "E?", "e"),
                                   ("2026-11-10", "c6", "colleagues", "calm", "F?", "f")])
        Patterns.check("calm", .no, today: today, store: later)
        #expect(Patterns.all(store: later, today: "2026-11-10") == [NeedPattern(need: "calm", evidence: .pattern, answers: 3, days: 3, since: "2026-10-27")])
    }

    @Test("ignores a stored check that is not an answer")
    func badCheck() {
        let store = MemoryStore()
        store.set(#"{"check":"maybe","date":"2026-10-26"}"#, forKey: "pi.pattern.calm")
        #expect(Patterns.checked("calm", store: store) == nil)
    }

    @Test("the Connect suggestion's choices are kept under the web's keys, in the backup")
    func nudge() {
        let store = MemoryStore()
        #expect(ConnectNudge(store: store).shows(today: today))
        ConnectNudge(store: store).notToday(today)
        #expect(!ConnectNudge(store: store).shows(today: today))
        #expect(ConnectNudge(store: store).shows(today: "2026-10-27"))
        ConnectNudge(store: store).turnOff()
        #expect(!ConnectNudge(store: store).shows(today: "2026-10-27"))
        #expect(store.string(forKey: "pi.nudge.off") == "1")
        #expect(BackupRegistry.copy(of: "pi.nudge.later") == .main)
    }
}
