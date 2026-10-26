import PersonaKit
import SwiftUI

// The circle's parts: the three rings, a friend's row, signing in with a
// code, and Growing Together.

/// Three circles, biggest to smallest, each friend's initial in theirs.
struct RingsView: View {
    let friends: [FriendView]
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text("Your three circles, placed by you. Tap a name below to move someone.").font(.pSmall).foregroundStyle(Palette.muted)
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

struct Initial: View {
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

struct FriendRow: View {
    let friend: FriendView
    let isOpen: Bool
    let toggle: () -> Void
    @Environment(AppModel.self) private var model
    @State private var confirmDisconnect = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Button(action: toggle) {
                HStack(spacing: Space.s3) {
                    Initial(name: friend.name, muted: friend.muted == true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(friend.name).font(.pH3).foregroundStyle(Palette.text)
                        Text(friend.muted == true ? "Silently muted · they’ll never know" : "\(friend.active ? "Active this week" : "Not seen this week") · \(model.ring(of: friend).name)")
                            .font(.pSmall).foregroundStyle(Palette.muted)
                    }
                    Spacer()
                    Image(systemName: isOpen ? "chevron.up" : "chevron.down").foregroundStyle(Palette.muted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(friend.name)
            .accessibilityHint(isOpen ? "Hides the choices for \(friend.name)" : "Shows the choices for \(friend.name)")
            if isOpen {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("CIRCLE").font(.figtree(11, .bold)).tracking(1.4).foregroundStyle(Palette.muted)
                    FlowRow {
                        ForEach(Ring.allCases, id: \.self) { ring in
                            Button(ring.name) { model.place(friend, in: ring) }
                                .buttonStyle(ChipStyle(on: model.ring(of: friend) == ring))
                        }
                    }
                    Text("HOW YOU KNOW THEM").font(.figtree(11, .bold)).tracking(1.4).foregroundStyle(Palette.muted)
                    FlowRow {
                        ForEach(Tag.allCases, id: \.self) { tag in
                            Button(tag.name) { Task { await model.connect.retag(friend, tag); await model.loadConnect() } }
                                .buttonStyle(ChipStyle(on: friend.tag == tag))
                        }
                    }
                    HStack(spacing: Space.s4) {
                        Button(friend.muted == true ? "Unmute" : "Mute") { Task { await model.connect.mute(friend, friend.muted != true); await model.loadConnect() } }
                        Button("Disconnect", role: .destructive) { confirmDisconnect = true }
                    }
                    .font(.figtree(14, .bold))
                    .foregroundStyle(Palette.accentInk)
                    Text("Muting and disconnecting are silent. \(friend.name) is never told.").font(.pSmall).foregroundStyle(Palette.muted)
                }
                .padding(.leading, 46)
            }
        }
        .padding(.vertical, Space.s2)
        .confirmationDialog("Disconnect from \(friend.name)?", isPresented: $confirmDisconnect, titleVisibility: .visible) {
            Button("Disconnect", role: .destructive) { Task { await model.connect.disconnect(friend); await model.loadConnect() } }
        } message: {
            Text("What you shared with each other goes too. They are not told.")
        }
    }
}

/// Sign in with a 6-digit code, as on the web.
struct SignInCard: View {
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
struct GrowingSection: View {
    @Environment(AppModel.self) private var model

    struct ShareLine: Identifiable {
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
            // The small-group guard folds an answer fewer than five chose: no number.
            let share = pick.few == true ? "A few people" : "\(Int(pick.percent.rounded()))% of \(split.totalVotes) people"
            return ShareLine(id: q.id, prompt: q.prompt,
                             text: same ? "\(share) chose “\(option.label)” too. You’re not the only one." : "\(share) chose “\(option.label)”.",
                             same: same)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Divider()
            Eyebrow(text: "Today", color: Palette.muted)
            Text("Growing together").font(.pTitle)
            Text("How people are showing up today, so you know you are not alone in it.").foregroundStyle(Palette.muted)
            // The day's total on its own row; the circle's two side by side, the same height.
            VStack(spacing: Space.s3) {
                tile(model.growing.map { "\($0.answers)" } ?? "–", "answers to today’s questions")
                if let c = model.circle {
                    HStack(spacing: Space.s3) {
                        tile("\(c.active)", "friends active this week")
                        tile("\(c.friends.filter { $0.since >= monday }.count)", "new connections this week")
                    }
                    .fixedSize(horizontal: false, vertical: true)
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
        .frame(maxWidth: .infinity, minHeight: 80, maxHeight: .infinity, alignment: .topLeading)
        .card(padding: Space.s4)
    }
}
