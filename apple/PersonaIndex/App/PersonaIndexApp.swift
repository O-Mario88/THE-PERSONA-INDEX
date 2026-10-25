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
                .task {
                    if await model.backup.resumeAfterInstall() { await model.reloadAfterRestore() } else { await model.refresh() }
                }
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

/// The welcome once, then the five tabs. With the lock on, the app covers
/// itself whenever it leaves the screen, and backs up quietly as it goes.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase

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
        .overlay {
            if model.lock.locked || (model.lock.enabled && model.lock.covered) { LockScreen() }
        }
        .onChange(of: phase) { _, now in
            model.lock.covered = now != .active
            if now == .background {
                model.lock.lock()
                Task { await model.backup.backUpQuietly() }
            }
        }
    }
}
