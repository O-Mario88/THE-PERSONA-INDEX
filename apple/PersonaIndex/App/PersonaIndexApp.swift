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
                #if os(macOS) && DEBUG
                .onAppear { SelfSnapshot.runIfAsked(model) }
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1280, height: 820)
        .windowResizability(.contentMinSize)
        .commands {
            CommandMenu("Go") {
                ForEach(Array(AppSection.allCases.enumerated()), id: \.element) { i, section in
                    Button(section.name) { model.section = section }
                        .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
                }
            }
        }
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
        // Our own field backgrounds, without the Mac's bordered box inside them.
        .textFieldStyle(.plain)
    }
}
