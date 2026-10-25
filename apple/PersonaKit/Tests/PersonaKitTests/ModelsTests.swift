import Foundation
import Testing
@testable import PersonaKit

@Suite("Models")
struct ModelsTests {
    @Test("decodes a real edition from the server")
    func decodesEdition() throws {
        let url = try #require(Bundle.module.url(forResource: "edition", withExtension: "json", subdirectory: "Fixtures"))
        let set = try JSONDecoder().decode(DailySet.self, from: Data(contentsOf: url))
        #expect(set.date == "2026-10-24")
        #expect(set.questions.count == 3)
        #expect(set.evening?.count == 3)
        let first = try #require(set.questions.first)
        #expect(!first.prompt.isEmpty)
        #expect(first.options.allSatisfy { $0.insight?.step.isEmpty == false })
    }

    @Test("splits a reveal into its first sentence and the rest")
    func splitsReveal() {
        let parts = Reveal.split("You finish what you start. When a day gets crowded, you close the loop.")
        #expect(parts.headline == "You finish what you start.")
        #expect(parts.body == "When a day gets crowded, you close the loop.")
        #expect(Reveal.split("Just one line").body == "")
    }

    @Test("sends a private answer for an intimate question, never the option")
    func privateOption() {
        let intimate = Question(id: "q", theme: "intimacy", care: .intimate, prompt: "?", options: [])
        let everyday = Question(id: "q2", theme: "habits", care: .everyday, prompt: "?", options: [])
        #expect(intimate.sentOption(for: "a") == Question.privateOption)
        #expect(everyday.sentOption(for: "a") == "a")
    }

    @Test("keeps all six answers of a question with six")
    func sixAnswers() throws {
        let options = (1...6).map { #"{"id":"o\#($0)","label":"Answer \#($0)"}"# }.joined(separator: ",")
        let json = #"{"id":"q","prompt":"When money comes in, what goes first?","options":["# + options + "]}"
        let q = try JSONDecoder().decode(Question.self, from: Data(json.utf8))
        #expect(q.options.map(\.id) == ["o1", "o2", "o3", "o4", "o5", "o6"])
    }
}
