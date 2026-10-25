import Foundation

// "A thought for you" (Reflect): one question at a time, built on the device
// from templates and the person's own answers, their week and earlier
// reflections (the web's frontend/src/thoughts.ts, same words). Each says
// why it appeared and never claims more than that. Today is for noticing
// now; the week for what repeated, helped or changed; the month for what
// was learnt and which intentions matter.

public struct Thought: Sendable, Hashable, Identifiable {
    public enum Source: Sendable, Hashable { case general, answers, week, reflections, intention }
    public let id: String
    public let question: String
    public let lead: String
    public let why: String
    public let source: Source
    public let area: LifeArea
    public var followsUp: String? = nil
    public var intention: String? = nil

    public init(id: String, question: String, lead: String, why: String, source: Source, area: LifeArea, followsUp: String? = nil, intention: String? = nil) {
        self.id = id
        self.question = question
        self.lead = lead
        self.why = why
        self.source = source
        self.area = area
        self.followsUp = followsUp
        self.intention = intention
    }
}

public enum Thoughts {
    public struct Answered: Sendable {
        public let question: Question
        public let option: Option
        public let date: String
        public init(question: Question, option: Option, date: String) {
            self.question = question
            self.option = option
            self.date = date
        }
    }

    static let lead: [ReflectionPeriod: String] = [
        .day: "Take a moment to reflect on what felt meaningful, challenging or different. There’s no right answer.",
        .week: "Look back over the week: what repeated, what helped, what changed.",
        .month: "Step back a little: what this month taught you, and what you want to carry on.",
    ]
    static let general: [ReflectionPeriod: [String]] = [
        .day: ["Where did you feel most like yourself today?", "What took more out of you today than you expected?", "What is one moment from today you want to remember?"],
        .week: ["What kept coming up for you this week?", "What helped you most this week?", "What changed for you this week, even a little?"],
        .month: ["What did this month teach you about yourself?", "Which intentions matter to you going into next month?", "What are you glad you let go of this month?"],
    ]
    static let whyGeneral: [ReflectionPeriod: String] = [.day: "A question for any day", .week: "A question for looking back on a week", .month: "A question for looking back on a month"]
    static let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// "today", "on Tuesday" within the week, else "on 6 October".
    public static func whenSaid(_ date: String, today: String) -> String {
        if date == today { return "today" }
        let days = daysBetween(date, today)
        if days > 0 && days < 7, let d = isoDay.date(from: date) {
            var cal = Calendar(identifier: .gregorian)
            cal.timeZone = TimeZone(identifier: "UTC")!
            return "on \(weekdays[cal.component(.weekday, from: d) - 1])"
        }
        return "on \(Reflection.dayMonth(date))"
    }

    static let verbs: Set<String> = ["ask", "take", "try", "say", "call", "write", "go", "walk", "sleep", "eat", "pause", "listen", "leave", "put", "keep", "stop", "start", "make", "give", "spend", "turn", "set", "read", "plan", "rest", "breathe", "check", "text", "tell", "share", "let", "do", "get", "find", "choose", "notice", "speak"]
    static let doubled: Set<String> = ["put", "stop", "set", "plan", "let", "get"]

    /// "Ask for help earlier" becomes "asking for help earlier", or nil.
    public static func gerund(_ text: String) -> String? {
        var words = text.trimmingCharacters(in: .whitespaces).split(separator: " ").map(String.init)
        guard let first = words.first?.lowercased(), verbs.contains(first) else { return nil }
        let ing = doubled.contains(first) ? first + String(first.last!) + "ing" : first.hasSuffix("e") && !first.hasSuffix("ee") ? String(first.dropLast()) + "ing" : first + "ing"
        words[0] = ing
        return words.joined(separator: " ").trimmingCharacters(in: CharacterSet(charactersIn: ".!"))
    }

    public static func make(period: ReflectionPeriod, today: String, answered: [Answered], mirror: WeekMirror?, past: [ReflectionEntry], due: [Intention]) -> [Thought] {
        var out: [Thought] = due.map { i in
            Thought(id: "intention-\(i.id)",
                    question: gerund(i.text).map { "Did \($0) make any difference?" } ?? "Did “\(i.text)” make any difference?",
                    lead: "No right answer. It may have helped, a little, not yet, or you may want to let it go.",
                    why: "From something you wanted to try, \(whenSaid(i.date, today: today))", source: .intention, area: .self, intention: i.id)
        }
        let generals = (general[period] ?? []).enumerated().map { n, q in
            Thought(id: "general-\(period.rawValue)-\(n)", question: q, lead: lead[period] ?? "", why: whyGeneral[period] ?? "", source: .general, area: .self)
        }
        if let first = generals.first { out.append(first) }
        for a in answered.prefix(3) where a.question.care != .intimate && a.option.heavy != true {
            out.append(Thought(id: "answer-\(a.question.id)", question: "You chose “\(a.option.label)”. Where did that show up for you \(period.this)?",
                               lead: a.question.prompt, why: "From your answers \(whenSaid(a.date, today: today))", source: .answers,
                               area: LifeArea.of(theme: a.question.theme) ?? .self))
        }
        if period != .day, let read = mirror?.traits.filter({ $0.level != .hint && Traits.all[$0.trait] != nil && abs($0.score - 50) >= 10 })
            .max(by: { abs($0.score - 50) < abs($1.score - 50) }), let trait = Traits.all[read.trait] {
            let side = read.score >= 50 ? trait.high : trait.low
            out.append(Thought(id: "week-\(read.trait)", question: "Your answers leaned towards \(side.lean). Where did you notice it \(period.this)?",
                               lead: lead[period] ?? "", why: "From your Mirror this week", source: .week, area: .self))
        }
        if period != .day {
            let from = addDays(today, -(period == .week ? 7 : 31))
            if let earlier = past.filter({ $0.date < today && $0.date >= from && $0.answer.count <= 160 }).min(by: { $0.date < $1.date }) {
                out.append(Thought(id: "past-\(earlier.id)", question: "You wrote: “\(earlier.answer)” How does that sit with you now?",
                                   lead: "Your own words, brought back.", why: "From your reflection \(whenSaid(earlier.date, today: today))",
                                   source: .reflections, area: earlier.area, followsUp: earlier.id))
            }
        }
        return out + generals.dropFirst()
    }
}

