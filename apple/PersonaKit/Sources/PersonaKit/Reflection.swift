import Foundation

// Reflect (Edwin, 2026-10-25): what went well and where to grow, across the
// parts of a life, drawn from the person's own answers and their week (and,
// with three or more friends, their circle's blended view). Each becomes a
// question answered in their own words; every answer is kept on the device
// and comes back later ("How has it gone since?"). No scores, no labels.

/// The eight parts of a life the reflection is grouped by.
public enum LifeArea: String, Codable, Sendable, CaseIterable {
    case work, school, family, culture, social, health, money, `self`

    public var name: String {
        switch self {
        case .work: "Work"
        case .school: "School"
        case .family: "Family"
        case .culture: "Culture and faith"
        case .social: "Friends and social"
        case .health: "Health"
        case .money: "Money"
        case .self: "Yourself"
        }
    }

    /// The area a question's theme belongs to (theme keys from backend/content.go).
    public static func of(theme: String?) -> LifeArea? {
        guard let theme else { return nil }
        switch theme {
        case "work-career", "colleagues": return .work
        case "school", "learning": return .school
        case "family", "relatives", "parenting", "partnership", "dating", "home", "intimacy": return .family
        case "faith", "celebrations": return .culture
        case "friendship", "neighbours", "helping": return .social
        case "sleep-health", "food", "body", "getting-around": return .health
        case "money", "wealth-luxury": return .money
        case "habits", "phone", "happiness", "sadness-stress", "anger", "honesty", "confidence",
             "quality-quantity", "ambition-desire", "plans", "rest":
            return .self
        default: return Themes.all[theme] == nil ? nil : .self
        }
    }
}

public enum ReflectionPeriod: String, Codable, Sendable, CaseIterable {
    case day, week, month

    public var name: String {
        switch self {
        case .day: "Today"
        case .week: "This week"
        case .month: "This month"
        }
    }

    var this: String {
        switch self {
        case .day: "today"
        case .week: "this week"
        case .month: "this month"
        }
    }

    var next: String {
        switch self {
        case .day: "tomorrow"
        case .week: "next week"
        case .month: "next month"
        }
    }
}

public enum ReflectionKind: String, Codable, Sendable {
    /// What an answer said about the person: something learnt.
    case learnt
    /// What's going well: a strength from an earned read.
    case strength
    /// Where the person could grow.
    case grow
}

/// Where an item came from, said beside it.
public enum ReflectionSource: String, Codable, Sendable {
    case yourAnswers, yourWeek, yourCircle

    public var name: String {
        switch self {
        case .yourAnswers: "From your answers"
        case .yourWeek: "From your week"
        case .yourCircle: "From your circle, blended"
        }
    }
}

public struct ReflectionItem: Sendable, Hashable, Identifiable {
    public let id: String
    public let area: LifeArea
    public let kind: ReflectionKind
    public let source: ReflectionSource
    public let text: String
}

public enum Reflection {
    /// What went well and where to grow. The day draws on today's answers;
    /// a week or a month adds the week's earned reads (never a hint).
    public static func items(period: ReflectionPeriod, answered: [(Question, Option)], mirror: WeekMirror?) -> [ReflectionItem] {
        var out: [ReflectionItem] = []
        for (q, o) in answered where q.care != .intimate && o.heavy != true {
            guard let insight = o.insight else { continue }
            let area = LifeArea.of(theme: q.theme) ?? .self
            out.append(ReflectionItem(id: "\(q.id)-learnt", area: area, kind: .learnt, source: .yourAnswers,
                                      text: Reveal.split(insight.reveal).headline))
            if let other = insight.otherSide, !other.isEmpty {
                out.append(ReflectionItem(id: "\(q.id)-grow", area: area, kind: .grow, source: .yourAnswers, text: other))
            }
        }
        if period != .day, let mirror {
            let earned = mirror.traits.filter { $0.level != .hint && Traits.all[$0.trait] != nil && abs($0.score - 50) >= 10 }
            for read in earned.sorted(by: { abs($0.score - 50) > abs($1.score - 50) }).prefix(3) {
                let trait = Traits.all[read.trait]!
                let side = read.score >= 50 ? trait.high : trait.low
                out.append(ReflectionItem(id: "\(read.trait)-well", area: .self, kind: .strength, source: .yourWeek, text: side.strength))
                out.append(ReflectionItem(id: "\(read.trait)-grow", area: .self, kind: .grow, source: .yourWeek, text: side.grow))
            }
        }
        // What was learnt, then strengths, then where to grow, each in the order found.
        return out.filter { $0.kind == .learnt } + out.filter { $0.kind == .strength } + out.filter { $0.kind == .grow }
    }

    /// "24 October": the day first, whatever the device's locale.
    public static func dayMonth(_ iso: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        guard let d = f.date(from: iso) else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_GB")
        out.timeZone = TimeZone(identifier: "UTC")
        out.dateFormat = "d MMMM"
        return out.string(from: d)
    }
}

