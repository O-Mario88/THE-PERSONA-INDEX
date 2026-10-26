import PersonaKit
import SwiftUI

/// Insights (Edwin, 2026-10-25), as on the web: its own page, with the
/// Mirrors one tap away. For You is the person's own answers; You're not
/// alone is the server's real counts, only once the Human Pulse is on;
/// What Helped and Your Growth fill in later and say so. On a Mac the
/// reading has the centre and the counts and saved cards sit beside it.
struct InsightsView: View {
    @Environment(AppModel.self) private var model
    @State private var month = false

    private static let week = 7
    private static let monthDays = 30
    private static let forYouMax = 6

    var body: some View {
        let all = model.insightCards(days: month ? Self.monthDays : Self.week)
        let cards = month ? all : Array(all.prefix(Self.forYouMax))
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Your Insights").font(.pHero).accessibilityAddTraits(.isHeader)
                    Text("Understand yourself. Discover you’re not alone. Find what helps.")
                        .font(.figtree(17)).foregroundStyle(Palette.muted)
                }
                .padding(.top, Space.s2)

                HStack {
                    Button("Last 30 days") { month.toggle() }
                        .buttonStyle(ChipStyle(on: month))
                        .accessibilityAddTraits(month ? .isSelected : [])
                    Spacer()
                    GoLink(title: "Your Mirrors →", section: .mirrors) { MirrorsView() }
                }

                #if os(macOS)
                HStack(alignment: .top, spacing: Space.s5) {
                    VStack(alignment: .leading, spacing: Space.s6) {
                        ForYouSection(cards: cards, month: month)
                        helped
                        growth
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .leading, spacing: Space.s5) {
                        NotAloneSection(cards: all)
                        ConnectNudgeCard()
                        SavedSection()
                    }
                    .frame(width: 320)
                }
                #else
                VStack(alignment: .leading, spacing: Space.s6) {
                    ForYouSection(cards: cards, month: month)
                    NotAloneSection(cards: all)
                    ConnectNudgeCard()
                    helped
                    growth
                    SavedSection()
                }
                #endif
            }
            .padding(Space.gutter)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
    }

    private var helped: some View {
        EmptySection(title: "What Helped", line: "This fills in as you and others report back on the small steps you try.")
    }

    private var growth: some View { GrowthSection() }
}

/// A way to another place: on a Mac the sidebar moves there; on iPhone the
/// place opens on top of Insights, with Back.
private struct GoLink<Destination: View>: View {
    let title: String
    let section: AppSection
    @ViewBuilder let destination: () -> Destination
    @Environment(AppModel.self) private var model

    var body: some View {
        #if os(macOS)
        Button(title) { model.section = section }
            .buttonStyle(.plain)
            .font(.figtree(15, .bold)).foregroundStyle(Palette.accentInk)
        #else
        NavigationLink(title, destination: destination)
            .font(.figtree(15, .bold)).foregroundStyle(Palette.accentInk)
        #endif
    }
}

private struct EmptySection: View {
    let title: String
    let line: String

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text(title).font(.pH2).accessibilityAddTraits(.isHeader)
            Text(line).foregroundStyle(Palette.text2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(fill: Palette.surface2, stroke: .clear)
        }
    }
}

private struct ForYouSection: View {
    let cards: [ForYouCard]
    let month: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("For You").font(.pH2).accessibilityAddTraits(.isHeader)
            if cards.isEmpty {
                Text(month ? "Nothing from the last 30 days yet. Your cards show here as you answer."
                           : "Answer a few questions and what they may say about you shows here, card by card.")
                    .foregroundStyle(Palette.text2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card(fill: Palette.surface2, stroke: .clear)
            } else {
                ForEach(cards) { InsightCardView(card: $0) }
            }
        }
    }
}

/// One card: how sure it is, the reading, what may matter here, the other
/// side, a small step to keep as an intention, and whether it is them.
private struct InsightCardView: View {
    let card: ForYouCard
    @Environment(AppModel.self) private var model

    var body: some View {
        let t = card.text
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: Insights.label(card.evidence, date: t.date, today: model.date), color: Palette.accentInk)
            (Text(t.prompt + " ").font(.pSmall) + Text("You chose “\(t.label)”.").font(.pSmall).foregroundStyle(Palette.muted))
            if t.heavy == true {
                HeavyNote()
            } else {
                reading(t)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .modifier(CardFrame(heavy: t.heavy == true))
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private func reading(_ t: CardText) -> some View {
        if let reveal = t.reveal {
            // The headline in bold, the rest quieter, as on the day's card.
            let parts = Reveal.split(reveal)
            Text(parts.headline).font(.figtree(19, .heavy, relativeTo: .title3))
            if !parts.body.isEmpty { Text(parts.body).foregroundStyle(Palette.text2) }
        }
        if let need = t.need, let name = Insights.needName(need) {
            VStack(alignment: .leading, spacing: Space.s2) {
                Eyebrow(text: "What may matter here")
                Text(name).font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                    .padding(.horizontal, Space.s4).frame(minHeight: 34)
                    .background(Palette.accentWash, in: Capsule())
            }
        }
        if let other = t.otherSide {
            VStack(alignment: .leading, spacing: 2) {
                Eyebrow(text: "The Other Side")
                Text(other).foregroundStyle(Palette.text2)
            }
        }
        if let step = t.step { TryThis(card: card, step: step) }
        RateRow(card: card)
        if let reveal = t.reveal {
            KeepButton(questionId: t.questionId) {
                model.keep(prompt: t.prompt, questionId: t.questionId, theme: t.theme, intimate: false, answer: t.label,
                           reveal: reveal, otherSide: t.otherSide, step: t.step, date: t.date)
            }
        }
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Space.s4) { links }
            VStack(alignment: .leading, spacing: Space.s2) { links }
        }
        Text("For self-reflection, not a diagnosis.").font(.figtree(12)).foregroundStyle(Palette.muted)
    }

    @ViewBuilder private var links: some View {
        GoLink(title: "Reflect on this", section: .reflect) { ReflectView() }
        GoLink(title: "Saved", section: .saved) { SectionView(section: .saved) }
        GoLink(title: "Weekly Mirror", section: .mirrors) { MirrorsView() }
    }
}

/// A heavy answer's own calm card carries the frame.
private struct CardFrame: ViewModifier {
    let heavy: Bool
    func body(content: Content) -> some View {
        if heavy { content } else { content.card() }
    }
}

private struct TryThis: View {
    let card: ForYouCard
    let step: String
    @Environment(AppModel.self) private var model

    private var id: String { "insight-\(card.questionId)" }

    var body: some View {
        let saved = model.reflect.intentions.contains { $0.id == id }
        VStack(alignment: .leading, spacing: Space.s2) {
            Eyebrow(text: "Something you could try", color: Palette.accentInk)
            Text(step)
            if saved {
                Text("Saved as an intention in Reflect.").font(.pSmall).foregroundStyle(Palette.muted)
            } else {
                Button("Save as an intention") {
                    model.reflect.keepIntention(id: id, text: step, from: card.questionId, today: model.date)
                }
                .buttonStyle(ChipStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Space.s4, fill: Palette.accentWash, stroke: Palette.accentLine)
    }
}

private struct RateRow: View {
    let card: ForYouCard
    @Environment(AppModel.self) private var model
    @State private var tapped: Verdict?

    var body: some View {
        if let v = tapped ?? card.verdict.flatMap(Verdict.init(rawValue:)) {
            Text(reply(v)).font(.pSmall).foregroundStyle(Palette.muted)
        } else {
            VStack(alignment: .leading, spacing: Space.s2) {
                Text("Does this sound like you?").font(.pH3)
                HStack(spacing: Space.s2) {
                    tap("That's me", .me)
                    tap("Partly", .partly)
                    tap("Not me", .notMe)
                }
            }
        }
    }

    private func tap(_ title: String, _ v: Verdict) -> some View {
        Button(title) {
            model.rate(card, v)
            tapped = v
            // A "Not me" card leaves For You once the reply has been read.
            if v == .notMe {
                Task {
                    try? await Task.sleep(for: .seconds(1.5))
                    model.refreshInsights()
                }
            }
        }
        .buttonStyle(ChipStyle())
    }

    private func reply(_ v: Verdict) -> String {
        switch v {
        case .me: "Noted. I'll keep building on it."
        case .partly: "Noted. I'll hold it loosely and keep watching."
        case .notMe: "You told me this isn't you, so I'll watch rather than assume."
        }
    }
}

/// How many chose the same, from the server's real counts. Only once the
/// person turns the Human Pulse on; never for a regional or heavy answer.
private struct NotAloneSection: View {
    let cards: [ForYouCard]
    @Environment(AppModel.self) private var model
    @State private var counts: [NotAloneQuestion]?
    @State private var loaded = false

    var body: some View {
        let counted = cards.filter { $0.text.heavy != true && !$0.regional }
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("You’re Not Alone").font(.pH2).accessibilityAddTraits(.isHeader)
            if !model.pulse {
                Text("With the Human Pulse on, this shows the count of people who chose the same response as you. Off unless you turn it on.")
                    .font(.pSmall).foregroundStyle(Palette.muted)
                GoLink(title: "Human Pulse in Settings", section: .settings) { SettingsView() }
            } else if counted.isEmpty {
                Text("Answer a question and how many chose the same shows here.").font(.pSmall).foregroundStyle(Palette.muted)
            } else if !loaded {
                Text("Getting the counts…").font(.pSmall).foregroundStyle(Palette.muted)
            } else if counts == nil {
                Text("The counts can’t be reached just now.").font(.pSmall).foregroundStyle(Palette.muted)
            } else {
                ForEach(counted) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.text.prompt).font(.pSmall)
                        Text(Insights.line(Insights.notAlone(counts, questionId: c.questionId, optionId: c.optionId) ?? .forming))
                            .font(.figtree(15, .bold))
                    }
                    .padding(.vertical, Space.s1)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .task(id: model.pulse) {
            guard model.pulse else { return }
            counts = await model.notAloneCounts()
            loaded = true
        }
    }
}

private struct SavedSection: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let kept = model.saved.cards.filter { $0.private != true }
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("Saved insights").font(.pH2).accessibilityAddTraits(.isHeader)
            if kept.isEmpty {
                Text("Cards you keep show here.").font(.pSmall).foregroundStyle(Palette.muted)
            } else {
                ForEach(kept.prefix(3)) { c in
                    Text(c.headline).font(.figtree(15, .semibold)).padding(.vertical, 2)
                }
            }
            GoLink(title: "Open Saved", section: .saved) { SectionView(section: .saved) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}
