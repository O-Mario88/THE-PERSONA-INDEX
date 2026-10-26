import Foundation

// Your Growth (Insights Release 3), as on the web (frontend/src/growth.ts):
// for each part of life, the earliest and the latest of the person's own
// entries at least two weeks apart, side by side, with nothing said about what
// changed. Answers come with their question and the answer chosen (the card
// kept 30 days); reflections, in the person's own words, only if they turned
// that on in Reflect. Private and heavy answers are left out. Worked out on
// this device; nothing is sent. Without two real entries far enough apart
// there is no pair.

public struct GrowthSide: Sendable, Hashable {
    public let date: String
    public let asked: String
    public let words: String
}

public struct GrowthPair: Sendable, Hashable, Identifiable {
    public enum Kind: String, Sendable { case answers, reflections }
    public let area: LifeArea
    public let kind: Kind
    public let earlier: GrowthSide
    public let recent: GrowthSide
    public var id: String { kind.rawValue + "." + area.rawValue }
}

public enum Growth {
    public static let gapDays = 14
    static let most = 3

    public static func pairs(store: KeyValueStore, today: String) -> [GrowthPair] {
        let texts = CardTexts(store: store)
        let fromAnswers: [(LifeArea, GrowthSide)] = AnswerHistory(store: store).answers().compactMap { a in
            guard a.theme != "intimacy", !a.heavy, daysBetween(a.date, today) >= 0,
                  let t = texts.text(a.questionId), t.heavy != true else { return nil }
            return (LifeArea.of(theme: a.theme) ?? .self, GrowthSide(date: a.date, asked: t.prompt, words: t.label))
        }
        let include = JournalStore(store: store).settings.reflectionsInGrowth
        let fromReflections: [(LifeArea, GrowthSide)] = include
            ? ReflectionStore(store: store).all().filter { !$0.answer.isEmpty }.map { ($0.area, GrowthSide(date: $0.date, asked: $0.question, words: $0.answer)) }
            : []
        let all = pairs(fromAnswers, .answers) + pairs(fromReflections, .reflections)
        return Array(all.sorted { $0.recent.date > $1.recent.date }.prefix(most))
    }

    private static func pairs(_ entries: [(LifeArea, GrowthSide)], _ kind: GrowthPair.Kind) -> [GrowthPair] {
        Dictionary(grouping: entries, by: \.0).compactMap { area, list in
            let sides = list.map(\.1).sorted { $0.date < $1.date }
            guard let earlier = sides.first, let recent = sides.last, daysBetween(earlier.date, recent.date) >= gapDays else { return nil }
            return GrowthPair(area: area, kind: kind, earlier: earlier, recent: recent)
        }
    }
}
