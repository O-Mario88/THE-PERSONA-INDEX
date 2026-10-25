import SwiftUI
import os

@main
struct PersonaIndexApp: App {
    @State private var model = AppModel.live()

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
        .onAppear(perform: Launch.firstScreen)
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
