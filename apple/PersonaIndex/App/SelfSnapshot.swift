#if os(macOS) && DEBUG
import AppKit

/// For checking the Mac layout without Screen Recording permission: launched
/// with `-PISnapshot <name> [-PISection <section>]`, a debug build opens the
/// section, saves its own window to its sandbox tmp folder as <name>.png and
/// quits. Never in a release build.
@MainActor
enum SelfSnapshot {
    static func runIfAsked(_ model: AppModel) {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-PISnapshot"), i + 1 < args.count else { return }
        let name = args[i + 1].replacingOccurrences(of: "/", with: "-")
        if let j = args.firstIndex(of: "-PISection"), j + 1 < args.count, let section = AppSection(rawValue: args[j + 1]) {
            model.section = section
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            guard let view = NSApp.windows.first(where: \.isVisible)?.contentView,
                  let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { NSApp.terminate(nil); return }
            view.cacheDisplay(in: view.bounds, to: rep)
            let url = FileManager.default.temporaryDirectory.appending(path: "\(name).png")
            try? rep.representation(using: .png, properties: [:])?.write(to: url)
            NSApp.terminate(nil)
        }
    }
}
#endif
