import Foundation
import Testing
@testable import PersonaKit

// A stand-in for the server: each test sets how requests are answered and
// reads back what was sent.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var seen: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var request = self.request
        if request.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                data.append(buffer, count: n)
            }
            stream.close()
            request.httpBody = data
        }
        Self.seen.append(request)
        let (status, body) = Self.handler?(request) ?? (404, Data(#"{"error":"not_found"}"#.utf8))
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@Suite("The API client", .serialized)
struct APIClientTests {
    private func client(_ store: KeyValueStore = MemoryStore()) -> APIClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        StubProtocol.seen = []
        return APIClient(base: URL(string: "http://test.local")!, session: URLSession(configuration: config), store: store)
    }

    private static func json(_ s: String) -> Data { Data(s.utf8) }

    @Test("asks for a device pass once and keeps it")
    func devicePassOnce() async throws {
        let store = MemoryStore()
        let api = client(store)
        StubProtocol.handler = { req in
            req.url!.path == "/api/device" ? (201, Self.json(#"{"token":"pass-1"}"#)) : (404, Data())
        }
        #expect(try await api.deviceToken() == "pass-1")
        #expect(try await api.deviceToken() == "pass-1")
        #expect(StubProtocol.seen.filter { $0.url!.path == "/api/device" }.count == 1)
        #expect(store.string(forKey: APIClient.deviceKey) == "pass-1")
    }

    @Test("falls back to the shared edition when the phone's date is not open")
    func editionFallback() async throws {
        let api = client()
        let edition = try Data(contentsOf: Bundle.module.url(forResource: "edition", withExtension: "json", subdirectory: "Fixtures")!)
        StubProtocol.handler = { req in
            switch req.url!.path {
            case "/api/editions/2026-10-25": return (404, Self.json(#"{"error":"no_edition"}"#))
            case "/api/questions/today": return (200, edition)
            default: return (404, Data())
            }
        }
        let set = try await api.day("2026-10-25")
        #expect(set.date == "2026-10-24")
    }

    @Test("sends a vote with its idempotency key and the device pass")
    func vote() async throws {
        let store = MemoryStore()
        store.set("pass-1", forKey: APIClient.deviceKey)
        let api = client(store)
        StubProtocol.handler = { _ in (202, Self.json(#"{"status":"accepted","eventId":"e1"}"#)) }
        try await api.vote(questionId: "q1", optionId: "a", sitting: .morning)
        let sent = try #require(StubProtocol.seen.first { $0.url!.path == "/api/votes" })
        let key = try #require(sent.value(forHTTPHeaderField: "Idempotency-Key"))
        #expect(!key.isEmpty)
        let body = try JSONSerialization.jsonObject(with: sent.httpBody ?? Data()) as? [String: String]
        #expect(body == ["questionId": "q1", "optionId": "a", "voterId": "pass-1", "sitting": "morning"])
    }

    @Test("keeps one key for one answer until it is accepted, a new one for another answer")
    func voteKeys() {
        let keys = VoteKeys(store: MemoryStore())
        let first = keys.key(questionId: "q1", optionId: "a")
        #expect(keys.key(questionId: "q1", optionId: "a") == first)
        #expect(keys.key(questionId: "q1", optionId: "b") != first)
    }

    @Test("gets a new pass and sends again when the server forgot the old one")
    func renewsPass() async throws {
        let store = MemoryStore()
        store.set("old", forKey: APIClient.deviceKey)
        let api = client(store)
        StubProtocol.handler = { req in
            switch req.url!.path {
            case "/api/device": return (201, Self.json(#"{"token":"new"}"#))
            case "/api/votes":
                let body = String(decoding: req.httpBody ?? Data(), as: UTF8.self)
                return body.contains("\"old\"") ? (401, Self.json(#"{"error":"invalid_device"}"#)) : (202, Self.json(#"{"status":"accepted","eventId":"e"}"#))
            default: return (404, Data())
            }
        }
        try await api.vote(questionId: "q1", optionId: "a", sitting: nil)
        let votes = StubProtocol.seen.filter { $0.url!.path == "/api/votes" }
        #expect(votes.count == 2)
        #expect(votes[0].value(forHTTPHeaderField: "Idempotency-Key") == votes[1].value(forHTTPHeaderField: "Idempotency-Key"))
        #expect(store.string(forKey: APIClient.deviceKey) == "new")
    }

    @Test("reads the server's error code")
    func errorCode() async {
        let api = client()
        StubProtocol.handler = { _ in (503, Self.json(#"{"error":"unavailable"}"#)) }
        await #expect(throws: APIError(status: 503, code: "unavailable")) {
            _ = try await api.today()
        }
    }
}
