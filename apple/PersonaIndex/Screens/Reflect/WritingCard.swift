import PersonaKit
import SwiftUI

let privacyLine = "Your writing is private, end-to-end encrypted and synced only to your devices."

/// The writing card: one question with why it appeared (or none, writing
/// freely), a spacious editor, a word count, Speak where the device can
/// recognise speech itself, and Save. After saving, something to try and a
/// thread are both optional.
struct WritingCard: View {
    let thought: Thought?
    let period: ReflectionPeriod
    let free: Bool
    var thread: String? = nil
    var onAnother: (() -> Void)? = nil
    var onDone: () -> Void = {}

    @Environment(AppModel.self) private var model
    @State private var text = ""
    @State private var check: Intention.Check?
    @State private var saved: String?
    @State private var dictation = Dictation()

    private var space: String { free ? "free" : period.rawValue }
    private var words: Int { text.split(whereSeparator: \.isWhitespace).count }

    var body: some View {
        Group {
            if let saved {
                AfterSaving(id: saved) { self.saved = nil; onDone() }
            } else {
                card
            }
        }
        .onAppear { text = model.reflect.journal.draft(space) }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack(alignment: .top, spacing: Space.s3) {
                Image(systemName: free ? "doc.text" : "leaf.fill")
                    .foregroundStyle(Palette.onLime).frame(width: 44, height: 44).background(Palette.lime, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Space.s1) {
                    Eyebrow(text: free ? "Write freely" : thread != nil ? "Continue the thread" : "A thought for you", color: Palette.accentInk)
                    Text(free ? "Whatever is on your mind." : thought?.question ?? "").font(.figtree(26, .heavy, relativeTo: .title2))
                    Text(free ? "No question, no shape to fill. Just your words." : thought?.lead ?? "").foregroundStyle(Palette.muted)
                    if !free, let why = thought?.why {
                        Text(why).font(.figtree(12, .bold)).foregroundStyle(Palette.accentInk)
                            .padding(.horizontal, Space.s3).padding(.vertical, 3).background(Palette.surface, in: Capsule())
                    }
                }
                Spacer(minLength: 0)
                if !free, let onAnother {
                    Button(action: onAnother) { Image(systemName: "arrow.clockwise") }
                        .buttonStyle(.plain).foregroundStyle(Palette.text).accessibilityLabel("Another question")
                }
            }
            if thought?.intention != nil {
                FlowRow {
                    ForEach(Intention.Check.allCases, id: \.self) { c in
                        Button(c.label) { check = c }.buttonStyle(ChipStyle(on: check == c))
                    }
                }
                .accessibilityLabel("How did it go?")
            }
            VStack(spacing: 0) {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty { Text("Start writing here…").foregroundStyle(Palette.muted).padding(.horizontal, 5).padding(.vertical, 8).accessibilityHidden(true) }
                    TextEditor(text: $text)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 150)
                        .accessibilityLabel(free ? "Write freely" : thought?.question ?? "Your reflection")
                        .onChange(of: text) { _, new in model.reflect.journal.saveDraft(space, new) }
                }
                .padding(Space.s3)
                Divider()
                HStack {
                    if dictation.available {
                        Button { dictation.toggle { said in text = text.isEmpty ? said : text.trimmingCharacters(in: .whitespaces) + " " + said } } label: {
                            Label(dictation.listening ? "Stop" : "Speak", systemImage: dictation.listening ? "stop.circle" : "mic")
                        }
                        .font(.figtree(14, .bold)).foregroundStyle(Palette.text)
                    }
                    Spacer()
                    Text(words == 1 ? "1 word" : "\(words) words").font(.pSmall).foregroundStyle(Palette.muted)
                }
                .padding(.horizontal, Space.s4).padding(.vertical, Space.s2)
            }
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: Radius.md))
            .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(Palette.line))
            ViewThatFits(in: .horizontal) {
                HStack { privacy; Spacer(); saveButton }
                VStack(alignment: .leading, spacing: Space.s3) { privacy; saveButton }
            }
        }
        .card(fill: free ? Palette.surface : Palette.accentWash, stroke: free ? Palette.line : Palette.accentLine)
    }

    private var privacy: some View {
        Label(privacyLine, systemImage: "lock").font(.pSmall).foregroundStyle(Palette.muted)
    }

    private var saveButton: some View {
        Button { save() } label: { Label("Save reflection", systemImage: "arrow.right").labelStyle(TrailingIcon()) }
            .buttonStyle(PrimaryButtonStyle(wide: false))
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && check == nil)
            .keyboardShortcut(.return, modifiers: .command)
    }

    private func save() {
        dictation.stop()
        if let id = thought?.intention, let check { model.reflect.check(id, check, today: model.date) }
        if let id = model.reflect.save(text, thought: free ? nil : thought, period: period, free: free, thread: thread, today: model.date) {
            text = ""
            model.reflect.journal.saveDraft(space, "")
            saved = id
        } else if check != nil {
            onDone()
        }
    }
}

/// After saving: optionally something to try, optionally a thread.
private struct AfterSaving: View {
    let id: String
    let done: () -> Void
    @Environment(AppModel.self) private var model
    @State private var tryText = ""
    @State private var kept = false
    @State private var linked: String?

    var body: some View {
        let earlier = model.reflect.reflections.filter { $0.id != id }.prefix(8)
        VStack(alignment: .leading, spacing: Space.s4) {
            Label("Saved, on this device and in your end-to-end backup.", systemImage: "checkmark").font(.pH3).foregroundStyle(Palette.accentInk)
            if kept {
                Text("Kept. I’ll ask how it went in a week.").font(.pSmall).foregroundStyle(Palette.muted)
            } else {
                Text("Something I’d like to try (optional)").font(.figtree(14, .bold))
                HStack {
                    TextField("Ask for help earlier", text: $tryText)
                        .padding(.horizontal, Space.s3).frame(minHeight: 44).background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                    Button("Keep it") { model.reflect.keepTry(tryText, from: id, today: model.date); kept = true }
                        .buttonStyle(OutlineButtonStyle()).frame(width: 110).disabled(tryText.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Text("In a week, a gentle check-in asks how it went. No goals and no scores.").font(.pSmall).foregroundStyle(Palette.muted)
            }
            if !earlier.isEmpty {
                if let linked {
                    Text("Added to the thread that began with “\(linked)”.").font(.pSmall).foregroundStyle(Palette.muted)
                } else {
                    Menu("Add it to a thread") {
                        ForEach(Array(earlier)) { e in
                            Button("\(Reflection.dayMonth(e.date)): \(e.answer.prefix(50))") {
                                model.reflect.link(id, to: e)
                                linked = String((model.reflect.thread(e.root).first?.answer ?? e.answer).prefix(40))
                            }
                        }
                    }
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                }
            }
            Button("Done", action: done).font(.figtree(14, .bold)).foregroundStyle(Palette.text)
        }
        .card(fill: Palette.accentWash, stroke: Palette.accentLine)
    }
}
