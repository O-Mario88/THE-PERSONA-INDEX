import PersonaKit
import SwiftUI

/// Insights' What Helped (Release 2), as on the web (frontend/src/HelpedSection.tsx):
/// the steps the person saved, each with a voluntary "How did it go?", and what
/// others who tried it and reported back found, once the server has enough
/// reports. Counts only, and always said with who is counted.
struct HelpedSection: View {
    @Environment(AppModel.self) private var model
    /// nil while loading; .some(nil) when the totals cannot be reached.
    @State private var totals: [WhatHelpedStep]??

    /// A few at a time keeps the section short.
    private static let shown = 3

    var body: some View {
        _ = model.reflect.intentions // read again when the saved steps change
        let steps = Array(model.stepReports.stepsToAsk(today: model.date).prefix(Self.shown))
        let found = totals.flatMap { $0 } ?? []
        let anyShown = steps.contains { s in found.contains { $0.questionId == s.questionId && $0.optionId == s.optionId } }
        return VStack(alignment: .leading, spacing: Space.s3) {
            Text("What Helped").font(.pH2).accessibilityAddTraits(.isHeader)
            if steps.isEmpty {
                Text("This fills in as you and others report back on the small steps you try.")
                    .foregroundStyle(Palette.text2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .card(fill: Palette.surface2, stroke: .clear)
            } else {
                Text("Steps you saved. Saying how one went is up to you: it’s anonymous and never includes your words.")
                    .font(.pSmall).foregroundStyle(Palette.muted)
                ForEach(steps) { step in
                    StepReportCard(step: step, others: others(for: step))
                }
                if anyShown {
                    Text("Only people who chose to report back are counted, so this leans towards those who stuck with a step. It isn’t proof that a step works.")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
        }
        .task(id: steps.count) {
            guard !steps.isEmpty else { return }
            totals = .some(await model.whatHelpedTotals())
        }
    }

    private func others(for step: SavedStep) -> OthersFound.State {
        guard let totals else { return .loading }
        guard let steps = totals else { return .unreachable }
        return steps.first { $0.questionId == step.questionId && $0.optionId == step.optionId }.map(OthersFound.State.found) ?? .notEnough
    }
}

private struct StepReportCard: View {
    let step: SavedStep
    let others: OthersFound.State
    @Environment(AppModel.self) private var model
    @State private var reported: HelpedOutcome?
    @State private var asking = true
    @State private var busy = false
    @State private var note: Note?

    enum Note { case thanks, failed }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "A step you saved", color: Palette.muted)
            Text(step.text).font(.figtree(17, .bold))
            if asking {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("How did it go?").font(.figtree(15, .semibold))
                    FlowRow {
                        ForEach(HelpedOutcome.allCases, id: \.self) { outcome in
                            Button(outcome.label) { Task { await tell(outcome) } }
                                .buttonStyle(ChipStyle(on: reported == outcome))
                                .disabled(busy)
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("How did it go?")
            } else if let reported {
                HStack(spacing: Space.s2) {
                    Text("You said: \(reported.label).").foregroundStyle(Palette.text2)
                    Button("Change") { asking = true }
                        .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk).buttonStyle(.plain)
                }
            }
            if let note {
                Text(note == .thanks ? "Thanks. Counted anonymously, with others who reported back."
                                     : "That didn’t go through, so nothing was counted. Try again later.")
                    .font(.pSmall).foregroundStyle(Palette.muted)
            }
            OthersFound(state: others)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .onAppear {
            reported = model.stepReports.reported(questionId: step.questionId, optionId: step.optionId)
            asking = reported == nil
        }
    }

    private func tell(_ outcome: HelpedOutcome) async {
        busy = true
        let ok = await model.report(step, outcome)
        busy = false
        guard ok else {
            note = .failed
            return
        }
        reported = outcome
        asking = false
        note = .thanks
    }
}

/// What others who tried the step and reported back found, in words.
private struct OthersFound: View {
    enum State { case loading, unreachable, notEnough, found(WhatHelpedStep) }
    let state: State

    var body: some View {
        switch state {
        case .loading:
            EmptyView()
        case .unreachable:
            Text("What others found can’t be reached just now.").font(.pSmall).foregroundStyle(Palette.muted)
        case .notEnough:
            Text("Not enough people have reported back on this step yet.").font(.pSmall).foregroundStyle(Palette.muted)
        case .found(let totals):
            let lines = StepReports.lines(totals)
            VStack(alignment: .leading, spacing: Space.s1) {
                if let tried = lines.tried { Text(tried) }
                if let notTried = lines.notTried { Text(notTried).font(.pSmall).foregroundStyle(Palette.muted) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(padding: Space.s4, fill: Palette.accentWash, stroke: .clear)
        }
    }
}
