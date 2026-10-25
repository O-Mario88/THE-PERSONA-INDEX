import Foundation

// Accounts, the circle and Growing Together (backend/accounts.go, circle.go,
// growing.go; the web's frontend/src/social.ts). Shapes the app uses only.

public struct AccountView: Codable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let handle: String
}

public enum Tag: String, Codable, Sendable, CaseIterable {
    case work, family, school, friends

    public var name: String { rawValue.capitalized }
}

public struct FriendView: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let name: String
    public let handle: String?
    public let tag: Tag
    public let since: String
    public let muted: Bool?
    public let active: Bool
    public let connect: Bool? // takes nods, shares and reach-outs

    public init(id: String, name: String, handle: String? = nil, tag: Tag, since: String, muted: Bool? = nil, active: Bool, connect: Bool? = true) {
        self.id = id
        self.name = name
        self.handle = handle
        self.tag = tag
        self.since = since
        self.muted = muted
        self.active = active
        self.connect = connect
    }

    /// A friend who can be sent something: not muted, and with Connect on.
    public var reachable: Bool { muted != true && connect != false }
}

public struct CircleView: Codable, Sendable, Hashable {
    public let me: AccountView
    public let friends: [FriendView]
    public let active: Int
    public let need: Int
}

public struct Growing: Codable, Sendable, Hashable {
    public struct Split: Codable, Sendable, Hashable {
        public struct Share: Codable, Sendable, Hashable {
            public let optionId: String
            public let count: Int
            public let percent: Double
            /// The small-group guard: fewer than five chose it, so no count.
            public let few: Bool?
        }
        public let questionId: String
        public let totalVotes: Int
        public let options: [Share]
    }
    public let date: String
    public let answers: Int
    public let min: Int
    public let questions: [Split]
}

/// The three circles (Edwin, 2026-10-25): placed by the person, kept on the
/// device under pi.rings and never sent.
public enum Ring: String, Codable, Sendable, CaseIterable {
    case inner, middle, outer

    public var name: String {
        switch self {
        case .inner: "Inner circle"
        case .middle: "Close"
        case .outer: "Wider circle"
        }
    }

    public var note: String {
        switch self {
        case .inner: "People you would trust with a secret"
        case .middle: "Close, but not that close"
        case .outer: "Friends out there"
        }
    }
}

public struct RingStore: Sendable {
    private let store: KeyValueStore
    static let key = "pi.rings"

    public init(store: KeyValueStore) {
        self.store = store
    }

    public func all() -> [String: Ring] {
        guard let raw = store.string(forKey: Self.key),
              let map = try? JSONDecoder().decode([String: String].self, from: Data(raw.utf8)) else { return [:] }
        return map.compactMapValues(Ring.init(rawValue:))
    }

    public func ring(of friendId: String) -> Ring { all()[friendId] ?? .outer }

    public func place(_ friendId: String, in ring: Ring) {
        var map = all().mapValues(\.rawValue)
        map[friendId] = ring.rawValue
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        if let data = try? encoder.encode(map) { store.set(String(decoding: data, as: UTF8.self), forKey: Self.key) }
    }
}
