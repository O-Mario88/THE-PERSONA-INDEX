import PersonaKit
import SwiftUI

/// The longer Mirrors' patterns (Release 3), as on the web
/// (frontend/src/MirrorPatterns.tsx): what Insights calls a pattern or
/// something noticed, with the counts behind it, and "Does this still feel
/// true?". No retires it, here and in Insights.
struct PatternsSection: View {
    @Environment(AppModel.self) private var model
    /// Read once, so a pattern retired here stays on the page with its reply.
    @State private var patterns: [NeedPattern]?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            ForEach(patterns ?? model.patterns()) { PatternCard(pattern: $0) }
            Text("Worked out on this device from your own answers of the last 30 days. Nothing here is sent.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
        .onAppear { if patterns == nil { patterns = model.patterns() } }
    }
}

private struct PatternCard: View {
    let pattern: NeedPattern
    @Environment(AppModel.self) private var model
    @State private var said: PatternCheck?
    @State private var asking = true

    var body: some View {
        let p = pattern
        VStack(alignment: .leading, spacing: Space.s2) {
            Eyebrow(text: p.evidence == .pattern ? "A pattern worth exploring" : "Something you’ve been noticing", color: Palette.accentInk)
            Text(Insights.needName(p.need) ?? p.need).font(.figtree(17, .heavy))
            Text("In \(p.answers) of your answers, on \(p.days) days since \(Reflection.dayMonth(p.since)), what you chose reached for \(Insights.needPhrases[p.need] ?? p.need).")
            if asking {
                Text("Does this still feel true?").font(.figtree(15, .semibold))
                HStack(spacing: Space.s2) {
                    ForEach(PatternCheck.allCases, id: \.self) { c in
                        Button(c.label) { tap(c) }.buttonStyle(ChipStyle())
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Does this still feel true?")
            } else if let said {
                HStack(spacing: Space.s2) {
                    Text(said.reply).font(.pSmall).foregroundStyle(Palette.text2)
                    if said != .no {
                        Button("Change") { asking = true }
                            .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk).buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Space.s4)
        .onAppear {
            said = model.patternCheck(p.need)
            asking = said == nil
        }
    }

    private func tap(_ c: PatternCheck) {
        model.checkPattern(pattern.need, c)
        said = c
        asking = false
    }
}
