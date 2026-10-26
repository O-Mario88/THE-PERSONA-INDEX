import PersonaKit
import SwiftUI

/// Settings: the encrypted backup, easy sync and the app lock. One column,
/// at a reading width, on iPhone and Mac.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Settings").font(.pHero).accessibilityAddTraits(.isHeader)
                    Text("Your backup, your lock, and what this device keeps.").font(.figtree(17)).foregroundStyle(Palette.muted)
                }
                .padding(.top, Space.s2)
                BackupCard()
                LockCard()
            }
            .padding(Space.gutter)
            .frame(maxWidth: 720, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .task {
            await model.loadConnect()
            await model.backup.refresh(signedIn: model.signedIn, askSync: true)
        }
    }
}

/// The backup: off until the person turns it on with 12 words they write down.
struct BackupCard: View {
    @Environment(AppModel.self) private var model
    @State private var sheet: PhraseSheet.Mode?
    @State private var confirmOff = false
    @State private var showWords = false
    @State private var note: String?

    var body: some View {
        let backup = model.backup
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("Your backup").font(.pH2).accessibilityAddTraits(.isHeader)
            if let st = backup.state {
                Text("On. Sealed on this device before it’s sent, so I can’t open it or tell whose it is.").foregroundStyle(Palette.text2)
                Label(Self.status(st), systemImage: st.dirty == true ? "clock" : "checkmark.circle")
                    .font(.pSmall).foregroundStyle(Palette.muted)
                if backup.writingWaits {
                    Button("Bring back my reflections") { sheet = .writing }.buttonStyle(PrimaryButtonStyle())
                }
                HStack(spacing: Space.s4) {
                    Button("Back up now") { Task { await backup.backUpQuietly() } }
                    Button(showWords ? "Hide my phrase" : "Show my phrase") { showWords.toggle() }
                }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                .disabled(backup.busy)
                if showWords {
                    if let phrase = st.phrase {
                        PhraseGrid(phrase: phrase)
                    } else {
                        Text("This device was restored through sync, so it doesn’t hold your 12 words. Find them where you wrote them down.")
                            .font(.pSmall).foregroundStyle(Palette.text2)
                    }
                }
                if backup.signedIn { SyncRow(note: $note, sheet: $sheet) }
                Button("Turn off backup", role: .destructive) { confirmOff = true }
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.danger)
            } else {
                Text("Off. Everything stays on this device, so a lost or new one starts empty. Turn it on and your answers, reflections and settings are sealed here and kept for you.")
                    .foregroundStyle(Palette.text2)
                #if os(macOS)
                HStack(spacing: Space.s3) { turnOn; restore }
                #else
                VStack(alignment: .leading, spacing: Space.s3) { turnOn; restore }
                #endif
            }
            if let note { Text(note).font(.pSmall).foregroundStyle(Palette.danger) }
            Label("Your writing is private, end-to-end encrypted and synced only to your devices.", systemImage: "lock")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
        .card()
        .sheet(item: $sheet) { PhraseSheet(mode: $0) }
        .confirmationDialog("Turn off backup?", isPresented: $confirmOff, titleVisibility: .visible) {
            Button("Turn off backup", role: .destructive) {
                Task { note = await backup.turnOff() ? nil : "I couldn’t reach the server, so your backup is still there. Please try again." }
            }
            Button("Keep it on", role: .cancel) {}
        } message: {
            Text("This deletes your backup from the server, and your phrase will open nothing. Everything stays on this device.")
        }
    }

    private var turnOn: some View {
        Button("Back up with a 12-word phrase") { sheet = .turnOn(Phrase.new()) }.buttonStyle(PrimaryButtonStyle())
    }

    private var restore: some View {
        Button("Restore from a backup") { sheet = .restore }.buttonStyle(OutlineButtonStyle())
    }

    static func status(_ st: VaultState) -> String {
        if st.dirty == true, st.savedAt == nil { return "Waiting for a connection to make the first backup." }
        if st.dirty == true { return "Some changes are waiting to be backed up." }
        guard let ms = st.savedAt else { return "Backed up." }
        let at = Date(timeIntervalSince1970: ms / 1000)
        if Calendar.current.isDateInToday(at) { return "Last backed up today at \(at.formatted(date: .omitted, time: .shortened))." }
        return "Last backed up on \(at.formatted(.dateTime.day().month(.wide)))."
    }
}

/// Easy sync: the account keeps the keys to everything but the writing.
private struct SyncRow: View {
    @Environment(AppModel.self) private var model
    @Binding var note: String?
    @Binding var sheet: PhraseSheet.Mode?

    var body: some View {
        let backup = model.backup
        Toggle(isOn: Binding(get: { backup.sync }, set: { on in
            Task {
                let r = await backup.setSync(on)
                note = r.ok ? nil : "That didn’t go through. Nothing changed."
            }
        })) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Sync to my signed-in devices").font(.pH3)
                Text("A device you sign in on brings your answers and settings back without the 12 words. To make that work the server keeps the keys to them, so it could open them. Never your writing: that still needs your 12 words.")
                    .font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
        .tint(Palette.accentInk)
        .toggleStyle(.switch)
        .disabled(backup.busy)
    }
}

/// The app lock.
struct LockCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let lock = model.lock
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("App lock").font(.pH2).accessibilityAddTraits(.isHeader)
            Toggle(isOn: Binding(get: { lock.enabled }, set: { on in Task { await lock.setEnabled(on) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Lock with \(lock.method)").font(.pH3)
                    Text("The app covers itself whenever you leave it, and opens on a match. Checked by this device; nothing is sent.")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            .tint(Palette.accentInk)
            .toggleStyle(.switch)
            .disabled(!lock.available)
            if !lock.available {
                Text("Set a passcode on this device to use the lock.").font(.pSmall).foregroundStyle(Palette.text2)
            }
        }
        .card()
    }
}

/// The 12 words, numbered, in three or four columns.
struct PhraseGrid: View {
    let phrase: String

    var body: some View {
        let words = phrase.split(separator: " ").map(String.init)
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: Space.s2)], alignment: .leading, spacing: Space.s2) {
            ForEach(Array(words.enumerated()), id: \.offset) { i, w in
                HStack(spacing: Space.s2) {
                    Text("\(i + 1)").font(.figtree(13, .bold)).foregroundStyle(Palette.muted).frame(width: 20, alignment: .trailing)
                    Text(w).font(.figtree(17, .bold))
                }
                .padding(.vertical, Space.s2).padding(.horizontal, Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Word \(i + 1), \(w)")
            }
        }
        .privacySensitive()
    }
}
