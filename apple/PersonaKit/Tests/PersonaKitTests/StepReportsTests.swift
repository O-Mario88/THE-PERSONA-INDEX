import Foundation
import Testing
@testable import PersonaKit

/// What Helped (Insights Release 2), as on the web (frontend/src/stepReports.ts):
/// the steps saved from Insights, asked about from the next day for 30 days;
/// what this phone already said; and the totals in words, counts only.
@Suite("What Helped")
struct StepReportsTests {
    let today = "2026-10-26"

    func answered(_ store: MemoryStore, _ questionId: String, _ optionId: String, on date: String = "2026-10-24") {
        let history = #"{"answers":[{"date":"\#(date)","questionId":"\#(questionId)","theme":"habits","depth":2,"traits":{},"optionId":"\#(optionId)"}],"skips":[]}"#
        store.set(history, forKey: AnswerHistory.key)
    }

    func saved(_ store: MemoryStore, id: String, on date: String, from: String) {
        IntentionStore(store: store).save(Intention(id: id, date: date, text: "Leave one cup until morning.", from: from))
    }

    func step(_ outcomes: [HelpedCount]) -> WhatHelpedStep {
        WhatHelpedStep(questionId: "q1", optionId: "a", total: outcomes.reduce(0) { $0 + $1.count }, outcomes: outcomes)
    }

    @Test("asks about a step saved from Insights from the next day, with the answer it came from")
    func asksNextDay() {
        let store = MemoryStore()
        answered(store, "q1", "a")
        saved(store, id: "insight-q1", on: "2026-10-25", from: "q1")
        #expect(StepReports(store: store).stepsToAsk(today: today) == [SavedStep(questionId: "q1", optionId: "a", text: "Leave one cup until morning.", saved: "2026-10-25")])
    }

    @Test("waits a day after saving, and stops after 30 days")
    func window() {
        let store = MemoryStore()
        answered(store, "q1", "a", on: "2026-09-20")
        saved(store, id: "insight-q1", on: today, from: "q1")
        #expect(StepReports(store: store).stepsToAsk(today: today).isEmpty)
        saved(store, id: "insight-q1", on: "2026-09-26", from: "q1")
        #expect(StepReports(store: store).stepsToAsk(today: today).count == 1)
        saved(store, id: "insight-q1", on: "2026-09-25", from: "q1")
        #expect(StepReports(store: store).stepsToAsk(today: today).isEmpty)
    }

    @Test("leaves out intentions written in Reflect, and a step whose answer is gone")
    func onlyInsights() {
        let store = MemoryStore()
        saved(store, id: "r-1", on: "2026-10-20", from: "r-1")
        saved(store, id: "insight-gone", on: "2026-10-20", from: "gone")
        #expect(StepReports(store: store).stepsToAsk(today: today).isEmpty)
    }

    @Test("remembers what this phone reported, under the web's key")
    func remembers() {
        let store = MemoryStore()
        let reports = StepReports(store: store)
        #expect(reports.reported(questionId: "q1", optionId: "a") == nil)
        reports.remember(questionId: "q1", optionId: "a", .helpedLittle)
        #expect(store.string(forKey: "pi.helped.q1.a") == "helped_little")
        #expect(reports.reported(questionId: "q1", optionId: "a") == .helpedLittle)
        store.set("helped", forKey: "pi.helped.q1.b")
        #expect(reports.reported(questionId: "q1", optionId: "b") == nil)
        #expect(BackupRegistry.copy(of: "pi.helped.q1.a") == .main)
    }

    @Test("says the totals in words, counts only, with who did not try apart")
    func lines() {
        let full = StepReports.lines(step([
            HelpedCount(outcome: .helpedLot, count: 41), HelpedCount(outcome: .helpedLittle, count: 12),
            HelpedCount(outcome: .noChange, count: 10), HelpedCount(outcome: .notTried, count: 15),
        ]))
        #expect(full.tried == "Of those who tried this and reported back, 41 said it helped a lot, 12 said it helped a little and 10 saw no change.")
        #expect(full.notTried == "15 more said they didn’t get to try it.")

        let folded = StepReports.lines(step([
            HelpedCount(outcome: .helpedLot, count: 50), HelpedCount(outcome: .helpedLittle, count: 0),
            HelpedCount(outcome: .noChange, count: 0, few: true), HelpedCount(outcome: .notTried, count: 0, few: true),
        ]))
        #expect(folded.tried == "Of those who tried this and reported back, 50 said it helped a lot and a few saw no change.")
        #expect(folded.notTried == "A few more said they didn’t get to try it.")

        let none = StepReports.lines(step([HelpedCount(outcome: .notTried, count: 55)]))
        #expect(none.tried == nil)
        #expect(none.notTried == "55 who reported back said they didn’t get to try it.")
        #expect(!"\(full.tried ?? "") \(full.notTried ?? "")".contains("%"))
    }
}

extension APIClientTests {
    @Test("sends a What Helped report with the device pass, and nothing else")
    func reportStep() async throws {
        let store = MemoryStore()
        store.set("pass-1", forKey: APIClient.deviceKey)
        let api = client(store)
        StubProtocol.handler = { _ in (200, Self.json(#"{"status":"saved"}"#)) }
        try await api.reportStep(questionId: "q1", optionId: "a", outcome: .noChange, date: "2026-10-26")
        let sent = try #require(StubProtocol.seen.first { $0.url!.path == "/api/what-helped" })
        #expect(sent.httpMethod == "POST")
        let body = try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: String]
        #expect(body == ["questionId": "q1", "optionId": "a", "outcome": "no_change", "date": "2026-10-26", "voterId": "pass-1"])
    }

    @Test("reads the What Helped totals without a pass")
    func whatHelpedTotals() async throws {
        let api = client()
        StubProtocol.handler = { _ in
            (200, Self.json(#"{"min":50,"few":10,"steps":[{"questionId":"q1","optionId":"a","total":51,"outcomes":[{"outcome":"helped_lot","count":41},{"outcome":"helped_little","count":10},{"outcome":"no_change","count":0,"few":true},{"outcome":"not_tried","count":0}]}]}"#))
        }
        let steps = try await api.whatHelped()
        #expect(steps.count == 1)
        #expect(steps.first?.outcomes.first { $0.outcome == .noChange }?.few == true)
        let sent = try #require(StubProtocol.seen.first)
        #expect(sent.url!.path == "/api/what-helped" && sent.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(!StubProtocol.seen.contains { $0.url!.path == "/api/device" })
    }
}
