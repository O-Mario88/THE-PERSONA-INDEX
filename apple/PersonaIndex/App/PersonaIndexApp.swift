import SwiftUI

@main
struct PersonaIndexApp: App {
    @State private var model = AppModel.live()

    init() {
        Figtree.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task { await model.refresh() }
        }
        #if os(macOS)
        .defaultSize(width: 1100, height: 760)
        #endif
    }
}

/// The welcome once, then the five tabs.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.welcomed {
                MainTabs()
            } else {
                WelcomeView { name in
                    model.name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(30))
                    model.welcomed = true
                }
            }
        }
        .font(.pBody)
        .foregroundStyle(Palette.text)
        .tint(Palette.accentInk)
    }
}
