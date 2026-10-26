import PersonaKit
import SwiftUI

/// A sitting: three questions, each answered with one tap and met with its
/// card (the insight, the other side, one small step), then the next.
struct SittingView: View {
    let sitting: Sitting
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var at = 0

    private var questions: [Question] { model.questions(for: sitting) }

    var body: some View {
        VStack(spacing: 0) {
            top
            ScrollView {
                VStack(alignment: .leading, spacing: Space.s5) {
                    if at < questions.count {
                        QuestionScreen(question: questions[at], sitting: sitting, isLast: at == questions.count - 1) {
                            withAnimation(.easeOut(duration: 0.24)) { at += 1 }
                        }
                        .id(questions[at].id)
                    } else {
                        closing
                    }
                }
                .padding(Space.gutter)
                .frame(maxWidth: 640, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .background(Palette.bg)
        .onAppear {
            at = questions.firstIndex { model.choice(for: $0) == nil } ?? questions.count
        }
    }

    private var top: some View {
        VStack(spacing: Space.s4) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "arrow.left").font(.system(size: 20, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
                Spacer()
                Eyebrow(text: "\(sitting.rawValue) sitting")
                Spacer()
                Text("\(min(at + 1, questions.count)) OF \(questions.count)")
                    .font(.pLabel).tracking(1.6)
                    .frame(width: 44, alignment: .trailing)
            }
            Segments(count: questions.count, reached: at)
        }
        .padding(.horizontal, Space.gutter)
        .padding(.top, Space.s3)
        .padding(.bottom, Space.s2)
    }

    private var closing: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s3) {
                Eyebrow(text: "\(sitting == .morning ? "Morning" : "Evening") close", color: Palette.onNavy2)
                Text(sitting == .morning ? "Three new threads woven in this morning." : "Three more woven in this evening.")
                    .font(.pTitle).foregroundStyle(Palette.onNavy)
                Text("A missed day stays open, and nothing resets.").font(.pSmall).foregroundStyle(Palette.onNavy2)
            }
            .padding(Space.s6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.navy, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))

            Text(sitting == .morning ? "Go about your day. Your evening three open at 17:00." : "Sleep well. Your next three open at 05:00.")
                .font(.pH3).foregroundStyle(Palette.text2)
            Button("Back to today") { dismiss() }.buttonStyle(PrimaryButtonStyle())
            Text("For self-reflection, not a diagnosis.").font(.figtree(12)).foregroundStyle(Palette.muted)
        }
    }
}

/// One question: its theme, the prompt, the answers; once answered, its card.
private struct QuestionScreen: View {
    let question: Question
    let sitting: Sitting
    let isLast: Bool
    let onNext: () -> Void
    @Environment(AppModel.self) private var model
    /// When the question appeared. A tap in the first moment is a touch left
    /// over from the screen before (a quick double tap on "Next"), never an answer.
    @State private var shownAt = Date()

    var body: some View {
        let chosen = model.choice(for: question)
        VStack(alignment: .leading, spacing: Space.s4) {
            ThemePill(theme: question.theme)
            Text(question.prompt).font(.figtree(32, .heavy, relativeTo: .largeTitle)).fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, Space.s2)
            if let chosen, let option = question.options.first(where: { $0.id == chosen }) {
                AnswerCard(question: question, option: option, nextLabel: isLast ? "Close the sitting" : "Next question", onNext: onNext)
            } else {
                VStack(spacing: Space.s3) {
                    ForEach(question.options) { option in
                        OptionRow(label: option.label) {
                            guard Date().timeIntervalSince(shownAt) > 0.5 else { return }
                            Task { await model.answer(question, with: option, in: sitting) }
                        }
                    }
                }
                Text("What you usually do, not what you wish you did.").font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
        .onAppear { shownAt = Date() }
    }
}

/// The card after an answer: the insight with its lime mark, the other
/// side, and one small step. A heavy answer gets kind words, never an insight.
private struct AnswerCard: View {
    @Environment(AppModel.self) private var model
    let question: Question
    let option: Option
    let nextLabel: String
    let onNext: () -> Void

    /// Straight under the card, so the next question is one tap away (Edwin, 2026-10-25).
    private var next: some View {
        Button(nextLabel, action: onNext)
            .buttonStyle(PrimaryButtonStyle())
            .accessibilityIdentifier("next-question")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            // The same row as before the tap, filled in, so nothing shifts.
            OptionRow(label: option.label, chosen: true) {}
                .allowsHitTesting(false)
                .accessibilityAddTraits(.isSelected)

            if option.heavy == true {
                HeavyNote()
                next
            } else if let insight = option.insight {
                let parts = Reveal.split(insight.reveal)
                HStack(alignment: .top, spacing: Space.s4) {
                    InsightMark().padding(.top, 2)
                    VStack(alignment: .leading, spacing: Space.s3) {
                        Eyebrow(text: Themes.style(question.theme).name, color: Palette.accentInk)
                        Text(parts.headline).font(.figtree(20, .heavy, relativeTo: .title3))
                        if !parts.body.isEmpty { Text(parts.body).foregroundStyle(Palette.text2) }
                        if let other = insight.otherSide {
                            VStack(alignment: .leading, spacing: 2) {
                                Eyebrow(text: "The other side", color: Palette.accentInk)
                                Text(other).foregroundStyle(Palette.text2)
                            }
                        }
                        Text("For self-reflection, not a diagnosis.").font(.figtree(12)).foregroundStyle(Palette.muted)
                        KeepButton(questionId: question.id) {
                            model.keep(prompt: question.prompt, questionId: question.id, theme: question.theme, intimate: question.care == .intimate,
                                       answer: option.label, reveal: insight.reveal, otherSide: insight.otherSide, step: insight.step, date: model.date)
                        }
                    }
                }
                .card()

                next

                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Something you could try").font(.pH3)
                    Text(insight.step).foregroundStyle(Palette.text2)
                }
                .card(fill: Palette.surface2, stroke: .clear)
            } else {
                next
            }
        }
    }
}
