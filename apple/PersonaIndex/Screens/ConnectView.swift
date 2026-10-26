import PersonaKit
import SwiftUI

/// Connect (Edwin, 2026-10-25): a private space for understanding,
/// encouragement and meaningful connection. Four sections and no feed: Your
/// Circle, Our Common Ground, What Helped Us and Support & Celebrate, with at
/// most two quiet "Closer together" cards above them and Invite & Grow.
/// One column on iPhone; two or three on a Mac or iPad. Signed out, a
/// 6-digit code signs in; Growing Together shows either way.
struct ConnectView: View {
    @Environment(AppModel.self) private var model

    private static let supportID = "support"

    private func scrollToSupport(_ proxy: ScrollViewProxy) {
        guard model.focusSupport, !(model.circle?.friends.isEmpty ?? true) else { return }
        model.focusSupport = false
        withAnimation { proxy.scrollTo(Self.supportID, anchor: .top) }
    }

    private let columns = [GridItem(.adaptive(minimum: 340, maximum: 560), spacing: Space.s5, alignment: .top)]

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Connect").font(.pHero).accessibilityAddTraits(.isHeader)
                    Text("A private space for understanding, encouragement and meaningful connection.")
                        .font(.figtree(17)).foregroundStyle(Palette.muted)
                }
                .padding(.top, Space.s2)

                if let circle = model.circle {
                    stats(circle)
                    CloserTogether(friends: circle.friends)
                    LazyVGrid(columns: columns, alignment: .leading, spacing: Space.s5) {
                        YourCircleCard(circle: circle)
                        if !circle.friends.isEmpty {
                            CommonGroundCard(friends: circle.friends)
                            WhatHelpedCard()
                            SupportCard().id(Self.supportID)
                        }
                        InviteCard(circle: circle)
                    }
                } else {
                    SignInCard().frame(maxWidth: 560, alignment: .leading)
                }

                GrowingSection().frame(maxWidth: 760, alignment: .leading)

                if model.circle != nil {
                    Text("A little closer. A little stronger. Together.")
                        .font(.pH2)
                        .frame(maxWidth: .infinity)
                        .padding(.top, Space.s4)
                    Text("Friends see that you’re connected and the circle tag you gave them. Never your answers, your readings, or who else is here. Anything more is only what you choose to share, with the people you choose.")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            .padding(Space.gutter)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .scrollDismissesKeyboard(.interactively)
        // Opened from Insights' suggestion: straight to Support & Celebrate once it is there.
        .onChange(of: model.circle) { _, _ in scrollToSupport(proxy) }
        .onAppear { scrollToSupport(proxy) }
        }
        .task { await model.loadConnect() }
        .refreshable { await model.loadConnect() }
    }

    private func stats(_ circle: CircleView) -> some View {
        HStack(spacing: 0) {
            Stat(number: circle.friends.count, name: "People in your circle")
            Divider().padding(.vertical, Space.s2)
            Stat(number: circle.active, name: "Active this week").padding(.leading, Space.s5)
        }
        .card(padding: Space.s4)
        .frame(maxWidth: 560, alignment: .leading)
    }
}

/// Your Circle: the three private rings, a search, and people by group with
/// only how many were active this week.
private struct YourCircleCard: View {
    let circle: CircleView
    @State private var query = ""
    @State private var open: String?
    @State private var expanded: Set<Tag> = []

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("Your circle").font(.pH2).accessibilityAddTraits(.isHeader)
            if circle.friends.isEmpty {
                Text("No one yet. Make an invite link below and send it to two or three people you see often.")
                    .font(.pSmall).foregroundStyle(Palette.text2)
            } else {
                RingsView(friends: circle.friends)
                HStack(spacing: Space.s3) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                    TextField("Search people in your circle…", text: $query)
                }
                .padding(.horizontal, Space.s4)
                .frame(minHeight: 44)
                .background(Palette.surface2, in: Capsule())
                let shown = query.isEmpty ? circle.friends : circle.friends.filter { $0.name.localizedCaseInsensitiveContains(query) }
                ForEach(Tag.allCases, id: \.self) { tag in
                    let people = shown.filter { $0.tag == tag }
                    if !people.isEmpty {
                        DisclosureGroup(isExpanded: Binding(get: { !query.isEmpty || expanded.contains(tag) }, set: { if $0 { expanded.insert(tag) } else { expanded.remove(tag) } })) {
                            ForEach(people) { friend in
                                FriendRow(friend: friend, isOpen: open == friend.id) { open = open == friend.id ? nil : friend.id }
                            }
                        } label: {
                            HStack {
                                Text("\(tag.name) (\(people.count))").font(.pH3)
                                Spacer()
                                Text("\(people.filter { $0.active && $0.muted != true }.count) active this week").font(.pSmall).foregroundStyle(Palette.muted)
                            }
                        }
                        .tint(Palette.text)
                    }
                }
                Text("Only you see your three circles.").font(.pSmall).foregroundStyle(Palette.muted)
            }
        }
        .card()
    }
}

private struct Stat: View {
    let number: Int
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(number)").font(.figtree(30, .heavy))
            Text(name).font(.pSmall).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
