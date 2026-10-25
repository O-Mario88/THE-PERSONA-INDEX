import Foundation
import Testing
@testable import PersonaKit

// Signing in, the circle and Growing Together. In the API suite, which runs
// one test at a time, since every network test shares the stub server.
extension APIClientTests {
    private func socialClient(_ secrets: KeyValueStore) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        StubProtocol.seen = []
        return APIClient(base: URL(string: "http://test.local")!, session: URLSession(configuration: config), store: secrets)
    }

    private static let account = #"{"id":"acc-ama","name":"Ama","handle":"ama","suggest":true,"connect":true,"sync":false}"#

    @Test("signs in with a code and keeps the account and device tokens")
    func signsIn() async throws {
        let secrets = MemoryStore()
        secrets.set("old-pass", forKey: APIClient.deviceKey)
        let api = socialClient(secrets)
        StubProtocol.handler = { req in
            switch req.url!.path {
            case "/api/auth/code": return (202, Self.json(#"{"status":"sent","kind":"email"}"#))
            case "/api/auth/verify": return (200, Self.json(#"{"account":\#(Self.account),"accountToken":"acct-1","deviceToken":"pass-2","created":true,"merged":true}"#))
            default: return (404, Data())
            }
        }
        #expect(try await api.sendCode(to: "ama@example.com") == "email")
        let me = try await api.verifyCode(address: "ama@example.com", code: "123456", device: "iPhone")
        #expect(me.name == "Ama")
        #expect(secrets.string(forKey: APIClient.accountKey) == "acct-1")
        #expect(secrets.string(forKey: APIClient.deviceKey) == "pass-2")
        let verify = try #require(StubProtocol.seen.first { $0.url!.path == "/api/auth/verify" })
        let body = try JSONSerialization.jsonObject(with: verify.httpBody ?? Data()) as? [String: String]
        #expect(body?["voterId"] == "old-pass")
        #expect(await api.isSignedIn)
    }

    @Test("asks for the circle with the account token")
    func circle() async throws {
        let secrets = MemoryStore()
        secrets.set("acct-1", forKey: APIClient.accountKey)
        let api = socialClient(secrets)
        StubProtocol.handler = { _ in
            (200, Self.json(#"{"me":\#(Self.account),"friends":[{"id":"k","name":"Kofi","tag":"work","since":"2026-10-20","active":true,"connect":true}],"active":1,"need":3,"joined":[],"suggestions":[]}"#))
        }
        let c = try await api.circle()
        #expect(c.friends.first?.name == "Kofi")
        #expect(c.active == 1)
        #expect(StubProtocol.seen.first?.value(forHTTPHeaderField: "Authorization") == "Account acct-1")
    }

    @Test("forgets the session when the server says it ended")
    func signedOut() async throws {
        let secrets = MemoryStore()
        secrets.set("acct-1", forKey: APIClient.accountKey)
        let api = socialClient(secrets)
        StubProtocol.handler = { _ in (401, Self.json(#"{"error":"signed_out"}"#)) }
        await #expect(throws: APIError(status: 401, code: "signed_out")) { _ = try await api.circle() }
        #expect(secrets.string(forKey: APIClient.accountKey) == nil)
    }

    @Test("reads today's anonymous totals")
    func growing() async throws {
        let api = socialClient(MemoryStore())
        StubProtocol.handler = { _ in
            (200, Self.json(#"{"date":"2026-10-24","answers":70,"min":20,"questions":[{"questionId":"q1","totalVotes":40,"options":[{"optionId":"a","count":30,"percent":75}]}]}"#))
        }
        let g = try await api.growing("2026-10-24")
        #expect(g.answers == 70)
        #expect(g.questions.first?.totalVotes == 40)
        #expect(StubProtocol.seen.first?.url?.query == "date=2026-10-24")
    }

    @Test("puts everyone in the wider circle until the person places them, on the device only")
    func rings() {
        let store = MemoryStore()
        let rings = RingStore(store: store)
        #expect(rings.ring(of: "k") == .outer)
        rings.place("k", in: .inner)
        #expect(rings.ring(of: "k") == .inner)
        #expect(store.string(forKey: "pi.rings") == #"{"k":"inner"}"#)
        #expect(Ring.inner.name == "Inner circle")
        #expect(Ring.outer.name == "Wider circle")
    }
}
