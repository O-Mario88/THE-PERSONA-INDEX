import Foundation
import Testing
@testable import PersonaKit

@Suite("Reflection")
struct ReflectionTests {
    private func mirror() throws -> WeekMirror {
        let url = try #require(Bundle.module.url(forResource: "mirror", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(WeekMirror.self, from: Data(contentsOf: url))
    }

    private let answered: [(Question, Option)] = [
        (Question(id: "q1", theme: "colleagues", care: .everyday, prompt: "A colleague asks for help at five.", options: []),
         Option(id: "a", label: "I stay", insight: Insight(reveal: "You show up for people at work. You stay when it counts.", otherSide: "Staying every time can leave little for you.", step: "Try saying not today once.", needStep: nil))),
        (Question(id: "q2", theme: "family", care: .everyday, prompt: "Sunday lunch with family.", options: []),
         Option(id: "b", label: "I cook", insight: Insight(reveal: "Feeding people is how you care. You start early.", otherSide: nil, step: "Ask someone to help.", needStep: nil))),
    ]

    @Test("finds what the person learnt and where to grow in their own answers, by area")
    func fromAnswers() {
        let items = Reflection.items(period: .day, answered: answered, mirror: nil)
        let learnt = items.filter { $0.kind == .learnt }
        let grow = items.filter { $0.kind == .grow }
        #expect(learnt.map(\.area) == [.work, .family])
        #expect(learnt.first?.text == "You show up for people at work.")
        #expect(learnt.allSatisfy { $0.source == .yourAnswers })
        #expect(grow.map(\.text) == ["Staying every time can leave little for you."])
        // A strength comes only from an earned read, never from one answer.
        #expect(!items.contains { $0.kind == .strength })
    }

    @Test("adds the week's clearest reads, kindly worded, for a week or a month")
    func fromWeek() throws {
        let items = Reflection.items(period: .week, answered: [], mirror: try mirror())
        let read = try #require(items.first { $0.source == .yourWeek && $0.kind == .strength })
        #expect(read.text == Traits.all["conscientiousness"]?.high.strength)
        #expect(items.contains { $0.source == .yourWeek && $0.kind == .grow })
        #expect(Reflection.items(period: .day, answered: [], mirror: try mirror()).isEmpty)
    }

    @Test("keeps every answer on the device with its date, newest first")
    func store() {
        let store = ReflectionStore(store: MemoryStore())
        store.save(ReflectionEntry(id: "a", date: "2026-10-20", period: .day, area: .self, kind: .learnt, source: .yourAnswers,
                                   about: "x", question: "q", answer: "first"))
        store.save(ReflectionEntry(id: "b", date: "2026-10-24", period: .week, area: .work, kind: .grow, source: .yourWeek,
                                   about: "y", question: "q", answer: "second"))
        #expect(store.all().map(\.answer) == ["second", "first"])
        #expect(store.all().first?.date == "2026-10-24")
    }

    @Test("places every theme in one of the eight areas", arguments: Array(Themes.all.keys))
    func areas(theme: String) {
        #expect(LifeArea.of(theme: theme) != nil)
    }

}
