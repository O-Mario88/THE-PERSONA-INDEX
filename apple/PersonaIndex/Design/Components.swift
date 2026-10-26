import PersonaKit
import SwiftUI

// The shared parts of DESIGN.md: spaced labels, white cards on a hairline,
// the lime primary button, answer cards with a ring, segments, the day's
// ring and the insight mark.

/// "THE PERSONA INDEX", "MORNING SITTING": small, bold, tracked capitals.
struct Eyebrow: View {
    let text: String
    var color: Color = Palette.text

    var body: some View {
        Text(text.uppercased())
            .font(.pLabel)
            .tracking(2.4)
            .foregroundStyle(color)
    }
}

struct CardStyle: ViewModifier {
    var padding: CGFloat = Space.s5
    var fill: Color = Palette.surface
    var stroke: Color = Palette.line

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: Radius.lg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg, style: .continuous).strokeBorder(stroke, lineWidth: 1))
    }
}

extension View {
    func card(padding: CGFloat = Space.s5, fill: Color = Palette.surface, stroke: Color = Palette.line) -> some View {
        modifier(CardStyle(padding: padding, fill: fill, stroke: stroke))
    }
}

/// The lime primary action, dark ink, full weight.
struct PrimaryButtonStyle: ButtonStyle {
    var wide = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.pButton)
            .foregroundStyle(Palette.onLime)
            .frame(maxWidth: wide ? .infinity : nil, minHeight: wide ? 56 : 44)
            .padding(.horizontal, wide ? 0 : Space.s5)
            .background(configuration.isPressed ? Palette.limeStrong : Palette.lime, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .opacity(isEnabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

/// A quiet pill: grey, turning lime when chosen.
struct ChipStyle: ButtonStyle {
    var on = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.figtree(14, on ? .bold : .semibold))
            .foregroundStyle(on ? Palette.onLime : Palette.text)
            .padding(.horizontal, Space.s4)
            .frame(minHeight: 44)
            .background(on ? Palette.lime : Palette.surface2, in: Capsule())
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// An answer: a card with an empty ring that fills once chosen.
struct OptionRow: View {
    let label: String
    var chosen = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.s4) {
                ZStack {
                    Circle().strokeBorder(chosen ? Palette.onLime : Palette.lineStrong, lineWidth: 2)
                    if chosen {
                        Circle().fill(Palette.onLime).padding(0)
                        Circle().fill(Palette.lime).padding(5)
                    }
                }
                .frame(width: 22, height: 22)
                Text(label)
                    .font(.pH3)
                    .foregroundStyle(Palette.text)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, Space.s5)
            .frame(minHeight: 64)
            .background(chosen ? Palette.accentWash : Palette.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                    .strokeBorder(chosen ? Palette.accentLine : Palette.line, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The sitting's segments: one per question, lime once reached.
struct Segments: View {
    let count: Int
    let reached: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i <= reached ? Palette.lime : Palette.surface3)
                    .frame(height: 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Question \(min(reached + 1, count)) of \(count)")
    }
}

/// A ring with its number in the middle: the day's "2 of 5".
struct DayRing: View {
    let part: Double
    let big: String
    let small: String
    var size: CGFloat = 92

    var body: some View {
        ZStack {
            Circle().stroke(Palette.surface3, lineWidth: 7)
            if part > 0 {
                Circle()
                    .trim(from: 0, to: min(1, part))
                    .stroke(Palette.lime, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            VStack(spacing: 2) {
                Text(big).font(.figtree(30, .heavy))
                Text(small.uppercased()).font(.figtree(9, .bold)).tracking(1.2).foregroundStyle(Palette.muted)
            }
            // A fixed-size graphic: its words stay inside the circle at any text
            // size, and VoiceOver reads them whole from the label below.
            .dynamicTypeSize(...DynamicTypeSize.large)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 10)
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel("\(big) \(small)")
    }
}

/// Three rising bars: the mark before an insight.
struct InsightMark: View {
    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            RoundedRectangle(cornerRadius: 1.5).fill(Palette.accentInk).frame(width: 5, height: 8)
            RoundedRectangle(cornerRadius: 1.5).fill(Palette.limeStrong).frame(width: 5, height: 14)
            RoundedRectangle(cornerRadius: 1.5).fill(Palette.limeStrong).frame(width: 5, height: 20)
        }
        .frame(width: 24, height: 20, alignment: .bottomLeading)
        .accessibilityHidden(true)
    }
}

/// The theme of a question as a pill: "🌙 Sleep and health".
struct ThemePill: View {
    let theme: String?

    var body: some View {
        let style = Themes.style(theme)
        Text("\(style.icon)  \(style.name)")
            .font(.figtree(14, .bold))
            .padding(.horizontal, Space.s3)
            .padding(.vertical, 6)
            .background(Palette.surface2, in: Capsule())
    }
}

extension View {
    /// A sheet's title, small and centred on iPhone so long titles fit.
    func sheetTitle(_ title: String) -> some View {
        navigationTitle(title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
    }
}

/// A quiet outlined action, full width.
struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.figtree(15, .heavy))
            .foregroundStyle(Palette.text)
            .frame(maxWidth: .infinity, minHeight: 44)
            .overlay(Capsule().strokeBorder(Palette.lineStrong, lineWidth: 1.5))
            .contentShape(Capsule())
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

/// The app's switch: the title and note on the left, the switch at the
/// trailing edge, lime when on. The same on iPhone and Mac (the Mac's own
/// switch ignores the tint), and still a real toggle for VoiceOver.
struct SwitchRowStyle: ToggleStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .center, spacing: Space.s4) {
            configuration.label.frame(maxWidth: .infinity, alignment: .leading)
            ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                Capsule().fill(configuration.isOn ? Palette.accentInk : Palette.surface3)
                Circle().fill(.white).padding(3).shadow(color: .black.opacity(0.15), radius: 1, y: 1)
            }
            .frame(width: 50, height: 30)
            .animation(.easeOut(duration: 0.15), value: configuration.isOn)
        }
        .contentShape(Rectangle())
        .onTapGesture { configuration.isOn.toggle() }
        .opacity(isEnabled ? 1 : 0.5)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
    }
}

/// Numbers in small cards, two to a row, the same height; one to a row at the
/// accessibility text sizes, where two would cut their words off.
struct StatTiles: View {
    struct Item: Identifiable {
        let name: String
        let value: String
        let note: String
        var id: String { name }
    }

    let items: [Item]
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let columns = typeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.flexible(), spacing: Space.s3), GridItem(.flexible())]
        LazyVGrid(columns: columns, spacing: Space.s3) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name).font(.figtree(14, .semibold)).foregroundStyle(Palette.muted)
                    Text(item.value).font(.figtree(28, .heavy))
                    Text(item.note).font(.figtree(12)).foregroundStyle(Palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 92, maxHeight: .infinity, alignment: .topLeading)
                .card(padding: Space.s4)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Chips in rows, as many to a row as fit. A chip wider than the row gets
/// the whole row and its words wrap inside it (see PersonaKit's Wrap).
struct FlowRow: Layout {
    var spacing: CGFloat = Space.s2

    private func placed(_ width: CGFloat, _ subviews: Subviews) -> Wrap.Placed {
        Wrap.layout(count: subviews.count, width: width, spacing: spacing) { i, room in
            let natural = subviews[i].sizeThatFits(.unspecified)
            guard natural.width > room else { return natural }
            return subviews[i].sizeThatFits(ProposedViewSize(width: room, height: nil))
        }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        placed(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let frames = placed(bounds.width, subviews).frames
        for (v, f) in zip(subviews, frames) {
            v.place(at: CGPoint(x: bounds.minX + f.minX, y: bounds.minY + f.minY), proposal: ProposedViewSize(f.size))
        }
    }
}
