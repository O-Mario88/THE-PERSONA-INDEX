import PersonaKit
import SwiftUI

/// Insights' Your Growth (Release 3), as on the web (frontend/src/GrowthSection.tsx):
/// the person's own earlier and more recent entries in one part of life, side
/// by side. Nothing is said about what changed; that is theirs to say.
struct GrowthSection: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let pairs = model.growthPairs()
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("Your Growth").font(.pH2).accessibilityAddTraits(.isHeader)
            if pairs.isEmpty {
                Text("This fills in over the weeks, from your own earlier and recent answers.")
                    .foregroundStyle(Palette.text2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card(fill: Palette.surface2, stroke: .clear)
            } else {
                ForEach(pairs) { PairCard(pair: $0) }
                Text("Only your own answers, side by side. What changed, if anything, is yours to say.")
                    .font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
    }
}

private struct PairCard: View {
    let pair: GrowthPair
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let name = pair.kind == .reflections ? "\(pair.area.name), in your reflections" : pair.area.name
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s3))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Space.s3))
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: name, color: Palette.muted)
            layout {
                side("Earlier", pair.earlier)
                side("More recent", pair.recent)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(name)
    }

    private func side(_ when: String, _ s: GrowthSide) -> some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            Text("\(when) · \(Reflection.dayMonth(s.date))".uppercased()).font(.figtree(12, .bold)).tracking(1).foregroundStyle(Palette.muted)
            Text(s.asked)
            Text(pair.kind == .answers ? "You chose “\(s.words)”." : "“\(s.words)”").font(.figtree(16, .bold))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(Space.s4)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

/// A way into Connect (Release 3): for someone with a Circle, a gentle line
/// pointing to Support & Celebrate. It says nothing about any friend and
/// shares nothing about the person's answers.
struct ConnectNudgeCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.showsNudge {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Someone in your Circle might appreciate a little encouragement today.").font(.figtree(17, .bold))
                    Text("You choose who, if anyone, and what to send. Nothing about your answers is shared.")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                    FlowRow {
                        Button("Open Support & Celebrate") { model.openSupport() }.buttonStyle(PrimaryButtonStyle(wide: false))
                        Button("Not today") { model.nudgeNotToday() }.buttonStyle(.plain).font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                        Button("Don’t suggest this") { model.nudgeOff() }.buttonStyle(.plain).font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(fill: Palette.warmWash, stroke: .clear)
            }
        }
        .task { await model.loadCircleIfNeeded() }
    }
}
