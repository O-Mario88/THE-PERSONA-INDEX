#if os(macOS) && DEBUG
import AppKit
import PersonaKit
import SwiftUI
import WidgetKit

/// For checking the Mac layout without Screen Recording permission: launched
/// with `-PISnapshot <name> [-PISection <section>]`, a debug build opens the
/// section, saves its own window to its sandbox tmp folder as <name>.png and
/// quits. Never in a release build.
@MainActor
enum SelfSnapshot {
    static func runIfAsked(_ model: AppModel) {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-PIWidgets") { widgets(); return }
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

    /// `-PIWidgets`: draws the widget faces at five moments of a week, small
    /// and medium, on the widget's navy, to tmp/widget-<moment>-<size>.png.
    static func widgets() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        let moments: [(String, Int, Int)] = [("morning", 26, 8), ("evening", 26, 18), ("rest", 27, 2), ("sunday", 25, 10), ("night", 26, 22)]
        for (name, day, hour) in moments {
            let date = cal.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour))!
            let text = WidgetText.at(date, calendar: cal)
            for (size, family, w, h) in [("small", WidgetFamily.systemSmall, 170.0, 170.0), ("medium", .systemMedium, 364.0, 170.0)] {
                let face = DayWidgetFace(text: text, family: family)
                    .padding(16)
                    .frame(width: w, height: h)
                    .background(Palette.navy, in: RoundedRectangle(cornerRadius: 22))
                let r = ImageRenderer(content: face)
                r.scale = 2
                if let img = r.nsImage, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) {
                    try? rep.representation(using: .png, properties: [:])?.write(to: FileManager.default.temporaryDirectory.appending(path: "widget-\(name)-\(size).png"))
                }
            }
        }
        NSApp.terminate(nil)
    }
}
#endif
