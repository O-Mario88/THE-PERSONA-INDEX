import PersonaKit
import SwiftUI

/// Support & Celebrate: reach out, appreciate progress and be there for
/// each other, with fixed words only. A quiet nod encourages; a fixed phrase
/// shares a win or asks for support. The sender is never told whether it
/// was seen.
struct SupportCard: View {
    @Environment(AppModel.self) private var model
    @State private var open: Open?

    enum Open: String, Identifiable {
        case encourage, celebrate, support
        var id: String { rawValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Support & Celebrate").font(.pH2)
                Text("Reach out, appreciate progress and be there for each other.").font(.pSmall).foregroundStyle(Palette.muted)
            }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: Space.s3) { tiles }
                VStack(spacing: Space.s3) { tiles }
            }
            Button("Having a hard week? Ask someone for support") { open = .support }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
        }
        .card()
        .sheet(item: $open) { which in
            switch which {
            case .encourage: NodPicker()
            case .celebrate: ReachOutPicker(kind: .celebrate)
            case .support: ReachOutPicker(kind: .support)
            }
        }
    }

    @ViewBuilder private var tiles: some View {
        tile(icon: "heart", title: "Is there someone you’d like to encourage?", line: "A small message can make a big difference.",
             button: "Reach out", fill: Palette.accentWash, ink: Palette.accentInk, buttonFill: Palette.lime) { open = .encourage }
        tile(icon: "sun.max", title: "Celebrate a win together", line: "Made progress on something that matters? Tell someone who matters.",
             button: "Share a win", fill: Palette.warmWash, ink: Palette.warmInk, buttonFill: Palette.warm) { open = .celebrate }
    }

    private func tile(icon: String, title: String, line: String, button: String, fill: Color, ink: Color, buttonFill: Color, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            Image(systemName: icon).foregroundStyle(ink).accessibilityHidden(true)
            Text(title).font(.pH3)
            Text(line).font(.pSmall).foregroundStyle(Palette.muted)
            Spacer(minLength: Space.s2)
            Button(action: action) {
                Label(button, systemImage: "arrow.right").labelStyle(TrailingIcon())
                    .font(.figtree(15, .heavy)).foregroundStyle(Palette.onLime)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(buttonFill, in: RoundedRectangle(cornerRadius: Radius.md))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.s4)
        .background(fill, in: RoundedRectangle(cornerRadius: Radius.md))
    }
}

/// One fixed phrase to one friend. Never a word typed.
struct ReachOutPicker: View {
    let kind: ReachKind
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var to: String?
    @State private var phrase: String?
    @State private var sentTo: String?
    @State private var error: String?

    private var friends: [FriendView] { model.circle?.friends.filter(\.reachable) ?? [] }

    var body: some View {
        NavigationStack {
            Form {
                if let sentTo {
                    Section { Text("Sent to \(sentTo). They are not asked to reply.") }
                } else {
                    Section("To") {
                        if friends.isEmpty { Text("Add someone to your circle first.").foregroundStyle(Palette.muted) }
                        Picker("To", selection: $to) {
                            ForEach(friends) { f in Text(f.name).tag(Optional(f.id)) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    }
                    Section {
                        Picker("Say", selection: $phrase) {
                            ForEach(model.connect.reach?.phrases(kind) ?? []) { p in Text(p.label).tag(Optional(p.id)) }
                        }
                        .pickerStyle(.inline)
                        .labelsHidden()
                    } header: { Text("Say") } footer: { Text("One of these a day to each friend. You won’t be told whether they saw it.") }
                    if let error { Section { Text(error).foregroundStyle(Palette.danger) } }
                }
            }
            .sheetTitle(kind == .support ? "Ask someone for support" : "Celebrate a win together")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(sentTo == nil ? "Not now" : "Done") { dismiss() } }
                if sentTo == nil {
                    ToolbarItem(placement: .confirmationAction) { Button("Send") { Task { await send() } }.disabled(to == nil || phrase == nil) }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 480)
        #endif
    }

    private func send() async {
        guard let to, let phrase, let friend = friends.first(where: { $0.id == to }) else { return }
        do {
            try await model.connect.reachOut(to: friend, kind: kind, phrase: phrase, date: model.date)
            sentTo = friend.name
        } catch let e as APIError where e.code == "already_reached_out" {
            error = "You’ve sent them one of these today."
        } catch {
            self.error = "That didn’t go through."
        }
    }
}

/// A quiet nod: one of the fixed cards, to one friend, once a day. No reply needed.
struct NodPicker: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var to: String?
    @State private var card: Int?
    @State private var sent = false
    @State private var error: String?

    private var friends: [FriendView] { model.circle?.friends.filter(\.reachable) ?? [] }

    var body: some View {
        let nods = model.connect.nods
        NavigationStack {
            Form {
                if sent {
                    Section { Text("Sent. It waits for them to open the app; you won’t be told when.") }
                } else {
                    Section("To") {
                        Picker("To", selection: $to) {
                            ForEach(friends) { f in
                                Text(nods?.sentTo.contains(f.id) == true ? "\(f.name) · sent today" : f.name).tag(Optional(f.id))
                            }
                        }
                        .pickerStyle(.inline).labelsHidden()
                    }
                    Section("Which nod") {
                        Picker("Which nod", selection: $card) {
                            ForEach(Array((nods?.cards ?? []).enumerated()), id: \.offset) { i, text in Text("“\(text)”").tag(Optional(i)) }
                        }
                        .pickerStyle(.inline).labelsHidden()
                    }
                    if let error { Section { Text(error).foregroundStyle(Palette.danger) } }
                }
            }
            .sheetTitle("Who would you like to encourage?")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(sent ? "Done" : "Not now") { dismiss() } }
                if !sent {
                    ToolbarItem(placement: .confirmationAction) { Button("Send the nod") { Task { await send() } }.disabled(to == nil || card == nil) }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 440, minHeight: 520)
        #endif
    }

    private func send() async {
        guard let to, let card, let friend = friends.first(where: { $0.id == to }) else { return }
        do {
            try await model.connect.nod(to: friend, card: card, date: model.date)
            sent = true
        } catch let e as APIError where e.code == "already_nodded" {
            error = "You’ve nodded to them today."
        } catch {
            self.error = "That didn’t go through."
        }
    }
}

/// Closer together: at most two quiet cards above the sections, from what a
/// friend chose to send and from someone close who has not been in this
/// week. Silence is never read as anything.
struct CloserTogether: View {
    let friends: [FriendView]
    @Environment(AppModel.self) private var model
    private static let maxCards = 2

    var body: some View {
        let cards = Array((model.connect.reach?.received ?? []).prefix(Self.maxCards))
        let quiet = cards.count < Self.maxCards ? friends.first { $0.reachable && !$0.active && model.ring(of: $0) != .outer } : nil
        if !cards.isEmpty || quiet != nil {
            VStack(alignment: .leading, spacing: Space.s2) {
                Eyebrow(text: "Closer together", color: Palette.muted)
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: Space.s3) { content(cards, quiet) }
                    VStack(spacing: Space.s3) { content(cards, quiet) }
                }
            }
        }
    }

    @ViewBuilder private func content(_ cards: [ReachOutView], _ quiet: FriendView?) -> some View {
        ForEach(cards) { r in
            HStack(alignment: .top, spacing: Space.s3) {
                Initial(name: r.from.name)
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text(r.kind == .support ? "\(r.from.name) reached out" : "\(r.from.name) has good news").font(.pH3)
                    Text("“\(r.text)”").font(.figtree(17, .semibold))
                    Text(r.kind == .support ? "A call or a message outside the app might mean a lot." : "A quiet nod, or a word next time you see them.")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                    Button("Put away") { Task { await model.connect.putAway(r) } }
                        .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(padding: Space.s4, fill: r.kind == .support ? Palette.accentWash : Palette.warmWash, stroke: r.kind == .support ? Palette.accentLine : Palette.warm.opacity(0.5))
        }
        if let quiet {
            HStack(alignment: .top, spacing: Space.s3) {
                Initial(name: quiet.name)
                VStack(alignment: .leading, spacing: Space.s1) {
                    Text("\(quiet.name) hasn’t been in this week").font(.pH3)
                    Text("If they are on your mind, a quiet nod is enough. No reply needed.").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(padding: Space.s4)
        }
    }
}
