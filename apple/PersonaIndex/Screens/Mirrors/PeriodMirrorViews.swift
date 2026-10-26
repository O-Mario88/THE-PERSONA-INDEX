import PersonaKit
import SwiftUI

/// The month, quarter or year, as on the web: the span in a line, the span in
/// numbers, week by week, each trait's leaning (never a score), the answers
/// that said the most, the small steps that helped, and a closing line.
struct PeriodMirrorTab: View {
    let period: Period
    @Environment(AppModel.self) private var model
    @State private var state: Load = .loading

    enum Load { case loading, failed, ready(PeriodMirror) }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            switch state {
            case .loading:
                Text("Putting your \(period.rawValue) together…").foregroundStyle(Palette.muted).padding(.vertical, Space.s8)
            case .failed:
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("I couldn't load your \(period.rawValue) just now.")
                    Button("Try again") { Task { await load() } }.buttonStyle(PrimaryButtonStyle(wide: false))
                }
                .card(fill: Palette.surface2, stroke: .clear)
            case .ready(let p):
                PeriodPage(p: p)
            }
        }
        .task { await load() }
    }

    private func load() async {
        do { state = .ready(try await model.periodMirror(period)) } catch { state = .failed }
    }
}

private struct PeriodPage: View {
    let p: PeriodMirror

    private var adjective: String {
        switch p.period {
        case .month: "monthly"
        case .quarter: "quarterly"
        case .year: "yearly"
        }
    }

    var body: some View {
        let parts = sections
        VStack(alignment: .leading, spacing: Space.s5) {
            VStack(alignment: .leading, spacing: Space.s3) {
                Text("Your \(adjective) mirror · \(MirrorText.periodName(p.period, label: p.label)) · Week \(p.weeks.count) of \(p.weeksTotal)".uppercased())
                    .font(.pLabel).tracking(2).foregroundStyle(Palette.muted)
                Text(MirrorText.headline(p)).font(.figtree(34, .heavy, relativeTo: .largeTitle)).accessibilityAddTraits(.isHeader)
                Text(MirrorText.summary(p)).foregroundStyle(Palette.text2)
            }
            .fixedSize(horizontal: false, vertical: true)
            tiles
            ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                MirrorSection(number: i + 1, title: part.title) { part.body }
            }
            Text(MirrorText.close(p.period)).font(.figtree(17, .semibold))
            Text("For self-reflection, not a diagnosis.").font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private struct Part { let title: String; let body: AnyView }

    private var sections: [Part] {
        var out = [Part(title: "Week by week", body: AnyView(weekByWeek)),
                   Part(title: "Your trait read", body: AnyView(traits))]
        if !p.moments.isEmpty { out.append(Part(title: "The answers that said the most", body: AnyView(moments))) }
        if p.stats.stepsStarted > 0 { out.append(Part(title: "Your small steps", body: AnyView(steps))) }
        return out
    }

    private var tiles: some View {
        let s = p.stats
        let items: [(String, String, String)] = [
            ("Weeks you came back", "\(s.weeksActive) of \(s.weeksSoFar)", "weeks on record so far"),
            ("Days active", "\(s.daysActive) of \(s.daysSoFar)", "question days"),
            ("Answers", "\(s.answers)", s.private > 0 ? "\(s.private) kept private" : "this \(p.period.rawValue)"),
            s.stepsStarted > 0 ? ("Small steps kept", "\(s.stepsTried) of \(s.stepsStarted)", "\(s.stepsHelped) helped")
                               : ("Small steps kept", "–", "Pick one with “I'll try it”"),
        ]
        return StatTiles(items: items.map { StatTiles.Item(name: $0.0, value: $0.1, note: $0.2) })
    }

    private var weekByWeek: some View {
        let kept = p.weeks.filter(\.kept)
        let active = kept.filter { $0.daysActive > 0 }.count
        return VStack(alignment: .leading, spacing: Space.s3) {
            HStack(alignment: .bottom, spacing: p.period == .year ? 2 : 6) {
                ForEach(p.weeks, id: \.monday) { w in
                    VStack(spacing: 4) {
                        GeometryReader { geo in
                            VStack {
                                Spacer(minLength: 0)
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(w.kept ? Palette.lime : Palette.surface3)
                                    .frame(height: max(4, geo.size.height * min(1, Double(w.daysActive) / 6)))
                            }
                        }
                        .frame(height: 64)
                        if p.period != .year { Text("\(w.week)").font(.figtree(10)).foregroundStyle(Palette.muted).dynamicTypeSize(...DynamicTypeSize.xLarge) }
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement()
                    .accessibilityLabel(w.kept ? "Week \(w.week): \(w.daysActive) of \(w.daysSoFar) days, \(w.answers) \(w.answers == 1 ? "answer" : "answers")" : "Week \(w.week): nothing on record")
                }
            }
            Text(p.stats.answers == 0
                 ? "No answers yet this \(p.period.rawValue). Whenever you come back, it starts filling in."
                 : "You came back in \(active) of \(kept.count) \(kept.count == 1 ? "week" : "weeks").")
                .foregroundStyle(Palette.text2)
        }
    }

    @ViewBuilder private var traits: some View {
        if p.traits.isEmpty {
            Text("Your trait read starts once two answers touch the same trait. A few more days will do it.").foregroundStyle(Palette.text2)
        } else {
            ForEach(p.traits, id: \.trait) { t in
                if let trait = Traits.all[t.trait] {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text(trait.name).font(.figtree(16, .heavy))
                        ScaleLine(score: t.score, leaning: t.score >= 50 ? trait.high.lean : trait.low.lean)
                        HStack {
                            Text(trait.low.lean)
                            Spacer()
                            Text(trait.high.lean)
                        }
                        .font(.figtree(11)).foregroundStyle(Palette.muted)
                        Text(t.levelLine).font(.figtree(12)).foregroundStyle(Palette.muted)
                    }
                    .padding(.vertical, Space.s1)
                }
            }
            Text("Set only against your own answers, never anyone else’s.").font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private var moments: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            ForEach(p.moments, id: \.self) { m in
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("\(Reflection.dayMonth(m.date)) · #\(m.edition)".uppercased()).font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
                    Text(m.prompt).font(.pH3)
                    Text("You said “\(m.label)”.").foregroundStyle(Palette.text2)
                    if !m.headline.isEmpty { Text(m.headline).font(.figtree(15, .bold)).foregroundStyle(Palette.accentInk) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4, fill: Palette.surface2, stroke: .clear)
            }
            Text("Your deepest answers this \(p.period.rawValue) that leaned clearly one way. Private answers are never shown.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            ForEach(p.helped, id: \.self) { h in
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("Started \(Reflection.dayMonth(h.started)) · Helped".uppercased()).font(.pLabel).tracking(1.5).foregroundStyle(Palette.accentInk)
                    Text(h.step)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4, fill: Palette.accentWash, stroke: Palette.accentLine)
            }
            Text(p.stats.stepsHelped > 0 ? "The ones that helped are worth keeping." : "Every try teaches you something, including the ones that change nothing.")
                .foregroundStyle(Palette.text2)
        }
    }
}

/// The Outside Mirror: locked until enough friends have answered, then the
/// circle's blended read beside your own. Positions only, never a number.
struct OutsideMirrorSection: View {
    let own: [String: Double]
    @Environment(AppModel.self) private var model
    @State private var o: OutsideMirror?

    var body: some View {
        // A real view even before it loads, so its task runs (an empty Group has none).
        VStack(alignment: .leading, spacing: 0) {
            if let o {
                VStack(alignment: .leading, spacing: Space.s4) {
                    Text("Your Outside Mirror").font(.pH2).accessibilityAddTraits(.isHeader)
                    if o.open { open(o) } else { locked(o) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()
            } else {
                Color.clear.frame(height: 1)
            }
        }
        .task { o = try? await model.outsideMirror() }
    }

    private func locked(_ o: OutsideMirror) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Label("Opens when \(o.need) friends have answered", systemImage: "lock").font(.pH3)
            ForEach(0..<o.need, id: \.self) { i in
                let done = i < o.friends
                HStack(spacing: Space.s3) {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle").foregroundStyle(done ? Palette.accentInk : Palette.muted)
                    Text(done ? "A friend" : (o.need - o.friends == 1 ? "One more friend" : "A friend to invite"))
                    Spacer()
                    Text(done ? "Answered" : "Waiting").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            .accessibilityElement(children: .combine)
            Text("With two friends you could work out who said what by elimination. Three keeps every answer anonymous, by arithmetic, not by promise. Answers already given are held until the third friend joins.")
                .font(.pSmall).foregroundStyle(Palette.text2)
            Button(o.need - o.friends == 1 ? "Invite one more person" : "Invite friends") { model.section = .connect }
                .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func open(_ o: OutsideMirror) -> some View {
        let read = MirrorText.outside(o, own: own)
        return VStack(alignment: .leading, spacing: Space.s3) {
            Text(MirrorText.outsideLead(o)).font(.pSmall).foregroundStyle(Palette.muted)
            if let shared = read.shared {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Eyebrow(text: "Shared ground", color: Palette.accentInk)
                    Text(shared)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4, fill: Palette.accentWash, stroke: Palette.accentLine)
            }
            if let miss = read.miss {
                VStack(alignment: .leading, spacing: Space.s1) {
                    Eyebrow(text: "What your circle notices that you might miss")
                    Text(miss)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4, fill: Palette.surface2, stroke: .clear)
            }
            ForEach(o.traits.filter { Traits.all[$0.trait] != nil }, id: \.trait) { t in
                let trait = Traits.all[t.trait]!
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text(trait.name).font(.figtree(15, .heavy))
                    ScaleLine(score: t.position, leaning: t.position >= 50 ? trait.high.lean : trait.low.lean)
                    HStack { Text(trait.low.lean); Spacer(); Text(trait.high.lean) }
                        .font(.figtree(11)).foregroundStyle(Palette.muted)
                }
            }
            Text("The dot is where your circle places you. For self-reflection, not a diagnosis.").font(.pSmall).foregroundStyle(Palette.muted)
        }
    }
}
