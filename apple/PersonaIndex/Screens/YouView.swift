import PersonaKit
import SwiftUI

/// You (the web's Account screen): the two things friends see, how the
/// account signs in and where, the person's choices, what is kept and for
/// how long, and the ways out. Signed out it is this device, with a way to
/// sign in. Two columns on a Mac, one on iPhone.
struct YouView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                if let details = model.account {
                    ProfileHead(details: details)
                } else {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text("You").font(.pHero).accessibilityAddTraits(.isHeader)
                        Text("Your choices, and what this device keeps.").font(.figtree(17)).foregroundStyle(Palette.muted)
                    }
                    .padding(.top, Space.s2)
                }
                if let note = model.accountNote {
                    Text(note).font(.pSmall).foregroundStyle(Palette.text2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .card(fill: Palette.surface2, stroke: .clear)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                #if os(macOS)
                HStack(alignment: .top, spacing: Space.s5) {
                    left.frame(maxWidth: .infinity, alignment: .topLeading)
                    right.frame(width: 360, alignment: .topLeading)
                }
                #else
                left
                right
                #endif
            }
            .padding(Space.gutter)
            .frame(maxWidth: 1100, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .task { await model.loadAccount() }
        .onDisappear { model.accountNote = nil }
        .refreshable { await model.loadAccount() }
    }

    private var left: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            if let details = model.account {
                ProfileFields(me: details.account)
                DevicesCard(details: details)
            } else {
                SignInCard()
            }
            ChoicesCard()
            GoRow(title: "Settings: your name, intimacy questions, backup, Human Pulse, reminders and lock", section: .settings) { SettingsView() }
        }
    }

    private var right: some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            if model.account != nil { KeptCard() }
            GoRow(title: "Show my 12-word recovery phrase", section: .settings) { SettingsView() }
            if model.account != nil { DeleteAccountCard() }
        }
    }
}

/// A row that goes to another place: the sidebar on a Mac, a push on iPhone.
private struct GoRow<Destination: View>: View {
    let title: String
    let section: AppSection
    @ViewBuilder let destination: () -> Destination
    @Environment(AppModel.self) private var model

    var body: some View {
        #if os(macOS)
        Button { model.section = section } label: { label }.buttonStyle(.plain)
        #else
        NavigationLink(destination: destination) { label }.buttonStyle(.plain)
        #endif
    }

    private var label: some View {
        HStack {
            Text(title).font(.pH3).multilineTextAlignment(.leading)
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: Space.s4)
    }
}

private struct ProfileHead: View {
    let details: AccountDetails

    var body: some View {
        let me = details.account
        HStack(spacing: Space.s4) {
            Text(String((me.name.isEmpty ? "You" : me.name).prefix(1)).uppercased())
                .font(.figtree(32, .heavy)).foregroundStyle(Palette.onLime)
                .frame(width: 76, height: 76)
                .background(Palette.lime, in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Space.s1) {
                Eyebrow(text: "Your profile")
                Text(me.name.isEmpty ? "Your account" : me.name + (me.handle.isEmpty ? "" : " · @\(me.handle)"))
                    .font(.pTitle).accessibilityAddTraits(.isHeader)
                let n = max(details.sessions.count, 1)
                Text("\(me.sync == true ? "Everything synced" : "Reflections and notebook on this device") · \(n) device\(n == 1 ? "" : "s")")
                    .font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
        .padding(.top, Space.s2)
    }
}

/// The only two things friends see.
private struct ProfileFields: View {
    let me: AccountView
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var handle = ""
    @State private var note: String?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "Profile · the only two things friends see")
            field("Display name", text: $name, max: 40)
            field("Handle for invites", text: $handle, max: 21)
            if let note { Text(note).font(.pSmall).foregroundStyle(note == "Saved." ? Palette.muted : Palette.danger) }
        }
        .card()
        .onAppear {
            name = me.name
            handle = me.handle.isEmpty ? "" : "@\(me.handle)"
        }
        .onChange(of: focused) { _, now in if !now { Task { await save() } } }
        .onSubmit { Task { await save() } }
    }

    private func field(_ label: String, text: Binding<String>, max: Int) -> some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            Text(label).font(.pSmall).foregroundStyle(Palette.muted)
            TextField(label, text: text)
                .focused($focused)
                .autocorrectionDisabled()
                #if os(iOS)
                .textInputAutocapitalization(label == "Display name" ? .words : .never)
                #endif
                .padding(.horizontal, Space.s4).frame(minHeight: 44)
                .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                .onChange(of: text.wrappedValue) { _, new in if new.count > max { text.wrappedValue = String(new.prefix(max)) } }
        }
    }

    private func save() async {
        do {
            try await model.updateProfile(name: name, handle: handle)
            note = "Saved."
        } catch let e as APIError {
            note = switch e.code {
            case "handle_taken": "That handle is taken."
            case "invalid_handle": "A handle is 3 to 20 letters, numbers or underscores."
            case "invalid_name": "A name of 1 to 40 letters, please."
            default: "That didn’t save. Try again."
            }
        } catch {
            note = "That didn’t save. Try again."
        }
    }
}

/// How the account signs in, the devices on it, sync, and signing out.
private struct DevicesCard: View {
    let details: AccountDetails
    @Environment(AppModel.self) private var model
    @State private var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "Sign-in & devices")
            ForEach(details.logins, id: \.self) { l in
                row(l.name, l.hint) { Text("Connected").font(.pSmall).foregroundStyle(Palette.accentInk) }
            }
            ForEach(details.sessions) { s in
                row(s.label.isEmpty ? "A device" : s.label, s.current ? "Now" : "Last here \(Reflection.dayMonth(s.seenOn))") {
                    if s.current {
                        Text("This device").font(.pSmall).foregroundStyle(Palette.muted)
                    } else {
                        Button("Sign out there") { Task { try? await model.signOut(session: s.id) } }
                            .buttonStyle(ChipStyle())
                    }
                }
            }
            Toggle(isOn: Binding(get: { model.backup.sync }, set: { on in
                Task { note = await model.backup.setSync(on).ok ? nil : "That didn’t go through. Nothing changed." }
            })) {
                labelled("Sync to my signed-in devices",
                         "A device you sign in on brings your answers and settings back without the 12 words. The server keeps the keys to them, so it could open them. Never your writing: that still needs your 12 words.")
            }
            .toggleStyle(SwitchRowStyle())
            .disabled(model.backup.busy)
            Toggle(isOn: Binding(get: { details.account.suggest ?? false }, set: { on in Task { await model.setSuggest(on) } })) {
                labelled("Suggest me to friends of friends", "Off, only someone with your link or room code can find you.")
            }
            .toggleStyle(SwitchRowStyle())
            Button("Sign out on this device") { Task { try? await model.signOut(session: "current") } }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk).buttonStyle(.plain)
            if let note { Text(note).font(.pSmall).foregroundStyle(Palette.danger) }
        }
        .card()
        .task { await model.backup.refresh(signedIn: true, askSync: true) }
    }

    private func row<Trailing: View>(_ title: String, _ sub: String, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.pH3)
                Text(sub).font(.pSmall).foregroundStyle(Palette.muted)
            }
            Spacer()
            trailing()
        }
        .padding(.vertical, Space.s1)
    }
}

/// A switch's title and its plain-words note.
private func labelled(_ title: String, _ note: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(title).font(.pH3)
        Text(note).font(.pSmall).foregroundStyle(Palette.muted)
    }
}

/// The person's choices, as on the web. Dark mode and reduced motion follow
/// the device's own settings here.
private struct ChoicesCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "Choices")
            Toggle(isOn: $model.pulse) {
                labelled("Show me the Human Pulse", "Anonymous totals of how others answered. Off hides every number.")
            }
            .toggleStyle(SwitchRowStyle())
            Toggle(isOn: Binding(get: { model.prefs.connect }, set: { on in Task { await model.setConnect(on) } })) {
                labelled("Quiet nods & Answer Together", "Off means friends can't send you either. They won't be told.")
            }
            .toggleStyle(SwitchRowStyle())
            if model.prefs.adult == true {
                Toggle(isOn: $model.prefs.mild) {
                    labelled("Keep it mild (no intimacy questions)", "Leaves intimacy questions out of every sitting not yet started.")
                }
                .toggleStyle(SwitchRowStyle())
            }
            Text("Dark mode and reduced motion follow your device’s settings.").font(.pSmall).foregroundStyle(Palette.muted)
        }
        .card()
    }
}

/// What the server keeps for an account, and for how long (backend/worker.go).
private struct KeptCard: View {
    private static let kept: [(String, String)] = [
        ("Readings, plans, Notebook", "Encrypted · until you delete"),
        ("Written reflections", "End-to-end encrypted · only your 12 words open them"),
        ("Who’s in your circle", "Until you disconnect"),
        ("Friend answers about you", "The week only, no sender · 35 days"),
        ("That you answered a friend question", "The date only, no question or option · 35 days"),
        ("Nods & Answer Together", "Nods 35 days, Answer Together 3 days · never counted"),
        ("Human Pulse totals", "Anonymous counts only"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: "What we keep, for how long")
            ForEach(Self.kept, id: \.0) { what, how in
                VStack(alignment: .leading, spacing: 2) {
                    Text(what).font(.pH3)
                    Text(how).font(.pSmall).foregroundStyle(Palette.muted)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

private struct DeleteAccountCard: View {
    @Environment(AppModel.self) private var model
    @State private var confirm = false
    @State private var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("Delete my account").font(.pH2)
            Text("One tap wipes your account, the answers on the server, your circle and every friend answer about you. Friends only see that you’ve gone.")
                .font(.pSmall).foregroundStyle(Palette.text2)
            Button("Delete my account", role: .destructive) { confirm = true }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.danger)
            if let note { Text(note).font(.pSmall).foregroundStyle(Palette.text2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(stroke: Palette.danger.opacity(0.4))
        .confirmationDialog("Delete your account?", isPresented: $confirm, titleVisibility: .visible) {
            Button("Yes, delete it", role: .destructive) {
                Task {
                    do {
                        try await model.deleteAccount()
                    } catch {
                        note = "I couldn’t reach the server, so nothing was deleted. Try again soon."
                    }
                }
            }
            Button("Keep it", role: .cancel) {}
        } message: {
            Text("This can’t be undone.")
        }
    }
}
