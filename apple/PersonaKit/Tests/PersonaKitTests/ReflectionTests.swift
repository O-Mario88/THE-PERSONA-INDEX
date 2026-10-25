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

    @Test("finds what's going well and where to grow in the person's own answers, by area")
    func fromAnswers() {
        let items = Reflection.items(period: .day, answered: answered, mirror: nil)
        let well = items.filter { $0.kind == .strength }
        let grow = items.filter { $0.kind == .grow }
        #expect(well.map(\.area) == [.work, .family])
        #expect(well.first?.text == "You show up for people at work.")
        #expect(well.allSatisfy { $0.source == .yourAnswers })
        #expect(grow.map(\.text) == ["Staying every time can leave little for you."])
    }

    @Test("adds the week's clearest reads, kindly worded, for a week or a month")
    func fromWeek() throws {
        let items = Reflection.items(period: .week, answered: [], mirror: try mirror())
        let read = try #require(items.first { $0.source == .yourWeek && $0.kind == .strength })
        #expect(read.text == Traits.all["conscientiousness"]?.high.strength)
        #expect(items.contains { $0.source == .yourWeek && $0.kind == .grow })
        #expect(Reflection.items(period: .day, answered: [], mirror: try mirror()).isEmpty)
    }

    @Test("turns each item into a question the person answers in their own words")
    func questions() {
        let items = Reflection.items(period: .week, answered: answered, mirror: nil)
        let prompts = Reflection.prompts(for: items, period: .week, past: [], today: "2026-10-25")
        #expect(prompts.first?.question == "Where did this show up for you this week?")
        #expect(prompts.contains { $0.question == "What is one small thing you could do differently next week?" })
        #expect(prompts.allSatisfy { !$0.question.contains("%") })
    }

    @Test("brings back something the person wrote before, and asks how it went")
    func followsUp() {
        let past = [ReflectionEntry(id: "r1", date: "2026-10-18", period: .week, area: .work, kind: .grow,
                                    source: .yourAnswers, about: "Staying every time can leave little for you.",
                                    question: "What is one small thing you could do differently next week?",
                                    answer: "Leave on time on Fridays.")]
        let prompts = Reflection.prompts(for: [], period: .week, past: past, today: "2026-10-25")
        let follow = prompts.first
        #expect(follow?.question == "On 18 October you wrote: “Leave on time on Fridays.” How has it gone since?")
        #expect(follow?.followsUp == "r1")
        #expect(Reflection.prompts(for: [], period: .week, past: past, today: "2026-10-18").isEmpty)
    }

    @Test("keeps every answer on the device with its date, newest first")
    func store() {
        let store = ReflectionStore(store: MemoryStore())
        store.save(ReflectionEntry(id: "a", date: "2026-10-20", period: .day, area: .self, kind: .strength, source: .yourAnswers,
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
