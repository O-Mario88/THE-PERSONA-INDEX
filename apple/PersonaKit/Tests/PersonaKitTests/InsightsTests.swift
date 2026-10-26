import Foundation
import Testing
@testable import PersonaKit

/// Insights on the device, in step with the web (frontend/src/insights.ts):
/// the card text kept for 30 days, how sure a card can be, For You, and
/// the server's counts for You're not alone.
@Suite("Insights")
struct InsightsTests {
    let today = "2026-10-25"

    func question(_ id: String, care: Care? = nil) -> Question {
        Question(id: id, theme: "habits", care: care, prompt: "When do you wash the dishes?", options: [
            Option(id: "a", label: "Right after eating", need: "calm",
                   insight: Insight(reveal: "You like a clear surface.", otherSide: "It can cost you rest.", step: "Leave one cup tonight.", needStep: nil)),
            Option(id: "b", label: "When the sink is full", heavy: true),
        ])
    }

    /// A device with answers recorded the way the app records them.
    func device(_ answers: [(date: String, id: String, option: String)] = []) -> MemoryStore {
        let store = MemoryStore()
        for a in answers {
            AnswerHistory(store: store).record(question(a.id), optionId: a.option, date: a.date)
            CardTexts(store: store).keep(question(a.id), optionId: a.option, date: a.date)
        }
        return store
    }

    @Test("keeps what the card said, in the web's shape")
    func keeps() throws {
        let store = device([("2026-10-20", "q1", "a")])
        let t = try #require(CardTexts(store: store).text("q1"))
        #expect(t.prompt == "When do you wash the dishes?")
        #expect(t.label == "Right after eating")
        #expect(t.reveal == "You like a clear surface.")
        #expect(t.otherSide == "It can cost you rest.")
        #expect(t.step == "Leave one cup tonight.")
        #expect(t.need == "calm")
        let json = try #require(store.string(forKey: "pi.insight.q1"))
        #expect(json.contains("\"otherSide\""))
    }

    @Test("keeps nothing for an intimate question, and no reading or step for a heavy answer")
    func intimateAndHeavy() {
        let store = MemoryStore()
        CardTexts(store: store).keep(question("x", care: .intimate), optionId: "a", date: today)
        CardTexts(store: store).keep(question("h"), optionId: "b", date: today)
        #expect(CardTexts(store: store).text("x") == nil)
        let heavy = CardTexts(store: store).text("h")
        #expect(heavy?.heavy == true)
        #expect(heavy?.reveal == nil && heavy?.step == nil)
    }

    @Test("lets go of cards older than thirty days")
    func prunes() {
        let store = device([("2026-09-20", "old", "a"), ("2026-10-20", "new", "a")])
        CardTexts(store: store).prune(today: today)
        #expect(CardTexts(store: store).text("old") == nil)
        #expect(CardTexts(store: store).text("new") != nil)
    }

    @Test("is a thought, something you've been noticing, or a pattern worth exploring")
    func evidence() {
        let one = AnswerHistory(store: device([(today, "q1", "a")])).answers()
        #expect(Insights.evidence(one, need: "calm", today: today) == .thought)
        let days = AnswerHistory(store: device([("2026-10-23", "q1", "a"), ("2026-10-24", "q2", "a"), (today, "q3", "a")])).answers()
        #expect(Insights.evidence(days, need: "calm", today: today) == .noticing)
        let weeks = AnswerHistory(store: device([("2026-10-08", "q1", "a"), ("2026-10-14", "q2", "a"), ("2026-10-21", "q3", "a"), (today, "q4", "a")])).answers()
        #expect(Insights.evidence(weeks, need: "calm", today: today) == .pattern)
    }

    @Test("stops calling it a pattern once the person says Not me")
    func notMe() {
        let store = device([("2026-10-08", "q1", "a"), ("2026-10-14", "q2", "a"), ("2026-10-21", "q3", "a"), (today, "q4", "a")])
        AnswerHistory(store: store).setVerdict(.notMe, for: "q3")
        #expect(Insights.evidence(AnswerHistory(store: store).answers(), need: "calm", today: today) == .thought)
    }

    @Test("names each level as a label, never a rank or a score")
    func labels() {
        #expect(Insights.label(.thought, date: today, today: today) == "A thought from today")
        #expect(Insights.label(.thought, date: "2026-10-21", today: today) == "A thought from 21 October")
        #expect(Insights.label(.noticing, date: today, today: today) == "Something you’ve been noticing")
        #expect(Insights.label(.pattern, date: today, today: today) == "A pattern worth exploring")
    }

    @Test("For You: newest first within the days chosen, leaving out Not me and answers with no card")
    func forYou() {
        let store = device([("2026-10-10", "q1", "a"), ("2026-10-21", "q2", "a"), (today, "q3", "a"), (today, "q4", "a")])
        AnswerHistory(store: store).setVerdict(.notMe, for: "q4")
        AnswerHistory(store: store).record(question("q5"), optionId: "a", date: today) // no card kept
        let week = Insights.forYou(store: store, today: today, days: 7)
        #expect(week.map(\.questionId) == ["q3", "q2"])
        #expect(Insights.forYou(store: store, today: today, days: 30).map(\.questionId) == ["q3", "q2", "q1"])
        #expect(week.first?.reveal == "You like a clear surface.")
    }

    @Test("uses today's questions for an answer from before cards were kept")
    func fallback() {
        let store = MemoryStore()
        AnswerHistory(store: store).record(question("q1"), optionId: "a", date: today)
        #expect(Insights.forYou(store: store, today: today, days: 7, questions: [question("q1")]).first?.reveal == "You like a clear surface.")
    }

    @Test("You're not alone: the real count and total, a few, or still forming")
    func notAlone() {
        let counts = [
            NotAloneQuestion(questionId: "q1", total: 140, options: [NotAloneOption(optionId: "a", count: 37, few: nil)]),
            NotAloneQuestion(questionId: "q2", total: 22, options: [NotAloneOption(optionId: "b", count: 0, few: true)]),
        ]
        #expect(Insights.notAlone(counts, questionId: "q1", optionId: "a") == .count(same: 37, total: 140))
        #expect(Insights.notAlone(counts, questionId: "q2", optionId: "b") == .few)
        #expect(Insights.notAlone(counts, questionId: "q3", optionId: "a") == .forming)
        #expect(Insights.notAlone(nil, questionId: "q1", optionId: "a") == nil)
        #expect(Insights.line(.count(same: 37, total: 140)) == "37 of 140 people chose the same response.")
        #expect(Insights.line(.forming) == "The picture is still forming.")
    }

    @Test("reads the server's counts")
    func decodes() throws {
        let json = #"{"date":"2026-10-25","days":30,"min":20,"questions":[{"questionId":"q1","total":22,"options":[{"optionId":"a","count":20},{"optionId":"b","count":0,"few":true}]}]}"#
        let n = try JSONDecoder().decode(NotAlone.self, from: Data(json.utf8))
        #expect(n.min == 20)
        #expect(n.questions.first?.options.last?.few == true)
    }

    @Test("names what an answer reached for in the web's everyday words")
    func needNames() {
        #expect(Insights.needName("calm") == "Feeling settled")
        #expect(Insights.needName("belonging") == "Being close to people")
        #expect(Insights.needName("unknown") == nil)
        #expect(Insights.needNames.count == 7)
    }
}
