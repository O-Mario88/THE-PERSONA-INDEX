import SwiftUI

/// The one-time welcome, as on the web: what the app is, in three lines.
struct WelcomeView: View {
    let onBegin: (String) -> Void
    @State private var name = ""

    private let points: [(icon: String, title: String, line: String)] = [
        ("chart.bar", "See your patterns", "What you reached for and how you are changing, week by week."),
        ("person.2", "Hear how others see you", "Three friends, blended, so no single answer can be traced."),
        ("heart", "One small step at a time", "No streaks, no scores. A missed day undoes nothing."),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s8) {
                Eyebrow(text: "The Persona Index").padding(.top, Space.s4)
                VStack(alignment: .leading, spacing: Space.s4) {
                    Text("A calmer you starts with reflection.")
                        .font(.figtree(44, .heavy, relativeTo: .largeTitle))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Three questions in the morning, three in the evening, and a mirror of your own answers on Sunday.")
                        .font(.figtree(19)).foregroundStyle(Palette.muted)
                }
                VStack(alignment: .leading, spacing: Space.s5) {
                    ForEach(points, id: \.title) { p in
                        HStack(alignment: .top, spacing: Space.s4) {
                            Image(systemName: p.icon)
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(Palette.accentInk)
                                .frame(width: 64, height: 64)
                                .background(Palette.accentWash, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.title).font(.pH3)
                                Text(p.line).foregroundStyle(Palette.muted)
                            }
                        }
                    }
                }
                VStack(spacing: Space.s3) {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text("What should I call you? (optional)").font(.figtree(14, .bold))
                        TextField("Your first name", text: $name)
                            .font(.pBody)
                            .textContentType(.givenName)
                            .padding(.horizontal, Space.s4)
                            .frame(minHeight: 52)
                            .background(Palette.surface2, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    }
                    Button("Begin your first reflection") { onBegin(name) }.buttonStyle(PrimaryButtonStyle())
                    Label("Private to you. Your name stays on this device.", systemImage: "lock")
                        .font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            .padding(Space.gutter)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
    }
}
