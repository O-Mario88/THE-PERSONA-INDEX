import CoreImage.CIFilterBuiltins
import PersonaKit
import SwiftUI

/// Invite & Grow: a link and its QR code, for the group chosen, and how far
/// the circle is from the Outside Mirror. Once the mirror is open the card
/// shrinks to the ways in: the page is about the people, not a number.
struct InviteCard: View {
    let circle: CircleView
    @Environment(AppModel.self) private var model
    @State private var tag: Tag = .friends
    @State private var link: URL?
    @State private var showQR = false
    @State private var error: String?
    @State private var why = false

    private var unlocked: Bool { circle.active >= circle.need }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text(unlocked ? "Invite someone" : "Invite & grow your circle").font(.pH2)
            if !unlocked { progress }
            FlowRow {
                ForEach(Tag.allCases, id: \.self) { t in
                    Button(t.name) { tag = t; link = nil }.buttonStyle(ChipStyle(on: tag == t))
                }
            }
            .accessibilityLabel("They’ll be in your circle as")
            if model.name.isEmpty && circle.me.name.isEmpty {
                Text("Add a display name first, so people know who invited them.").font(.pSmall).foregroundStyle(Palette.text2)
            } else if let link {
                HStack(alignment: .top, spacing: Space.s4) {
                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text(link.absoluteString).font(.figtree(14, .semibold)).textSelection(.enabled).lineLimit(2)
                        ShareLink(item: link, message: Text("Join my circle on The Persona Index: three questions a morning, and a mirror of how friends experience you.")) {
                            Label("Share link", systemImage: "square.and.arrow.up").font(.figtree(15, .heavy))
                        }
                        Button(showQR ? "Hide QR code" : "Show QR code") { showQR.toggle() }
                            .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                    }
                    if showQR, let qr = QRCode.image(for: link.absoluteString) {
                        VStack(spacing: Space.s1) {
                            Image(decorative: qr, scale: 1).interpolation(.none).resizable().frame(width: 120, height: 120)
                            Text("Scan to invite").font(.pLabel).foregroundStyle(Palette.muted)
                        }
                        .accessibilityElement()
                        .accessibilityLabel("QR code for your invite link")
                    }
                }
            } else {
                Button("Make my invite link") { Task { await make() } }.buttonStyle(PrimaryButtonStyle())
            }
            Text("Works for 30 days. Following it connects you both; you can mute or disconnect any time.").font(.pSmall).foregroundStyle(Palette.muted)
            if let error { Text(error).font(.pSmall).foregroundStyle(Palette.danger) }
        }
        .card()
    }

    private var progress: some View {
        let toGo = max(0, circle.need - circle.active)
        return VStack(alignment: .leading, spacing: Space.s3) {
            Text("Three friends who are here this week unlock your Outside Mirror: how the people around you experience you, blended.")
                .font(.pSmall).foregroundStyle(Palette.muted)
            Text(toGo == 1 ? "One more friend unlocks your Outside Mirror" : "\(toGo) more friends unlock your Outside Mirror").font(.pH3)
            HStack(spacing: 0) {
                ForEach(0..<circle.need, id: \.self) { i in
                    Circle()
                        .fill(i < circle.active ? Palette.lime : Palette.surface)
                        .overlay(Circle().strokeBorder(i < circle.active ? Palette.lime : Palette.lineStrong, lineWidth: 2))
                        .frame(width: 26, height: 26)
                    if i < circle.need - 1 { Rectangle().fill(Palette.lineStrong).frame(height: 3) }
                }
                Text("  \(min(circle.active, circle.need)) / \(circle.need) active friends").font(.pSmall).foregroundStyle(Palette.muted).fixedSize()
            }
            .accessibilityElement()
            .accessibilityLabel("\(circle.active) of \(circle.need) friends active this week")
            Button(why ? "Hide why three" : "Why three?") { withAnimation(.easeOut(duration: 0.2)) { why.toggle() } }
                .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
            if why {
                Text("With one or two friends you could work out who said what. Three or more keeps every answer anonymous, by arithmetic, not by promise.")
                    .font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
            }
        }
    }

    private func make() async {
        do {
            link = try await model.connect.invite(tag: tag)
        } catch {
            self.error = "I couldn’t make a link just now."
        }
    }
}

enum QRCode {
    /// A crisp QR code made on the device; the link never goes to a QR service.
    static func image(for text: String) -> CGImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
        return CIContext().createCGImage(output, from: output.extent)
    }
}
