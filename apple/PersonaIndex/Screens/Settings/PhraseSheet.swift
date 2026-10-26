import PersonaKit
import SwiftUI

/// The three things done with the 12 words: write them down and turn the
/// backup on, restore from them, or bring back the writing on a device
/// restored through sync.
struct PhraseSheet: View {
    enum Mode: Identifiable {
        case turnOn(String), restore, writing
        var id: String {
            switch self {
            case .turnOn: "on"
            case .restore: "restore"
            case .writing: "writing"
            }
        }
    }

    let mode: Mode
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.s4) {
                    switch mode {
                    case let .turnOn(phrase): TurnOnSteps(phrase: phrase) { dismiss() }
                    case .restore: RestoreForm(writing: false) { dismiss() }
                    case .writing: RestoreForm(writing: true) { dismiss() }
                    }
                }
                .padding(Space.gutter)
            }
            .sheetTitle(title)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } } }
        }
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 520)
        #endif
    }

    private var title: String {
        switch mode {
        case .turnOn: "Your 12 words"
        case .restore: "Restore from a backup"
        case .writing: "Bring back your reflections"
        }
    }
}

/// Write the words down, then type two of them back, then turn on.
private struct TurnOnSteps: View {
    let phrase: String
    let done: () -> Void
    @Environment(AppModel.self) private var model
    @State private var checking = false
    @State private var first = ""
    @State private var second = ""
    @State private var wrong: Int?
    @State private var failed = false
    @State private var ask = PhraseCheck.positions()

    private var words: [String] { phrase.split(separator: " ").map(String.init) }

    var body: some View {
        if checking {
            Text("To be sure your note is right, type two of the words from it.").foregroundStyle(Palette.text2)
            field("What is the \(PhraseCheck.ordinal(ask.0)) word?", text: $first)
            field("What is the \(PhraseCheck.ordinal(ask.1)) word?", text: $second)
            if let wrong { Text("That isn’t the \(PhraseCheck.ordinal(wrong)) word. Have another look at your note.").font(.pSmall).foregroundStyle(Palette.danger) }
            if failed { Text("Something went wrong turning the backup on. Please try again.").font(.pSmall).foregroundStyle(Palette.danger) }
            Button("Turn on backup") { Task { await turnOn() } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(first.isEmpty || second.isEmpty || model.backup.busy)
            Button("Show the words again") { checking = false; wrong = nil }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
        } else {
            Text("Write these 12 words down, in order, on paper. They are the only way back to your backup: there is no email and no account, and I can’t recover them for you. Anyone who has them can open it, so keep them somewhere safe.")
                .foregroundStyle(Palette.text2)
            PhraseGrid(phrase: phrase)
            Button("I’ve written them down") { checking = true }.buttonStyle(PrimaryButtonStyle())
        }
    }

    private func field(_ label: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            Text(label).font(.pH3)
            TextField("", text: text)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .padding(.horizontal, Space.s4).frame(minHeight: 44)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                .accessibilityLabel(label)
        }
    }

    private func turnOn() async {
        wrong = PhraseCheck.wrong(words: words, ask: ask, answers: (first, second))
        guard wrong == nil else { return }
        failed = await model.backup.turnOn(phrase) != .saved && model.backup.state == nil
        if !failed { done() }
    }
}

/// Type the 12 words to restore everything, or only the writing.
private struct RestoreForm: View {
    let writing: Bool
    let done: () -> Void
    @Environment(AppModel.self) private var model
    @State private var phrase = ""
    @State private var problem: String?
    @State private var restored = false

    var body: some View {
        if restored {
            Text(writing ? "Your reflections are back on this device." : "Everything from your backup is back on this device, and it carries on backing up under the same phrase.")
            Button("Carry on") { done() }.buttonStyle(PrimaryButtonStyle())
        } else {
            Text(writing
                 ? "Everything else came back with sync. Your writing is end-to-end encrypted, so only your 12 words can open it. You’ll only need to do this once on this device."
                 : "Restoring brings back the answers, reflections and settings in your backup, and joins them with anything already on this device.")
                .foregroundStyle(Palette.text2)
            Text("Your 12 words").font(.pH3)
            TextEditor(text: $phrase)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(.never)
                #endif
                .scrollContentBackground(.hidden)
                .frame(minHeight: 90)
                .padding(Space.s2)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                .privacySensitive()
                .accessibilityLabel("Your 12 words")
                .onChange(of: phrase) { _, _ in problem = nil }
            if let problem { Text(problem).font(.pSmall).foregroundStyle(Palette.danger) }
            Button(writing ? "Bring them back" : "Restore") { Task { await restore() } }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.backup.busy || phrase.split(whereSeparator: \.isWhitespace).count != 12)
        }
    }

    private func restore() async {
        if let p = Phrase.problem(phrase) { problem = PhraseCheck.describe(p); return }
        let r = writing ? await model.backup.restoreWriting(phrase) : await model.backup.restore(phrase)
        switch r {
        case .restored:
            await model.reloadAfterRestore()
            restored = true
        case .mismatch: problem = "Those aren’t the 12 words for this account’s backup."
        case .none: problem = "There’s no backup for this phrase. Check it against your note; if the backup was turned off, there’s nothing to restore."
        case .damaged: problem = "That backup couldn’t be opened, or the server couldn’t be reached. Nothing on this device was changed."
        }
    }
}

/// Checking the note: two different positions, and words in plain English.
enum PhraseCheck {
    static func positions() -> (Int, Int) {
        let picks = Array((1...12).shuffled().prefix(2)).sorted()
        return (picks[0], picks[1])
    }

    static func wrong(words: [String], ask: (Int, Int), answers: (String, String)) -> Int? {
        func same(_ typed: String, _ at: Int) -> Bool { typed.trimmingCharacters(in: .whitespaces).lowercased() == words[at - 1] }
        if !same(answers.0, ask.0) { return ask.0 }
        if !same(answers.1, ask.1) { return ask.1 }
        return nil
    }

    static func ordinal(_ n: Int) -> String {
        ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"][n - 1]
    }

    static func describe(_ p: Phrase.Problem) -> String {
        switch p {
        case let .count(n): n == 0 ? "Type your 12 words, in order." : "That’s \(n) \(n == 1 ? "word" : "words"). A phrase has 12."
        case let .word(w, at): "Word \(at), “\(w)”, isn’t one of the phrase words. Check its spelling against your note."
        case .checksum: "Those words don’t fit together as a phrase. Check their order against your note."
        }
    }
}
