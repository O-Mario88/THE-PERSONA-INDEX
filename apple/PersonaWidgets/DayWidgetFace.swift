import PersonaKit
import SwiftUI
import WidgetKit

/// The widget's face, given the size it is drawn at. Shared with the app's
/// debug snapshot, so the faces can be checked without a home screen.
struct DayWidgetFace: View {
    let text: WidgetText
    let family: WidgetFamily

    var body: some View { content }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryInline:
            Text(text.title)
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: icon).font(.title2)
            }
            .accessibilityLabel(text.title)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(text.eyebrow.uppercased()).font(.figtree(11, .heavy)).widgetAccentable()
                Text(text.title).font(.figtree(14, .bold)).lineLimit(2)
                Text(text.line).font(.figtree(12)).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .systemMedium:
            HStack(alignment: .top, spacing: 16) {
                words
                Spacer(minLength: 0)
                // Sunday has no sittings, so no windows to light.
                if !text.sunday { dots }
            }
        default:
            words
        }
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "leaf.fill").foregroundStyle(Palette.lime)
                Text(text.eyebrow.uppercased()).font(.figtree(11, .heavy)).tracking(1.4).foregroundStyle(Palette.lime)
            }
            Spacer(minLength: 0)
            Text(text.title).font(.figtree(18, .heavy)).foregroundStyle(Palette.onNavy).lineLimit(3).minimumScaleFactor(0.8)
            Text(text.line).font(.figtree(13)).foregroundStyle(Palette.onNavy.opacity(0.7)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    /// The day's five windows, the open one lit. Clock only, never progress.
    private var dots: some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(DayWindow.open, id: \.self) { w in
                HStack(spacing: 8) {
                    Circle()
                        .fill(w == text.window ? Palette.lime : Palette.onNavy.opacity(0.25))
                        .frame(width: 9, height: 9)
                    Text(w.short).font(.figtree(12, w == text.window ? .bold : .regular)).foregroundStyle(Palette.onNavy)
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Now: \(text.window.name)")
    }

    private var icon: String {
        if text.sunday { return "circle.lefthalf.filled" }
        switch text.eyebrow {
        case "Rest": return "moon.zzz"
        case "Evening": return "sunset"
        default: return "sunrise"
        }
    }
}
