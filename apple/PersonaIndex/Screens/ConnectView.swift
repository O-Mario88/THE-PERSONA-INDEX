import PersonaKit
import SwiftUI

/// Connect (Edwin, 2026-10-25): your circle, simplified. People and who is
/// active this week, a search, your three circles (placed by you, kept on
/// this device), people by group, and Growing Together. Signed out, a
/// 6-digit code signs in; Growing Together shows either way.
struct ConnectView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var open: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.s5) {
                Eyebrow(text: "The Persona Index").padding(.top, Space.s2)
                Text("Your circle").font(.pHero)
                Text("A more intentional circle builds a brighter you.").font(.figtree(17)).foregroundStyle(Palette.muted)

                if let circle = model.circle {
                    signedIn(circle)
                } else {
                    SignInCard()
                }

                GrowingSection()
            }
            .padding(Space.gutter)
            .frame(maxWidth: 680, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .scrollDismissesKeyboard(.interactively)
        .task { await model.loadConnect() }
        .refreshable { await model.loadConnect() }
    }

    @ViewBuilder
    private func signedIn(_ circle: CircleView) -> some View {
        HStack(spacing: 0) {
            Stat(number: circle.friends.count, name: "People in your circle")
            Divider().padding(.vertical, Space.s2)
            Stat(number: circle.active, name: "Active this week").padding(.leading, Space.s5)
        }
        .card(padding: Space.s4)

        if circle.friends.isEmpty {
            Text("No one yet. Share your invite link from the web app with two or three people you see often.")
                .font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
        } else {
            HStack(spacing: Space.s3) {
                Image(systemName: "magnifyingglass").foregroundStyle(Palette.muted)
                TextField("Search people in your circle…", text: $query)
            }
            .padding(.horizontal, Space.s4)
            .frame(minHeight: 48)
            .background(Palette.surface2, in: Capsule())

            RingsView(friends: circle.friends)
            unlock(circle)

            let shown = query.isEmpty ? circle.friends : circle.friends.filter { $0.name.localizedCaseInsensitiveContains(query) }
            ForEach(Tag.allCases, id: \.self) { tag in
                let people = shown.filter { $0.tag == tag }
                if !people.isEmpty {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        HStack {
                            Text(tag.name).font(.pH2)
                            Spacer()
                            Text("\(people.count)").foregroundStyle(Palette.muted)
                        }
                        ForEach(people) { friend in
                            FriendRow(friend: friend, isOpen: open == friend.id) { open = open == friend.id ? nil : friend.id }
                        }
                    }
                }
            }
            Text("Friends see that you’re connected, never your answers or readings. Only you see your three circles.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private func unlock(_ circle: CircleView) -> some View {
        let toGo = max(0, circle.need - circle.active)
        return HStack(alignment: .top, spacing: Space.s4) {
            Image(systemName: "person.2.fill")
                .foregroundStyle(Palette.onLime)
                .frame(width: 48, height: 48)
                .background(Palette.lime, in: Circle())
            VStack(alignment: .leading, spacing: Space.s3) {
                Text(toGo == 0 ? "Three friends are here. Your Outside Mirror fills as they answer"
                     : toGo == 1 ? "One more friend unlocks your Outside Mirror" : "\(toGo) more friends unlock your Outside Mirror")
                    .font(.pH3)
                HStack(spacing: 0) {
                    ForEach(0..<circle.need, id: \.self) { i in
                        Circle()
                            .fill(i < circle.active ? Palette.lime : Palette.surface)
                            .overlay(Circle().strokeBorder(i < circle.active ? Palette.lime : Palette.lineStrong, lineWidth: 2))
                            .frame(width: 26, height: 26)
                        if i < circle.need - 1 { Rectangle().fill(Palette.lineStrong).frame(height: 3) }
                    }
                }
                .accessibilityElement()
                .accessibilityLabel("\(circle.active) of \(circle.need) friends active this week")
            }
        }
        .card(fill: Palette.accentWash, stroke: Palette.accentLine)
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
    }
}

/// Three circles, biggest to smallest, each friend's initial in theirs.
private struct RingsView: View {
    let friends: [FriendView]
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("Your three circles").font(.pH2)
            Text("Only you see who is in which circle. Tap a name below to move someone.").font(.pSmall).foregroundStyle(Palette.muted)
            GeometryReader { geo in
                let size = min(geo.size.width, 320)
                let c = CGPoint(x: geo.size.width / 2, y: size / 2)
                ZStack {
                    ringCircle(.outer, size: size)
                    ringCircle(.middle, size: size * 0.68)
                    ringCircle(.inner, size: size * 0.36)
                    ForEach(Ring.allCases, id: \.self) { ring in
                        let people = friends.filter { model.ring(of: $0) == ring }.prefix(ring == .inner ? 5 : 10)
                        ForEach(Array(people.enumerated()), id: \.element.id) { i, f in
                            let r = radius(ring, size: size)
                            let start = ring == .inner ? -Double.pi / 2 + 0.6 : -Double.pi / 2
                            let a = start + 2 * Double.pi * Double(i) / Double(max(people.count, 1))
                            let d = ring == .inner && people.count == 1 ? 0 : r
                            Initial(name: f.name, muted: f.muted == true)
                                .position(x: c.x + d * cos(a), y: c.y + d * sin(a))
                        }
                    }
                }
            }
            .frame(height: 320)
            .accessibilityHidden(true)
            ForEach(Ring.allCases, id: \.self) { ring in
                let people = friends.filter { model.ring(of: $0) == ring }
                HStack(alignment: .firstTextBaseline, spacing: Space.s3) {
                    Circle().fill(color(ring)).overlay(Circle().strokeBorder(stroke(ring), lineWidth: 2)).frame(width: 12, height: 12)
                    Text("\(ring.name) · \(people.count)").font(.figtree(15, .heavy))
                    Text(ring.note).font(.pSmall).foregroundStyle(Palette.muted)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(ring.name): \(people.isEmpty ? "no one yet" : people.map(\.name).joined(separator: ", "))")
            }
        }
        .card()
    }

    private func radius(_ ring: Ring, size: CGFloat) -> CGFloat {
        switch ring {
        case .outer: size / 2 - 22
        case .middle: size * 0.34 - 22
        case .inner: size * 0.18 - 22
        }
    }

    private func ringCircle(_ ring: Ring, size: CGFloat) -> some View {
        Circle().fill(color(ring)).overlay(Circle().strokeBorder(stroke(ring), lineWidth: 1.5)).frame(width: size, height: size)
    }

    private func color(_ ring: Ring) -> Color {
        switch ring {
        case .outer: Palette.surface2
        case .middle: Palette.accentWash
        case .inner: Palette.lime
        }
    }

    private func stroke(_ ring: Ring) -> Color {
        switch ring {
        case .outer: Palette.lineStrong
        case .middle: Palette.accentLine
        case .inner: Palette.limeStrong
        }
    }
}

private struct Initial: View {
    let name: String
    var muted = false

    var body: some View {
        Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
            .font(.figtree(14, .heavy))
            .foregroundStyle(.white)
            .frame(width: 34, height: 34)
            .background(muted ? Color(hex: 0xA3A6A2) : tint, in: Circle())
            .overlay(Circle().strokeBorder(Palette.surface, lineWidth: 3))
    }

    private var tint: Color {
        let tints: [UInt32] = [0xB8922E, 0x4F7357, 0xBF5F3C, 0x6F6CC0, 0x8A8F8C, 0x2F5A4F, 0xA8607E]
        var h: UInt32 = 0
        for u in name.lowercased().unicodeScalars { h = h &* 31 &+ u.value }
        return Color(hex: tints[Int(h % UInt32(tints.count))])
    }
}

private struct FriendRow: View {
    let friend: FriendView
    let isOpen: Bool
    let toggle: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Button(action: toggle) {
                HStack(spacing: Space.s3) {
                    Initial(name: friend.name, muted: friend.muted == true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(friend.name).font(.pH3).foregroundStyle(Palette.text)
                        Text(friend.muted == true ? "Silently muted" : "\(friend.active ? "Active this week" : "Not seen this week") · \(model.ring(of: friend).name)")
                            .font(.pSmall).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down").foregroundStyle(Palette.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if isOpen {
                Text("CIRCLE").font(.figtree(11, .bold)).tracking(1.4).foregroundStyle(Palette.muted)
                HStack(spacing: Space.s2) {
                    ForEach(Ring.allCases, id: \.self) { ring in
                        Button(ring.name) { model.place(friend, in: ring) }
                            .buttonStyle(ChipStyle(on: model.ring(of: friend) == ring))
                    }
                }
                .padding(.leading, 46)
            }
        }
        .padding(.vertical, Space.s2)
    }
}

/// Sign in with a 6-digit code, as on the web.
private struct SignInCard: View {
    @Environment(AppModel.self) private var model
    @State private var address = ""
    @State private var code = ""
    @State private var sentTo: String?
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text(sentTo == nil ? "Sign in to start your circle." : "Enter the 6-digit code").font(.pTitle)
            if let sentTo {
                Text("We sent it to \(sentTo). It works for 10 minutes.").foregroundStyle(Palette.muted)
                TextField("123456", text: $code)
                    .font(.figtree(28, .heavy))
                    .multilineTextAlignment(.center)
                    #if os(iOS)
                    .keyboardType(.numberPad)
                    #endif
                    .textContentType(.oneTimeCode)
                    .frame(minHeight: 60)
                    .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                Button("Continue") { Task { await verify() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || code.count != 6)
                Button("Use a different address") { self.sentTo = nil; code = "" }
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
            } else {
                Text("No password: a 6-digit code to your email or phone. Your answers stay as private as they are now.")
                    .foregroundStyle(Palette.muted)
                TextField("Email, or phone with country code", text: $address)
                    .textContentType(.emailAddress)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
                    .padding(.horizontal, Space.s4)
                    .frame(minHeight: 52)
                    .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md))
                Button("Send my 6-digit code") { Task { await send() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || address.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if let error { Text(error).font(.pSmall).foregroundStyle(Palette.danger) }
        }
        .card()
    }

    private func send() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            _ = try await model.sendCode(to: address.trimmingCharacters(in: .whitespaces))
            sentTo = address.trimmingCharacters(in: .whitespaces)
        } catch let e as APIError {
            error = e.code == "sign_in_unavailable" ? "Signing in isn’t switched on here yet. Everything stays on this device."
                : e.code == "invalid_address" ? "That doesn’t look like an email, or a phone number with its country code."
                : "That didn’t go through. Try again in a moment."
        } catch {
            self.error = "You seem to be offline. Try again soon."
        }
    }

    private func verify() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            try await model.verifyCode(address: sentTo ?? address, code: code)
        } catch let e as APIError {
            error = e.code == "wrong_code" ? "That code didn’t match. Check the newest message, or send a new code." : "That didn’t go through. Try again."
        } catch {
            self.error = "You seem to be offline. Try again soon."
        }
    }
}

/// Growing Together: real anonymous totals; "you're not alone" once enough
/// people have answered. No feed, likes, comments, names or ranks.
private struct GrowingSection: View {
    @Environment(AppModel.self) private var model

    private struct ShareLine: Identifiable {
        let id: String
        let prompt: String
        let text: String
        let same: Bool
    }

    private var shares: [ShareLine] {
        guard let g = model.growing, let set = model.set else { return [] }
        let qs = set.questions + (set.evening ?? [])
        return g.questions.filter { $0.totalVotes >= g.min }.compactMap { split in
            guard let q = qs.first(where: { $0.id == split.questionId }) else { return nil }
            let mine = model.choice(for: q)
            guard let pick = split.options.first(where: { $0.optionId == mine }) ?? split.options.max(by: { $0.count < $1.count }),
                  let option = q.options.first(where: { $0.id == pick.optionId }) else { return nil }
            let same = pick.optionId == mine
            let pct = Int(pick.percent.rounded())
            return ShareLine(id: q.id, prompt: q.prompt,
                             text: same ? "\(pct)% of \(split.totalVotes) people chose “\(option.label)” too. You’re not the only one."
                                        : "\(pct)% of \(split.totalVotes) people chose “\(option.label)”.",
                             same: same)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Divider()
            Eyebrow(text: "Today", color: Palette.muted)
            Text("Growing together").font(.pTitle)
            Text("How people are showing up today, so you know you are not alone in it.").foregroundStyle(Palette.muted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.s3), GridItem(.flexible())], spacing: Space.s3) {
                tile(model.growing.map { "\($0.answers)" } ?? "–", "answers to today’s questions")
                if let c = model.circle {
                    tile("\(c.active)", "friends active this week")
                    tile("\(c.friends.filter { $0.since >= monday }.count)", "new connections this week")
                }
            }
            if shares.isEmpty {
                Text("Each question’s split shows once \(model.growing?.min ?? 20) people have answered it. It fills in through the day.")
                    .font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
            } else {
                ForEach(shares) { s in
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Eyebrow(text: s.same ? "You’re not alone" : "Today, most people", color: Palette.accentInk)
                        Text(s.prompt).font(.pSmall).foregroundStyle(Palette.text2)
                        Text(s.text).font(.pH3)
                        ShareLink(item: "\(s.text) · The Persona Index") { Text("Share this").font(.figtree(14, .bold)) }
                    }
                    .card()
                }
            }
            Text("Anonymous totals only. No one sees who chose what, and private answers are never counted here.")
                .font(.pSmall).foregroundStyle(Palette.muted)
        }
    }

    private var monday: String {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let start = cal.dateInterval(of: .weekOfYear, for: model.now)?.start ?? model.now
        return Day.localDate(start)
    }

    private func tile(_ number: String, _ name: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(number).font(.figtree(28, .heavy))
            Text(name).font(.figtree(13)).foregroundStyle(Palette.muted)
        }
        .frame(maxWidth: .infinity, minHeight: 80, alignment: .topLeading)
        .card(padding: Space.s4)
    }
}
