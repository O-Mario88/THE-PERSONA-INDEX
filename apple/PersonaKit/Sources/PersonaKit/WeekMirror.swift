import Foundation

// The weekly mirror, built by the server from this phone's kept answers and
// only ever set against this phone's own past (backend/mirror.go,
// frontend/src/api.ts `Mirror`). Named WeekMirror: Swift already has a Mirror.

public enum Depth: String, Codable, Sendable {
    case light, deeper, deep, `private`
}

/// How far a read has been earned: a hint, a pattern, steady, or shifting.
public enum Level: String, Codable, Sendable {
    case hint, pattern, steady, changing

    public var name: String {
        switch self {
        case .hint: "A hint"
        case .pattern: "A pattern"
        case .steady: "Steady"
        case .changing: "Shifting"
        }
    }
}

public struct WeekMirror: Codable, Sendable, Hashable {
    public struct Stats: Codable, Sendable, Hashable {
        public let daysActive: Int
        public let daysActiveLastWeek: Int
        public let daysSoFar: Int
        public let answers: Int
        public let `private`: Int
        public let me: Int
        public let partly: Int
        public let rated: Int
        public let stepsStarted: Int
        public let stepsHelped: Int
    }

    public struct DayAnswers: Codable, Sendable, Hashable {
        public struct Answer: Codable, Sendable, Hashable {
            public let theme: String
            public let depth: Depth
        }
        public let date: String
        public let edition: Int
        public let answers: [Answer]
    }

    public struct TraitRead: Codable, Sendable, Hashable {
        public let trait: String
        public let answers: Int
        public let days: Int
        public let weeks: Int
        public let level: Level
        /// 0 to 100: where the answers sit between each question's two ends.
        public let score: Double
        public let change: Double?

        /// "Steady · 14 answers".
        public var levelLine: String {
            "\(level.name) · \(answers) \(answers == 1 ? "answer" : "answers")"
        }
    }

    public struct Step: Codable, Sendable, Hashable {
        public let theme: String
        public let step: String
        public let status: String
    }

    public let date: String
    public let week: Int
    public let from: String
    public let to: String
    public let stats: Stats
    public let days: [DayAnswers]
    public let traits: [TraitRead]
    public let steps: [Step]
    public let comingUp: [String]
    public let lowMood: Bool
}
