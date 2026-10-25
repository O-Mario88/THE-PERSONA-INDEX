import PersonaKit
import SwiftUI

/// Insights: the weekly mirror. The week's line from the clearest read (a
/// leaning, never a type), the week in numbers, the week at a glance, the
/// traits on a 0-100 line set only against this phone's own past, and the
/// small steps. Each part shows only when there is something real in it.
struct InsightsView: View {
    @Environment(AppModel.self) private var model
    @State private var state: LoadState = .loading

    enum LoadState {
        case loading, failed, ready(WeekMirror)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                switch state {
                case .loading:
                    Text("Putting your week together…").foregroundStyle(Palette.muted).padding(.vertical, Space.s8)
                case .failed:
                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text("I couldn't load your mirror just now.")
                        Button("Try again") { Task { await load() } }.buttonStyle(PrimaryButtonStyle(wide: false))
                    }
                    .card(fill: Palette.surface2, stroke: .clear)
                case .ready(let m):
                    MirrorPage(m: m)
                }
            }
            .padding(Space.gutter)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            state = .ready(try await model.weekMirror())
        } catch {
            state = .failed
        }
    }
}

private struct MirrorPage: View {
    let m: WeekMirror

    /// The clearest read, and which end it leans to.
    private var top: (read: WeekMirror.TraitRead, side: Traits.Side)? {
        let earned = m.traits.filter { $0.level != .hint && Traits.all[$0.trait] != nil }
        guard let read = earned.max(by: { abs($0.score - 50) < abs($1.score - 50) }), let trait = Traits.all[read.trait] else { return nil }
        return (read, read.score >= 50 ? trait.high : trait.low)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            header
            if m.lowMood { support }
            tiles
            glance
            if !m.traits.isEmpty { traits }
            if !m.steps.isEmpty { steps }
            if !m.comingUp.isEmpty { comingUp }
            Text("Nothing on this page is fixed. It's a mirror of one week, and next week you get to answer again. For self-reflection, not a diagnosis.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("Week \(m.week) · \(range)".uppercased()).font(.pLabel).tracking(2).foregroundStyle(Palette.muted)
            if let top {
                Text("This week, you leaned towards \(top.side.lean).").font(.figtree(36, .heavy, relativeTo: .largeTitle))
                Text(top.side.headline).font(.figtree(18, .bold)).foregroundStyle(Palette.text2)
            } else {
                Text("This week is just getting started.").font(.figtree(36, .heavy, relativeTo: .largeTitle))
                Text("Your mirror fills in as you answer. A few days of questions is enough for the first patterns to show.")
                    .foregroundStyle(Palette.muted)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var support: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("A few of your answers this week sounded heavy. If things feel hard, talking to someone you trust, or to a helpline, can help.")
            Link("Find a helpline", destination: URL(string: "https://findahelpline.com")!).font(.figtree(16, .bold))
        }
        .card(stroke: Palette.lineStrong)
    }

    private var tiles: some View {
        let s = m.stats
        let items: [(String, String, String)] = [
            ("Days active", "\(s.daysActive) of \(s.daysSoFar)", s.daysActiveLastWeek > 0 ? "\(s.daysActiveLastWeek) last week" : "Your first week here"),
            ("Answers", "\(s.answers)", s.private > 0 ? "\(s.private) kept private" : "this week"),
            ("That's me", s.rated > 0 ? "\(s.me) of \(s.rated)" : "–", s.rated > 0 ? "cards you judged" : "Tap “That's me” on a card that fits"),
            ("Small steps", s.stepsStarted > 0 ? "\(s.stepsHelped) of \(s.stepsStarted)" : "–", s.stepsStarted > 0 ? "helped" : "Pick one with “I'll try it”"),
        ]
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.s3), GridItem(.flexible())], spacing: Space.s3) {
            ForEach(items, id: \.0) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.0).font(.figtree(14, .semibold)).foregroundStyle(Palette.muted)
                    Text(item.1).font(.figtree(28, .heavy))
                    Text(item.2).font(.figtree(12)).foregroundStyle(Palette.muted).lineLimit(2)
                }
                .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
                .card(padding: Space.s4)
            }
        }
    }

    private var glance: some View {
        Section(number: 1, title: "Your week at a glance") {
            HStack(spacing: 6) {
                ForEach(m.days, id: \.date) { day in
                    VStack(spacing: Space.s2) {
                        Text(weekday(day.date)).font(.figtree(12, .heavy))
                        FlowSquares(answers: day.answers)
                            .frame(minHeight: 16)
                        Text(day.edition > 0 ? "#\(day.edition)" : "Review").font(.figtree(10)).foregroundStyle(Palette.muted)
                    }
                    .padding(.vertical, Space.s3)
                    .frame(maxWidth: .infinity)
                    .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Palette.line))
                }
            }
            HStack(spacing: Space.s4) {
                Legend(color: Palette.accentInk, label: "Deep")
                Legend(color: Palette.onLime, label: "Deeper")
                Legend(color: Palette.lime, label: "Light")
            }
            .font(.figtree(12)).foregroundStyle(Palette.muted)
        }
    }

    private var traits: some View {
        Section(number: 2, title: "Your trait read") {
            ForEach(m.traits, id: \.trait) { read in
                if let trait = Traits.all[read.trait] {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        HStack {
                            Text(trait.name).font(.figtree(16, .heavy))
                            Spacer()
                            Text("\(Int(read.score.rounded()))").font(.figtree(16, .bold)).monospacedDigit()
                        }
                        ScaleLine(score: read.score)
                        HStack {
                            Text(trait.low.lean)
                            Spacer()
                            Text(trait.high.lean)
                        }
                        .font(.figtree(11)).foregroundStyle(Palette.muted)
                        Text(read.levelLine).font(.figtree(12)).foregroundStyle(Palette.muted)
                    }
                    .padding(.vertical, Space.s1)
                }
            }
            Text("0 to 100: where your answers sit between each question's two ends, with 50 in the middle. It compares you only with yourself, week to week.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private var steps: some View {
        Section(number: 3, title: "Your small steps") {
            ForEach(m.steps, id: \.step) { step in
                VStack(alignment: .leading, spacing: 2) {
                    Text(Themes.style(step.theme).name.uppercased()).font(.figtree(11, .bold)).tracking(1.4).foregroundStyle(Palette.muted)
                    Text(step.step).font(.figtree(16, .semibold))
                    Text(statusWords(step.status)).font(.figtree(13, .bold)).foregroundStyle(Palette.accentInk)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, Space.s2)
            }
        }
    }

    private var comingUp: some View {
        Section(number: m.steps.isEmpty ? 3 : 4, title: "Next week") {
            FlowChips(themes: m.comingUp)
        }
    }

    // MARK: Helpers

    private var range: String { "\(dayMonth(m.from)) to \(dayMonth(m.to))" }

    private func date(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.date(from: iso)
    }

    private func dayMonth(_ iso: String) -> String {
        guard let d = date(iso) else { return iso }
        return d.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "en_GB")))
    }

    private func weekday(_ iso: String) -> String {
        guard let d = date(iso) else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal.shortWeekdaySymbols[cal.component(.weekday, from: d) - 1]
    }

    private func statusWords(_ status: String) -> String {
        switch status {
        case "helped": "It helped"
        case "no_change": "No change yet"
        case "not_tried": "Not tried yet"
        default: "Started"
        }
    }
}

/// A numbered section card: the lime number, the title, then its body.
private struct Section<Content: View>: View {
    let number: Int
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack(spacing: Space.s3) {
                Text(String(format: "%02d", number))
                    .font(.figtree(12, .heavy))
                    .foregroundStyle(Palette.onLime)
                    .frame(width: 32, height: 32)
                    .background(Palette.lime, in: Circle())
                Text(title).font(.pH2)
            }
            content
        }
        .card()
    }
}

/// A day's answers as small squares, by depth.
private struct FlowSquares: View {
    let answers: [WeekMirror.DayAnswers.Answer]

    var body: some View {
        if answers.isEmpty {
            Circle().strokeBorder(Palette.lineStrong, lineWidth: 1.5).frame(width: 12, height: 12)
        } else {
            LazyVGrid(columns: [GridItem(.fixed(12), spacing: 3), GridItem(.fixed(12))], spacing: 3) {
                ForEach(Array(answers.enumerated()), id: \.offset) { _, a in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color(a.depth))
                        .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(a.depth == .private ? Palette.accentInk : .clear, lineWidth: 1.5))
                        .frame(width: 12, height: 12)
                }
            }
        }
    }

    private func color(_ d: Depth) -> Color {
        switch d {
        case .deep: Palette.accentInk
        case .deeper: Palette.onLime
        case .light: Palette.lime
        case .private: .clear
        }
    }
}

private struct Legend: View {
    let color: Color
    let label: String

    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 12, height: 12)
            Text(label)
        }
    }
}

/// A 0-100 line with the middle marked and a dot where the answers sit.
private struct ScaleLine: View {
    let score: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.surface3).frame(height: 8)
                Rectangle().fill(Palette.lineStrong).frame(width: 2, height: 14).offset(x: geo.size.width / 2 - 1)
                Circle()
                    .fill(Palette.accentInk)
                    .overlay(Circle().strokeBorder(Palette.surface, lineWidth: 3))
                    .frame(width: 18, height: 18)
                    .offset(x: geo.size.width * min(1, max(0, score / 100)) - 9)
            }
            .frame(maxHeight: .infinity)
        }
        .frame(height: 18)
        .accessibilityLabel("\(Int(score.rounded())) out of 100")
    }
}

/// Theme pills that wrap onto as many lines as they need.
private struct FlowChips: View {
    let themes: [String]

    var body: some View {
        WrapLayout(spacing: Space.s2) {
            ForEach(themes, id: \.self) { t in
                let s = Themes.style(t)
                Text("\(s.icon)  \(s.name)")
                    .font(.figtree(14, .bold))
                    .padding(.horizontal, Space.s3)
                    .padding(.vertical, 6)
                    .background(Palette.surface2, in: Capsule())
            }
        }
    }
}

/// A simple wrapping row.
struct WrapLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0, x + s.width > width { x = 0; y += row + spacing; row = 0 }
            x += s.width + spacing
            row = max(row, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX, x + s.width > bounds.maxX { x = bounds.minX; y += row + spacing; row = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            row = max(row, s.height)
        }
    }
}
