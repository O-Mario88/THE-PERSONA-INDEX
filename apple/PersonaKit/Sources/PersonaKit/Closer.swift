import Foundation

// Closer Together, the new Connect (backend/closer.go; the web's
// frontend/src/social.ts). Three permissions, each asked for on its own:
// a shared insight goes only to the friends picked and can be withdrawn;
// Common Ground shows only what two friends share, once both opted in; a
// reach-out is one fixed phrase to one friend, and the sender is never told
// whether it was seen.

public struct ThemeOption: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
}

public enum ShareKind: String, Codable, Sendable {
    case helped, win
}

/// A shared insight as a friend sees it: "A perspective from your circle",
/// with no name. The server does not send who it came from.
public struct ShareView: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: ShareKind
    public let theme: String
    public let text: String
    public let why: String?
    public let tryThis: String?
    public let date: String

    enum CodingKeys: String, CodingKey {
        case id, kind, theme, text, why, date
        case tryThis = "try"
    }
}

/// A shared insight as its sender sees it, with who has it.
public struct SentShareView: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let kind: ShareKind
    public let theme: String
    public let text: String
    public let date: String
    public let to: [String]
}

public struct SharesView: Codable, Sendable, Hashable {
    public let themes: [ThemeOption]
    public let received: [ShareView]
    public let sent: [SentShareView]
}

public struct NewShare: Encodable, Sendable {
    public let kind: ShareKind
    public let theme: String
    public let text: String
    public let why: String?
    public let tryThis: String?
    public let to: [String]

    public init(kind: ShareKind, theme: String, text: String, why: String? = nil, tryThis: String? = nil, to: [String]) {
        self.kind = kind
        self.theme = theme
        self.text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self.why = why?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        self.tryThis = tryThis?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        self.to = to
    }

    enum CodingKeys: String, CodingKey {
        case kind, theme, text, why, to
        case tryThis = "try"
    }

    public static let minText = 10
    public static let maxText = 280
}

public struct CommonTag: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let value: String
    public let explore: String
}

public struct CommonPair: Codable, Sendable, Hashable {
    public let friend: FriendView
    public let shared: [String]
    public let headline: String
    public let explore: String
}

public struct CommonView: Codable, Sendable, Hashable {
    public let tags: [CommonTag]
    public let mine: [String]
    public let nextChange: String?
    public let optedIn: [String]
    public let pairs: [CommonPair]
}

public enum ReachKind: String, Codable, Sendable {
    case support, celebrate
}

public struct ReachOutView: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let from: FriendView
    public let kind: ReachKind
    public let text: String
    public let date: String
}

public struct ReachOutsView: Codable, Sendable, Hashable {
    public let phrases: [String: [ThemeOption]]
    public let received: [ReachOutView]

    public func phrases(_ kind: ReachKind) -> [ThemeOption] { phrases[kind.rawValue] ?? [] }
}

public struct NodView: Codable, Sendable, Hashable {
    public let from: FriendView
    public let card: Int
    public let text: String
    public let date: String
}

public struct NodsView: Codable, Sendable, Hashable {
    public let cards: [String]
    public let received: [NodView]
    public let sentTo: [String]
}

public struct Invite: Codable, Sendable, Hashable {
    public let code: String
    public let tag: Tag
    public let expiresOn: String
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

extension APIClient {
    private func json<T: Encodable>(_ value: T) throws -> Data { try JSONEncoder().encode(value) }
    private func path(_ id: String) -> String { id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id }

    // MARK: The circle

    public func createInvite(tag: Tag) async throws -> Invite {
        try await request("/api/circle/invites", method: "POST", headers: accountHeader, body: json(["tag": tag.rawValue]))
    }

    /// Mutes or re-tags a friend. Muting is silent: they are never told.
    public func patchFriend(_ id: String, tag: Tag? = nil, muted: Bool? = nil) async throws -> FriendView {
        struct Patch: Encodable { let tag: String?; let muted: Bool? }
        return try await request("/api/circle/friends/\(path(id))", method: "PATCH", headers: accountHeader, body: json(Patch(tag: tag?.rawValue, muted: muted)))
    }

    public func disconnect(_ id: String) async throws {
        try await send("/api/circle/friends/\(path(id))", method: "DELETE", headers: accountHeader)
    }

    // MARK: Shared insights

    public func shares() async throws -> SharesView {
        try await request("/api/shares", headers: accountHeader)
    }

    @discardableResult
    public func postShare(_ share: NewShare) async throws -> String {
        struct Made: Decodable { let id: String }
        let made: Made = try await request("/api/shares", method: "POST", headers: accountHeader, body: json(share))
        return made.id
    }

    public func withdrawShare(_ id: String) async throws {
        try await send("/api/shares/\(path(id))", method: "DELETE", headers: accountHeader)
    }

    // MARK: Common Ground

    public func common() async throws -> CommonView {
        try await request("/api/common", headers: accountHeader)
    }

    public func putCommon(tags: [String]) async throws {
        try await send("/api/common", method: "PUT", headers: accountHeader, body: json(["tags": tags]))
    }

    public func setCommonFriend(_ id: String, on: Bool) async throws {
        try await send("/api/common/friends/\(path(id))", method: "PUT", headers: accountHeader, body: json(["on": on]))
    }

    // MARK: Support & Celebrate

    public func reachOuts() async throws -> ReachOutsView {
        try await request("/api/reachouts", headers: accountHeader)
    }

    public func sendReachOut(to friend: String, kind: ReachKind, phrase: String) async throws {
        struct Sent: Decodable { let status: String }
        let _: Sent = try await request("/api/reachouts", method: "POST", headers: accountHeader, body: json(["to": friend, "kind": kind.rawValue, "phrase": phrase]))
    }

    public func putAwayReachOut(_ id: String) async throws {
        try await send("/api/reachouts/\(path(id))", method: "DELETE", headers: accountHeader)
    }

    // MARK: Quiet nods

    public func nods(_ date: String) async throws -> NodsView {
        try await request("/api/nods", query: ["date": date], headers: accountHeader)
    }

    public func sendNod(to friend: String, card: Int, date: String) async throws {
        struct Sent: Decodable { let status: String }
        struct Body: Encodable { let to: String; let card: Int; let date: String }
        let _: Sent = try await request("/api/nods", method: "POST", headers: accountHeader, body: json(Body(to: friend, card: card, date: date)))
    }
}
