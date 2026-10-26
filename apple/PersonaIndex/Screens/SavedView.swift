import PersonaKit
import SwiftUI

/// Saved (the web's Notebook): cards you kept, your plans, the names you gave
/// your weeks and your own words, on this device only until you remove them.
/// With "Keep it mild" on, private cards are hidden and counted.
struct SavedView: View {
    @Environment(AppModel.self) private var model
    @State private var pick: Kind?

    enum Kind: String, CaseIterable, Identifiable {
        case cards = "Kept cards", steps = "Steps", mirrors = "Mirrors", words = "Your words"
        var id: String { rawValue }
    }

    var body: some View {
        let nb = model.notebook
        let all = nb.cards()
        let hidden = model.prefs.mild ? all.filter { $0.private == true }.count : 0
        let cards = model.prefs.mild ? all.filter { $0.private != true } : all
        let plans = nb.plans(), names = nb.names(), lines = nb.sentences(), good = nb.goodThings()
        let counts: [(Kind, Int)] = [(.cards, all.count), (.steps, plans.count), (.mirrors, names.count), (.words, lines.count + good.count)]
            .filter { $0.1 > 0 }
        let kind = counts.contains { $0.0 == pick } ? pick : counts.first?.0
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Eyebrow(text: "On this device only, until you remove it")
                    Text("Saved").font(.pHero).accessibilityAddTraits(.isHeader)
                }
                .padding(.top, Space.s2)

                if counts.isEmpty {
                    Text("Nothing here yet. Tap Keep in Notebook under any card and it lands here, with the day, your answer and what it said.")
                        .foregroundStyle(Palette.text2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(fill: Palette.surface2, stroke: .clear)
                }
                if counts.count > 1 {
                    FlowRow {
                        ForEach(counts, id: \.0) { k, n in
                            Button("\(k.rawValue) · \(n)") { pick = k }.buttonStyle(ChipStyle(on: kind == k))
                        }
                    }
                }
                switch kind {
                case .cards: cardList(cards, hidden: hidden)
                case .steps: planList(plans)
                case .mirrors: nameList(names)
                case .words: words(lines, good)
                case nil: EmptyView()
                }
                if !counts.isEmpty {
                    ShareLink(item: SavedFile(data: nb.export()), preview: SharePreview("My Saved")) {
                        Label("Download what's saved", systemImage: "square.and.arrow.down")
                    }
                    .font(.figtree(14, .bold))
                }
                Text("For self-reflection, not a diagnosis.").font(.pSmall).foregroundStyle(Palette.muted)
            }
            .padding(Space.gutter)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
    }

    @ViewBuilder private func cardList(_ cards: [KeptCard], hidden: Int) -> some View {
        let monday = Self.monday(of: model.date)
        let groups = [("This week", cards.filter { $0.date >= monday }), ("Earlier", cards.filter { $0.date < monday })]
        ForEach(groups, id: \.0) { label, list in
            if !list.isEmpty {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text(label).font(.pH3)
                    ForEach(list) { KeptCardView(card: $0) }
                }
            }
        }
        if hidden > 0 {
            Text("\(hidden) private \(hidden == 1 ? "card" : "cards") hidden while “Keep it mild” is on.").foregroundStyle(Palette.muted)
        }
    }

    private func planList(_ plans: [KeptPlan]) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "Your plans")
            ForEach(plans) { p in
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("Made \(Reflection.dayMonth(p.made))\(p.closed == true ? " · Closed" : "")".uppercased())
                        .font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
                    Text("When \(p.when), I will \(p.will).").font(.pH3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4)
            }
        }
    }

    private func nameList(_ names: [WeekName]) -> some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "The names you gave your weeks")
            ForEach(names, id: \.week) { n in
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("Week of \(Reflection.dayMonth(n.week)) · Sunday Mirror".uppercased()).font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
                    Text(n.name).font(.pH2)
                    Text("I suggested \(n.suggested).").font(.pSmall).foregroundStyle(Palette.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(padding: Space.s4)
            }
        }
    }

    @ViewBuilder private func words(_ lines: [WeekSentence], _ good: [GoodThings]) -> some View {
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: Space.s3) {
                Eyebrow(text: "What you learned, week by week")
                ForEach(lines, id: \.week) { s in
                    VStack(alignment: .leading, spacing: Space.s1) {
                        Text("Week of \(Reflection.dayMonth(s.week))".uppercased()).font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
                        Text(s.text).font(.pH3)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card(padding: Space.s4)
                }
            }
        }
        if !good.isEmpty {
            VStack(alignment: .leading, spacing: Space.s3) {
                Eyebrow(text: "Three good things")
                ForEach(good, id: \.date) { g in
                    VStack(alignment: .leading, spacing: Space.s1) {
                        Text(Reflection.dayMonth(g.date).uppercased()).font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
                        ForEach(g.lines, id: \.self) { Text("• \($0)") }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card(padding: Space.s4)
                }
            }
        }
    }

    /// The Monday of the week holding a date, for "This week".
    static func monday(of iso: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .iso8601)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return iso }
        var cal = Calendar(identifier: .iso8601)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let start = cal.dateInterval(of: .weekOfYear, for: d)?.start ?? d
        return f.string(from: start)
    }
}

/// One kept card: the day, the question, the answer and what the card said.
/// A private card stays folded until opened.
private struct KeptCardView: View {
    let card: KeptCard
    @Environment(AppModel.self) private var model
    @State private var open = false
    @State private var confirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Text("\(Reflection.dayMonth(card.date)) · \(Themes.style(card.theme).name)".uppercased())
                .font(.pLabel).tracking(1.5).foregroundStyle(Palette.muted)
            if card.private == true && !open {
                Text("A private answer").font(.pH3)
                Button("Show it") { open = true }.font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk).buttonStyle(.plain)
            } else {
                Text(card.prompt).font(.pSmall).foregroundStyle(Palette.text2)
                Text("You said “\(card.words ?? card.answer)”.").font(.pSmall).foregroundStyle(Palette.muted)
                Text(card.headline).font(.figtree(18, .heavy))
                if let body = card.body { Text(body).foregroundStyle(Palette.text2) }
                if let other = card.otherSide {
                    VStack(alignment: .leading, spacing: 2) {
                        Eyebrow(text: "The other side")
                        Text(other).foregroundStyle(Palette.text2)
                    }
                }
                if let step = card.step {
                    VStack(alignment: .leading, spacing: 2) {
                        Eyebrow(text: "Something you could try", color: Palette.accentInk)
                        Text(step)
                    }
                }
            }
            Button("Remove", role: .destructive) { confirm = true }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.danger).buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Space.s4)
        .confirmationDialog("Remove this card from Saved?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Remove it", role: .destructive) { model.unkeep(card.questionId) }
            Button("Keep it", role: .cancel) {}
        }
    }
}

/// The download: a JSON file of everything in Saved.
struct SavedFile: Transferable {
    let data: Data
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { $0.data }
            .suggestedFileName("my-saved.json")
    }
}
