import PersonaKit
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Reflect: how the day, week or month went. What's going well and where
/// you could grow, from your own answers and your week, each with its
/// source; then questions you answer in your own words. Every answer is
/// kept on this device and comes back later. No scores, no labels.
struct ReflectView: View {
    @Environment(AppModel.self) private var model
    @State private var period: ReflectionPeriod = .day
    @State private var mirror: WeekMirror?

    private var items: [ReflectionItem] {
        Reflection.items(period: period, answered: model.answeredToday, mirror: mirror)
    }

    private var prompts: [ReflectionPrompt] {
        let done = Set(model.reflections.filter { $0.date == model.date && $0.period == period }.map(\.question))
        return Reflection.prompts(for: items, period: period, past: model.reflections, today: model.date)
            .filter { !done.contains($0.question) || $0.followsUp != nil }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                Eyebrow(text: "Reflect").padding(.top, Space.s2)
                Text("How did it go?").font(.pHero)
                Text("What went well, where you could grow, and what you learnt about yourself. In your own words.")
                    .font(.figtree(17)).foregroundStyle(Palette.muted)

                Picker("Look back over", selection: $period) {
                    ForEach(ReflectionPeriod.allCases, id: \.self) { Text($0.name).tag($0) }
                }
                .pickerStyle(.segmented)

                let learnt = items.filter { $0.kind == .learnt }
                let well = items.filter { $0.kind == .strength }
                let grow = items.filter { $0.kind == .grow }
                if items.isEmpty {
                    Text(period == .day
                         ? "Answer today’s questions and what they said about you shows here, ready to reflect on."
                         : "A few days of answers and your week fills this in.")
                        .font(.pSmall).foregroundStyle(Palette.text2)
                        .card(fill: Palette.surface2, stroke: .clear)
                } else {
                    ItemList(title: "What you learnt about yourself", items: learnt)
                    ItemList(title: "What’s going well", items: well)
                    ItemList(title: "Where you could grow", items: grow)
                }

                if !prompts.isEmpty {
                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text("Reflect on it").font(.pH2)
                        ForEach(prompts) { prompt in
                            PromptCard(prompt: prompt) { model.saveReflection(prompt, answer: $0, period: period) }
                        }
                    }
                }

                History(entries: model.reflections)

                Label("Kept on this device, and in your backup if you turn it on. Never sent.", systemImage: "lock")
                    .font(.pSmall).foregroundStyle(Palette.muted)
                Text("Circle insights arrive here with sign-in, once three friends have answered.")
                    .font(.figtree(12)).foregroundStyle(Palette.muted)
            }
            .padding(Space.gutter)
            .frame(maxWidth: 680, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }
            }
        }
        .task {
            model.loadReflections()
            mirror = try? await model.weekMirror()
        }
    }
}

/// A list of reflection items: the words, with the area and the source.
private struct ItemList: View {
    let title: String
    let items: [ReflectionItem]

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Space.s3) {
                Text(title).font(.pH2)
                ForEach(items) { item in
                    VStack(alignment: .leading, spacing: Space.s2) {
                        HStack(spacing: Space.s2) {
                            Text(item.area.name.uppercased()).font(.figtree(11, .bold)).tracking(1.4).foregroundStyle(Palette.accentInk)
                            Text("·").foregroundStyle(Palette.muted)
                            Text(item.source.name).font(.figtree(12)).foregroundStyle(Palette.muted)
                        }
                        Text(item.text).font(.figtree(16, .semibold)).fixedSize(horizontal: false, vertical: true)
                    }
                    .card(padding: Space.s4, fill: item.kind == .strength ? Palette.accentWash : Palette.surface,
                          stroke: item.kind == .strength ? Palette.accentLine : Palette.line)
                    // Strengths in lime; what was learnt and where to grow on white.
                }
            }
        }
    }
}

/// One question, answered by typing; saved with today's date.
private struct PromptCard: View {
    let prompt: ReflectionPrompt
    let onSave: (String) -> Void
    @State private var text = ""
    @State private var saved = false
    @FocusState private var writing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(alignment: .top, spacing: Space.s3) {
                InsightMark().padding(.top, 3)
                VStack(alignment: .leading, spacing: Space.s1) {
                    if prompt.followsUp == nil {
                        Text(prompt.about).font(.figtree(14)).foregroundStyle(Palette.text2)
                    }
                    Text(prompt.question).font(.pH3).fixedSize(horizontal: false, vertical: true)
                }
            }
            if saved {
                Label("Kept. It will come back to you later.", systemImage: "checkmark.circle.fill")
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
            } else {
                TextField("Write a line or two…", text: $text, axis: .vertical)
                    .lineLimit(3...8)
                    .focused($writing)
                    .font(.pBody)
                    .padding(Space.s3)
                    .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                Button("Keep this") {
                    writing = false
                    onSave(text)
                    saved = true
                }
                .buttonStyle(PrimaryButtonStyle(wide: false))
                .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .card()
    }
}

/// Everything written before, newest first, by date.
private struct History: View {
    let entries: [ReflectionEntry]

    var body: some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: Space.s3) {
                Text("Your reflections").font(.pH2)
                ForEach(entries) { e in
                    VStack(alignment: .leading, spacing: Space.s1) {
                        Text("\(Reflection.dayMonth(e.date)) · \(e.area.name)".uppercased()).font(.figtree(11, .bold)).tracking(1.2).foregroundStyle(Palette.muted)
                        Text(e.question).font(.figtree(14)).foregroundStyle(Palette.text2)
                        Text("“\(e.answer)”").font(.figtree(16, .semibold))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, Space.s2)
                    Divider()
                }
            }
        }
    }
}

/// Closes the keyboard from anywhere on the screen.
@MainActor
func hideKeyboard() {
    #if canImport(UIKit)
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    #endif
}
