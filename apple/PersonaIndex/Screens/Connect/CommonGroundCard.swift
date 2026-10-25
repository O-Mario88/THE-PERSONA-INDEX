import PersonaKit
import SwiftUI

/// Our Common Ground, the signature of the new Connect: the broad things two
/// friends both value, only when each has opted in to the other. The person
/// picks their own tags, starting from what this device suggests; nothing is
/// sent until they save, and new tags can be added once a week.
struct CommonGroundCard: View {
    let friends: [FriendView]
    @Environment(AppModel.self) private var model
    @State private var at = 0
    @State private var choosingTags = false
    @State private var choosingPeople = false

    var body: some View {
        let common = model.connect.common
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack {
                Text("Our Common Ground").font(.pH2)
                Spacer()
                if let pairs = common?.pairs, pairs.count > 1 {
                    Button { at += 1 } label: { Image(systemName: "chevron.right") }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Next friend")
                }
            }
            if let common {
                if let pair = common.pairs.isEmpty ? nil : common.pairs[at % common.pairs.count] {
                    PairView(pair: pair, label: { id in common.tags.first { $0.id == id }?.label ?? id })
                } else {
                    Text(emptyLine(common)).foregroundStyle(Palette.muted)
                }
                HStack(spacing: Space.s4) {
                    Button(common.mine.isEmpty ? "Choose what matters to you" : "What matters to you") { choosingTags = true }
                    if !common.mine.isEmpty, !friends.filter(\.reachable).isEmpty {
                        Button("Who you find it with") { choosingPeople = true }
                    }
                }
                .font(.figtree(14, .bold))
                .foregroundStyle(Palette.accentInk)
            } else {
                Text("Loading your common ground").foregroundStyle(Palette.muted).redacted(reason: .placeholder)
            }
        }
        .card()
        .sheet(isPresented: $choosingTags) {
            if let common { TagChooser(common: common, suggested: common.mine.isEmpty ? model.connect.suggestedTags : []) }
        }
        .sheet(isPresented: $choosingPeople) {
            if let common { PeopleChooser(common: common, friends: friends.filter(\.reachable)) }
        }
    }

    private func emptyLine(_ c: CommonView) -> String {
        if c.mine.isEmpty { return "Pick a few things that matter to you. A friend sees what you share only if you both choose to look." }
        if c.optedIn.isEmpty { return "Choose who to find common ground with. Nothing shows until they choose you too." }
        return "Nothing in common shows yet. It appears when a friend you chose has chosen you too."
    }
}

private struct PairView: View {
    let pair: CommonPair
    let label: (String) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack(spacing: Space.s3) {
                HStack(spacing: -10) {
                    Initial(name: "You")
                    Initial(name: pair.friend.name)
                }
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 0) {
                    Text("You & \(pair.friend.name)").font(.pH3)
                    Text("A shared perspective").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            Text(pair.headline).font(.figtree(24, .heavy, relativeTo: .title2))
            FlowRow {
                ForEach(pair.shared, id: \.self) { id in
                    Text(label(id))
                        .font(.figtree(14, .bold))
                        .foregroundStyle(Palette.accentInk)
                        .padding(.horizontal, Space.s4)
                        .frame(minHeight: 36)
                        .background(Palette.accentWash, in: Capsule())
                }
            }
            HStack(alignment: .top, spacing: Space.s3) {
                Image(systemName: "leaf").foregroundStyle(Palette.accentInk)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Something to explore together").font(.pH3)
                    Text("“\(pair.explore)”").foregroundStyle(Palette.text2)
                }
            }
            .card(padding: Space.s4, fill: Palette.accentWash, stroke: Palette.accentLine)
        }
    }
}

private struct TagChooser: View {
    let common: CommonView
    let suggested: [String]
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var picked: [String] = []
    @State private var error: String?
    private let maxTags = 6

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.s4) {
                    Text("Up to six. Only the ones you share with a friend are ever shown to them.").foregroundStyle(Palette.muted)
                    if !suggested.isEmpty {
                        Text("Suggested from the themes you answer most, worked out on this device. Untick any you’d rather keep to yourself; nothing is shared until you save.")
                            .font(.pSmall).foregroundStyle(Palette.text2)
                            .card(fill: Palette.surface2, stroke: .clear)
                    }
                    FlowRow {
                        ForEach(common.tags) { tag in
                            Button(tag.label) { toggle(tag.id) }
                                .buttonStyle(ChipStyle(on: picked.contains(tag.id)))
                                .accessibilityAddTraits(picked.contains(tag.id) ? .isSelected : [])
                        }
                    }
                    if let next = common.nextChange {
                        Text("New ones can be added from \(next).").font(.pSmall).foregroundStyle(Palette.muted)
                    }
                    if let error { Text(error).font(.pSmall).foregroundStyle(Palette.danger) }
                }
                .padding(Space.gutter)
            }
            .sheetTitle("What matters to you")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { Task { await save() } } }
            }
        }
        .onAppear { picked = common.mine.isEmpty ? suggested : common.mine }
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 420)
        #endif
    }

    private func toggle(_ id: String) {
        if let i = picked.firstIndex(of: id) { picked.remove(at: i) } else if picked.count < maxTags { picked.append(id) }
    }

    private func save() async {
        do {
            try await model.connect.saveTags(picked)
            dismiss()
        } catch let e as APIError where e.code == "tags_changed_recently" {
            error = "You can add new ones once a week. Removing one is always fine."
        } catch {
            self.error = "That didn’t save. Try again in a moment."
        }
    }
}

private struct PeopleChooser: View {
    let common: CommonView
    let friends: [FriendView]
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(friends) { f in
                        Toggle(isOn: Binding(
                            get: { model.connect.common?.optedIn.contains(f.id) ?? common.optedIn.contains(f.id) },
                            set: { on in Task { try? await model.connect.setCommon(f, on: on) } }
                        )) {
                            HStack(spacing: Space.s3) {
                                Initial(name: f.name)
                                Text(f.name)
                            }
                        }
                        .accessibilityLabel("Find common ground with \(f.name)")
                    }
                } footer: {
                    Text("You see what you share with someone only when you have both chosen each other. Turning it off is silent.")
                }
            }
            .sheetTitle("Find common ground with")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        #if os(macOS)
        .frame(minWidth: 420, minHeight: 420)
        #endif
    }
}
