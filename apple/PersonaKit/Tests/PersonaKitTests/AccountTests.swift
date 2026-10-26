import Foundation
import Testing
@testable import PersonaKit

// The account on the You screen: what friends see, how it signs in and
// where, and the ways out. In the API suite, one test at a time.
extension APIClientTests {
    private func accountClient(_ secrets: KeyValueStore) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        StubProtocol.seen = []
        secrets.set("acct-1", forKey: APIClient.accountKey)
        return APIClient(base: URL(string: "http://test.local")!, session: URLSession(configuration: config), store: secrets)
    }

    private static let me = #"{"id":"acc-ama","name":"Ama","handle":"ama","suggest":true,"connect":true,"sync":false}"#

    @Test("reads the account with its sign-ins and devices")
    func accountDetails() async throws {
        let api = accountClient(MemoryStore())
        StubProtocol.handler = { _ in
            (200, Self.json(#"{"account":\#(Self.me),"logins":[{"kind":"email","hint":"a•••@example.com"}],"sessions":[{"id":"s1","label":"iPhone","seenOn":"2026-10-26","current":true},{"id":"s2","label":"Mac","seenOn":"2026-10-20","current":false}]}"#))
        }
        let d = try await api.account()
        #expect(d.account.handle == "ama")
        #expect(d.account.suggest == true)
        #expect(d.logins.first?.kind == .email)
        #expect(d.sessions.map(\.label) == ["iPhone", "Mac"])
        #expect(StubProtocol.seen.first?.value(forHTTPHeaderField: "Authorization") == "Account acct-1")
    }

    @Test("changes only what was changed")
    func patchesAccount() async throws {
        let api = accountClient(MemoryStore())
        StubProtocol.handler = { _ in (200, Self.json(Self.me)) }
        _ = try await api.updateAccount(AccountChange(name: "Ama K"))
        let sent = try #require(StubProtocol.seen.last)
        #expect(sent.httpMethod == "PATCH")
        let body = try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: Any]
        #expect(body?["name"] as? String == "Ama K")
        #expect(body?["handle"] == nil && body?["suggest"] == nil)
    }

    @Test("says why a handle was refused")
    func handleTaken() async throws {
        let api = accountClient(MemoryStore())
        StubProtocol.handler = { _ in (409, Self.json(#"{"error":"handle_taken"}"#)) }
        await #expect(throws: APIError(status: 409, code: "handle_taken")) { _ = try await api.updateAccount(AccountChange(handle: "kofi")) }
    }

    @Test("signs another device out, and this one out with its token forgotten")
    func signsOut() async throws {
        let secrets = MemoryStore()
        let api = accountClient(secrets)
        StubProtocol.handler = { _ in (204, Data()) }
        try await api.signOut(session: "s2")
        #expect(StubProtocol.seen.last?.url?.path == "/api/account/sessions/s2")
        #expect(secrets.string(forKey: APIClient.accountKey) == "acct-1")
        try await api.signOut(session: "current")
        #expect(StubProtocol.seen.last?.httpMethod == "DELETE")
        #expect(secrets.string(forKey: APIClient.accountKey) == nil)
    }

    @Test("deletes the account and forgets the sign-in")
    func deletes() async throws {
        let secrets = MemoryStore()
        let api = accountClient(secrets)
        StubProtocol.handler = { _ in (204, Data()) }
        try await api.deleteAccount()
        #expect(StubProtocol.seen.last?.httpMethod == "DELETE")
        #expect(StubProtocol.seen.last?.url?.path == "/api/account")
        #expect(secrets.string(forKey: APIClient.accountKey) == nil)
    }
}
