import PersonaKit
import SwiftUI

/// What Helped Us: perspectives friends chose to share with this person,
/// shown as "A perspective from your circle", with no name. No likes, no
/// replies, no counts. The person's own shares show exactly who has them,
/// and each can be withdrawn.
struct WhatHelpedCard: View {
    @Environment(AppModel.self) private var model
    @State private var theme = "all"
    @State private var composing = false

    var body: some View {
        let shares = model.connect.shares
        let received = shares?.received ?? []
        let present = (shares?.themes ?? []).filter { t in received.contains { $0.theme == t.id } }
        let shown = theme == "all" ? received : received.filter { $0.theme == theme }
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: 2) {
                Text("What Helped Us").font(.pH2)
                Text("Real perspectives from people you trust.").font(.pSmall).foregroundStyle(Palette.muted)
            }
            if present.count > 1 {
                FlowRow {
                    Button("All themes") { theme = "all" }.buttonStyle(ChipStyle(on: theme == "all"))
                    ForEach(present) { t in Button(t.label) { theme = t.id }.buttonStyle(ChipStyle(on: theme == t.id)) }
                }
            }
            if shown.isEmpty {
                Text("Nothing shared with you yet. When a friend shares what helped them, it shows here, for you alone.")
                    .foregroundStyle(Palette.muted)
            } else {
                ForEach(shown.prefix(3)) { s in
                    HelpedRow(share: s, title: shares?.themes.first { $0.id == s.theme }?.label ?? "")
                }
            }
            Button("Share what helped you") { composing = true }.buttonStyle(OutlineButtonStyle())
            if let sent = shares?.sent, !sent.isEmpty {
                DisclosureGroup("What you’ve shared (\(sent.count))") {
                    ForEach(sent) { s in
                        VStack(alignment: .leading, spacing: Space.s1) {
                            Text("“\(s.text)”").font(.pH3)
                            Text("With \(s.to.isEmpty ? "no one now" : s.to.joined(separator: ", "))").font(.pSmall).foregroundStyle(Palette.muted)
                            Button("Withdraw") { Task { try? await model.connect.withdraw(s.id) } }
                                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                        }
                        .padding(.vertical, Space.s2)
                    }
                }
                .font(.pH3)
                .tint(Palette.text)
            }
        }
        .card()
        .sheet(isPresented: $composing) { ShareComposer(kind: .helped, text: "") }
    }
}

private struct HelpedRow: View {
    let share: ShareView
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s3) {
                Image(systemName: "person.2").foregroundStyle(Palette.accentInk)
                    .frame(width: 36, height: 36).background(Palette.accentWash, in: Circle())
                VStack(alignment: .leading, spacing: 0) {
                    Text(share.kind == .win ? "A win from your circle" : "A perspective from your circle").font(.pH3)
                    Text("Shared by someone you trust").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            if !title.isEmpty { Text(title).font(.pH2) }
            Text("“\(share.text)”").foregroundStyle(Palette.text2)
            if share.why != nil || share.tryThis != nil {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: Space.s3) { notes }
                    VStack(alignment: .leading, spacing: Space.s3) { notes }
                }
            }
        }
        .card(padding: Space.s4)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var notes: some View {
        if let why = share.why { note("sun.max", "Why it helped", why) }
        if let tryThis = share.tryThis { note("leaf", "Try it for yourself", tryThis) }
    }

    private func note(_ icon: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: Space.s2) {
            Image(systemName: icon).foregroundStyle(Palette.accentInk)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.figtree(14, .heavy))
                Text(text).font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s3)
        .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
    }
}

/// The share composer: the person's own words to edit, a theme, optional
/// notes and the friends they pick. Private until they press Share.
struct ShareComposer: View {
    let kind: ShareKind
    @State var text: String
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var theme = ""
    @State private var why = ""
    @State private var tryThis = ""
    @State private var to: Set<String> = []
    @State private var sentTo: [String]?
    @State private var error: String?

    private var friends: [FriendView] { model.circle?.friends.filter(\.reachable) ?? [] }
    private var words: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var ready: Bool { words.count >= NewShare.minText && !theme.isEmpty && !to.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                if let sentTo {
                    Section { Text("Shared with \(sentTo.joined(separator: ", ")). You can withdraw it any time in Connect.") }
                } else {
                    Section {
                        TextEditor(text: $text).frame(minHeight: 110).accessibilityLabel("What your friends will see")
                    } header: { Text("What your friends will see") } footer: {
                        Text("Exactly these words, and nothing else from your answers. \(NewShare.maxText - text.count) characters left.")
                    }
                    if kind == .helped {
                        Section("Optional") {
                            TextField("Why it helped", text: $why)
                            TextField("Try it for yourself", text: $tryThis)
                        }
                    }
                    Section("Theme") {
                        FlowRow {
                            ForEach(model.connect.shares?.themes ?? []) { t in
                                Button(t.label) { theme = t.id }.buttonStyle(ChipStyle(on: theme == t.id))
                            }
                        }
                    }
                    Section {
                        if friends.isEmpty { Text("Add someone to your circle first.").foregroundStyle(Palette.muted) }
                        ForEach(friends) { f in
                            Toggle(f.name, isOn: Binding(get: { to.contains(f.id) }, set: { if $0 { to.insert(f.id) } else { to.remove(f.id) } }))
                        }
                    } header: { Text("Who sees it") } footer: { Text("No one is picked for you. Private until you press Share.") }
                    if let error { Section { Text(error).foregroundStyle(Palette.danger) } }
                }
            }
            .sheetTitle(kind == .win ? "Share a win" : "Share what helped")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(sentTo == nil ? "Keep it private" : "Done") { dismiss() } }
                if sentTo == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(to.isEmpty ? "Share" : "Share with \(to.count)") { Task { await share() } }.disabled(!ready)
                    }
                }
            }
            .onChange(of: text) { _, new in if new.count > NewShare.maxText { text = String(new.prefix(NewShare.maxText)) } }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 560)
        #endif
    }

    private func share() async {
        do {
            try await model.connect.share(NewShare(kind: kind, theme: theme, text: words, why: why, tryThis: tryThis, to: Array(to)), date: model.date)
            sentTo = friends.filter { to.contains($0.id) }.map(\.name)
        } catch let e as APIError where e.code == "no_links" {
            error = "Links can’t be shared here. Say it in your own words."
        } catch {
            self.error = "That didn’t go through. Nothing was shared."
        }
    }
}
