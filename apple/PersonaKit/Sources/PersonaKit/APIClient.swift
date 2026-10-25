import Foundation

/// A vote keeps the same idempotency key until it is accepted, so a retry
/// after a dropped connection can never count twice. A different answer
/// takes a new key, since the server refuses one key for two answers.
public struct VoteKeys: Sendable {
    private let store: KeyValueStore
    static let prefix = "pi.pending."

    public init(store: KeyValueStore) {
        self.store = store
    }

    public func key(questionId: String, optionId: String) -> String {
        let saved = store.string(forKey: Self.prefix + questionId)?.split(separator: "|", maxSplits: 1).map(String.init)
        if let saved, saved.count == 2, saved[1] == optionId { return saved[0] }
        let key = UUID().uuidString.lowercased()
        store.set("\(key)|\(optionId)", forKey: Self.prefix + questionId)
        return key
    }

    /// Forgets the key once the vote is accepted.
    public func done(questionId: String) {
        store.set(nil, forKey: Self.prefix + questionId)
    }
}

/// The client for the Go API. One device pass per phone, asked for once and
/// kept in the Keychain; asked for again only when the server forgets it.
public actor APIClient {
    public static let deviceKey = "pi.device.v1"

    private let base: URL
    private let session: URLSession
    private let secrets: KeyValueStore
    private let keys: VoteKeys
    private var pendingToken: Task<String, Error>?

    public init(base: URL, session: URLSession = .shared, store: KeyValueStore, voteStore: KeyValueStore? = nil) {
        self.base = base
        self.session = session
        self.secrets = store
        self.keys = VoteKeys(store: voteStore ?? store)
    }

    // MARK: Requests

    private func request<T: Decodable>(_ path: String, method: String = "GET", query: [String: String] = [:], headers: [String: String] = [:], body: Data? = nil) async throws -> T {
        var url = base.appending(path: path)
        if !query.isEmpty { url.append(queryItems: query.map { URLQueryItem(name: $0.key, value: $0.value) }) }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.httpBody = body
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let code = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? "unavailable"
            throw APIError(status: status, code: code)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: The device pass

    public func deviceToken() async throws -> String {
        if let saved = secrets.string(forKey: Self.deviceKey) { return saved }
        if let pendingToken { return try await pendingToken.value }
        let task = Task<String, Error> {
            struct Pass: Decodable { let token: String }
            let pass: Pass = try await request("/api/device", method: "POST")
            return pass.token
        }
        pendingToken = task
        defer { pendingToken = nil }
        let token = try await task.value
        secrets.set(token, forKey: Self.deviceKey)
        return token
    }

    /// Runs a request with the pass; when the server no longer knows it, gets
    /// a new one and sends the same request once more.
    private func withDevice<T>(_ send: (String) async throws -> T) async throws -> T {
        do {
            return try await send(try await deviceToken())
        } catch let error as APIError where error.code == "invalid_device" || error.code == "device_forgotten" {
            secrets.set(nil, forKey: Self.deviceKey)
            return try await send(try await deviceToken())
        }
    }

    // MARK: Questions

    public func today() async throws -> DailySet {
        try await request("/api/questions/today")
    }

    /// The edition for the phone's own date, or the shared one when that date is not open.
    public func day(_ date: String) async throws -> DailySet {
        do {
            return try await request("/api/editions/\(date)")
        } catch let error as APIError where error.status == 404 {
            return try await today()
        }
    }

    // MARK: The mirror

    /// This phone's week, sent with its pass.
    public func mirror(_ date: String) async throws -> WeekMirror {
        try await withDevice { pass in
            try await request("/api/mirror", query: ["date": date], headers: ["Authorization": "Device \(pass)"])
        }
    }

    // MARK: Steps and card taps

    /// Starts the small step on an answered card, or says how it went.
    /// `needStep`: the person chose the step serving what the answer reached for.
    public func saveStep(questionId: String, optionId: String, status: StepStatus, date: String, needStep: Bool = false) async throws {
        struct Saved: Decodable { let status: String }
        struct Body: Encodable {
            let questionId: String, optionId: String, status: String, date: String, voterId: String
            let needStep: Bool?
        }
        let _: Saved = try await withDevice { voter in
            let body = Body(questionId: questionId, optionId: optionId, status: status.rawValue, date: date, voterId: voter, needStep: needStep ? true : nil)
            return try await request("/api/steps", method: "POST", body: try JSONEncoder().encode(body))
        }
    }

    /// "That's me", "Partly" or "Not me" under a card: one tap, its own key, never words.
    public func rate(questionId: String, optionId: String, verdict: Verdict) async throws {
        struct Accepted: Decodable { let status: String }
        let key = UUID().uuidString.lowercased()
        let _: Accepted = try await withDevice { voter in
            let body = ["questionId": questionId, "optionId": optionId, "verdict": verdict.rawValue, "voterId": voter]
            return try await request("/api/ratings", method: "POST", headers: ["Idempotency-Key": key], body: try JSONEncoder().encode(body))
        }
    }

    // MARK: Votes

    /// What became of a vote: counted now, or already counted from this phone.
    public enum VoteResult: Sendable, Equatable {
        case counted, alreadyCounted
    }

    @discardableResult
    public func vote(questionId: String, optionId: String, sitting: Sitting?) async throws -> VoteResult {
        struct Accepted: Decodable { let status: String }
        func send() async throws {
            let key = keys.key(questionId: questionId, optionId: optionId)
            let _: Accepted = try await withDevice { voter in
                var body = ["questionId": questionId, "optionId": optionId, "voterId": voter]
                if let sitting { body["sitting"] = sitting.rawValue }
                return try await request("/api/votes", method: "POST", headers: ["Idempotency-Key": key], body: try JSONEncoder().encode(body))
            }
        }
        do {
            do {
                try await send()
            } catch let error as APIError where error.code == "idempotency_key_reused" {
                // A key from before may belong to another answer: a new key, once.
                keys.done(questionId: questionId)
                try await send()
            }
            keys.done(questionId: questionId)
            return .counted
        } catch let error as APIError where error.code == "duplicate_vote" {
            // This phone's answer is already counted; nothing more to send.
            keys.done(questionId: questionId)
            return .alreadyCounted
        }
    }
}
