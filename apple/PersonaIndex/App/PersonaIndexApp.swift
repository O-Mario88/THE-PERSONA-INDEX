import SwiftUI
import os

@main
struct PersonaIndexApp: App {
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .task {
                    if await model.backup.resumeAfterInstall() { await model.reloadAfterRestore() } else { await model.refresh() }
                    await model.rescheduleReminders()
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
            if now == .active { Task { await model.rescheduleReminders() } }
            if now == .background {
                model.lock.lock()
                Task { await model.backup.backUpQuietly() }
            }
        }
        .onAppear(perform: Launch.firstScreen)
        // A widget opens the app where it points: personaindex://today or ://mirrors.
        .onOpenURL { url in
            if url.scheme == "personaindex", let section = AppSection(rawValue: url.host() ?? "") { model.go(to: section) }
        }
        // A tapped reminder opens where it points: today's sitting, the Mirrors or Reflect.
        .onChange(of: model.reminders.opened) { _, section in
            if let section { model.go(to: section); model.reminders.opened = nil }
        }
    }
}

/// One points-of-interest signpost when the first screen appears, so launch
/// time can be measured in Instruments and from the log. It carries nothing
/// about the person.
enum Launch {
    private static let log = OSLog(subsystem: "com.personaindex.app", category: .pointsOfInterest)
    @MainActor private static var marked = false

    @MainActor static func firstScreen() {
        guard !marked else { return }
        marked = true
        os_signpost(.event, log: log, name: "FirstScreen")
    }
}
