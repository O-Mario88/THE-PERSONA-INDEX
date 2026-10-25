import Foundation
import Testing
@testable import PersonaKit

// The new Connect on the device: what is kept, how it is said, and what is
// sent. The server is a stub; what matters is what leaves the device.

@Suite("Connect on the device")
struct ConnectDeviceTests {
    @Test("notes a move towards a friend with its day and kind only, and says the week plainly")
    func connectionLog() {
        let store = MemoryStore()
        let log = ConnectionLog(store: store)
        log.note(.nod, on: "2026-10-13")
        log.note(.share, on: "2026-10-15")
        log.note(.nod, on: "2026-10-02")
        let week = log.between("2026-10-12", "2026-10-18")
        #expect(week.nod == 1 && week.share == 1 && week.days == 2)
        #expect(ConnectionLog.line(week, span: "week") == "This week you sent a quiet nod and shared one thing that helped.")
        #expect(ConnectionLog.line(ConnectionCounts(), span: "month") == "A quiet month for connection. That is all it was.")
        #expect(store.string(forKey: ConnectionLog.key)?.contains(#""k":"nod""#) == true)
    }

    @Test("keeps the web's answer history format, and fields the web wrote")
    func history() {
        let store = MemoryStore()
        store.set(#"{"answers":[{"date":"2026-10-20","questionId":"q0","theme":"rest","depth":2,"traits":{},"route":"yes"}],"skips":[]}"#, forKey: AnswerHistory.key)
        let h = AnswerHistory(store: store)
        let q = Question(id: "q1", theme: "family", care: .everyday, prompt: "p", options: [Option(id: "a", label: "A", depth: 3)])
        h.record(q, optionId: "a", date: "2026-10-21")
        #expect(h.answers().map(\.questionId) == ["q0", "q1"])
        #expect(store.string(forKey: AnswerHistory.key)?.contains(#""route":"yes""#) == true)
        h.record(q, optionId: "a", date: "2026-12-30") // sixty days on: the old one goes
        #expect(h.answers().map(\.questionId) == ["q1"])
    }

    @Test("suggests Common Ground tags from the themes answered most, never intimate or Not me")
    func suggestions() {
        func a(_ theme: String, _ verdict: String? = nil) -> AnswerHistory.Answer { .init(date: "2026-10-20", questionId: UUID().uuidString, theme: theme, optionId: "a", verdict: verdict) }
        #expect(CommonSuggestions.from([a("family"), a("relatives"), a("parenting"), a("rest"), a("happiness"), a("anger"), a("money")]) == ["family", "peace-calm"])
        #expect(CommonSuggestions.from([a("intimacy"), a("intimacy"), a("intimacy"), a("honesty", "not_me"), a("honesty", "not_me"), a("honesty", "not_me")]).isEmpty)
    }

    @Test("a friend who muted or turned Connect off is not reachable")
    func reachable() {
        #expect(FriendView(id: "k", name: "Kofi", tag: .work, since: "2026-10-01", active: true).reachable)
        #expect(!FriendView(id: "k", name: "Kofi", tag: .work, since: "2026-10-01", muted: true, active: true).reachable)
        #expect(!FriendView(id: "k", name: "Kofi", tag: .work, since: "2026-10-01", active: true, connect: false).reachable)
    }

    @Test("a received share carries no name")
    func anonymousShare() throws {
        let json = #"{"themes":[{"id":"rest","label":"Rest"}],"received":[{"id":"s1","kind":"helped","theme":"rest","text":"A short walk helped.","try":"Try it after lunch.","date":"2026-10-24"}],"sent":[]}"#
        let v = try JSONDecoder().decode(SharesView.self, from: Data(json.utf8))
        #expect(v.received.first?.tryThis == "Try it after lunch.")
        #expect(Mirror(reflecting: v.received[0]).children.contains { $0.label == "from" } == false)
    }
}

extension APIClientTests {
    @Test("sends a share as approved words to the friends picked, and nothing else")
    func postShare() async throws {
        let store = MemoryStore()
        store.set("s1.k.sess.sig", forKey: APIClient.accountKey)
        let api = client(store)
        StubProtocol.handler = { req in req.url!.path == "/api/shares" ? (201, Self.json(#"{"id":"sh1"}"#)) : (404, Data()) }
        try await api.postShare(NewShare(kind: .helped, theme: "managing-stress", text: "  A short break helped me think.  ", why: " ", to: ["f-kofi"]))
        let sent = try #require(StubProtocol.seen.last)
        #expect(sent.value(forHTTPHeaderField: "Authorization") == "Account s1.k.sess.sig")
        let body = try JSONSerialization.jsonObject(with: sent.httpBody!) as! [String: Any]
        #expect(Set(body.keys) == ["kind", "theme", "text", "to"])
        #expect(body["text"] as? String == "A short break helped me think.")
    }

    @Test("Common Ground opt-in, a reach-out and a withdrawal reach the right places")
    func closerCalls() async throws {
        let store = MemoryStore()
        store.set("s1.k.sess.sig", forKey: APIClient.accountKey)
        let api = client(store)
        StubProtocol.handler = { req in
            switch (req.httpMethod ?? "", req.url!.path) {
            case ("PUT", "/api/common/friends/t"), ("DELETE", "/api/shares/sh1"), ("PUT", "/api/common"): (204, Data())
            case ("POST", "/api/reachouts"): (201, Self.json(#"{"status":"sent"}"#))
            case ("PUT", _): (429, Self.json(#"{"error":"tags_changed_recently"}"#))
            default: (404, Data())
            }
        }
        try await api.setCommonFriend("t", on: true)
        try await api.sendReachOut(to: "k", kind: .support, phrase: "talk")
        try await api.withdrawShare("sh1")
        try await api.putCommon(tags: ["family"])
        let paths = StubProtocol.seen.map { "\($0.httpMethod ?? "") \($0.url!.path)" }
        #expect(paths == ["PUT /api/common/friends/t", "POST /api/reachouts", "DELETE /api/shares/sh1", "PUT /api/common"])
        let reach = try JSONSerialization.jsonObject(with: StubProtocol.seen[1].httpBody!) as! [String: String]
        #expect(reach == ["to": "k", "kind": "support", "phrase": "talk"])
    }
}
