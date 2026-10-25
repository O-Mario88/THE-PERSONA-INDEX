import Foundation

// The shapes the Go API sends (backend/api.go), as the web app reads them
// (frontend/src/api.ts). Fields the app does not use yet are left out, so
// the server can add to them freely.

/// The card shown right after an option is chosen.
public struct Insight: Codable, Hashable, Sendable {
    public let reveal: String
    public let otherSide: String?
    public let step: String
    public let needStep: String?
}

public struct Option: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let depth: Int?
    public let heavy: Bool?
    public let need: String?
    public let insight: Insight?

    public init(id: String, label: String, depth: Int? = nil, heavy: Bool? = nil, need: String? = nil, insight: Insight? = nil) {
        self.id = id
        self.label = label
        self.depth = depth
        self.heavy = heavy
        self.need = need
        self.insight = insight
    }
}

public enum Care: String, Codable, Sendable {
    case everyday, personal, intimate
}

public struct Question: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let theme: String?
    public let care: Care?
    public let prompt: String
    public let options: [Option]

    /// The option id sent for an intimate question: the server learns that
    /// one was answered, never which option (the review of 2026-10-15).
    public static let privateOption = "~private"

    public init(id: String, theme: String?, care: Care?, prompt: String, options: [Option]) {
        self.id = id
        self.theme = theme
        self.care = care
        self.prompt = prompt
        self.options = options
    }

    public func sentOption(for optionId: String) -> String {
        care == .intimate ? Self.privateOption : optionId
    }
}

public struct DailySet: Codable, Hashable, Sendable {
    public let date: String
    public let edition: Int?
    /// The morning's three.
    public let questions: [Question]
    /// The evening's three, opened at 5 pm on the phone.
    public let evening: [Question]?
    /// Sunday: no new questions, the day for the weekly mirror.
    public let review: Bool?
    public let tomorrowThemes: [String]?
}

public enum Sitting: String, Codable, Sendable {
    case morning, evening
}

/// An error the server answered with: its status and its `error` code.
public struct APIError: Error, Equatable, Sendable {
    public let status: Int
    public let code: String

    public init(status: Int, code: String) {
        self.status = status
        self.code = code
    }
}
