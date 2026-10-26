import PersonaKit
import SwiftUI
import WidgetKit

// The widgets: home screen (small, medium), lock screen (rectangular,
// circular, inline) and Mac desktop. They say only what the clock knows,
// the sitting that is open and what opens next (PersonaKit `WidgetText`),
// and read nothing the person answered, kept or wrote.

struct DayEntry: TimelineEntry {
    let date: Date
    let text: WidgetText
}

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: .now, text: WidgetText.at(.now)) }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        completion(DayEntry(date: .now, text: WidgetText.at(.now)))
    }

    /// One entry now and one at each moment the words change, for the next day or two.
    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date.now
        let entries = [DayEntry(date: now, text: WidgetText.at(now))]
            + WidgetText.changes(after: now, count: 6).map { DayEntry(date: $0, text: WidgetText.at($0)) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct DayWidgetView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        DayWidgetFace(text: entry.text, family: family)
            .widgetURL(URL(string: entry.text.sunday ? "personaindex://mirrors" : "personaindex://today"))
            .containerBackground(for: .widget) { Palette.navy }
    }
}

struct DayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PersonaDay", provider: DayProvider()) { DayWidgetView(entry: $0) }
            .configurationDisplayName("Your day")
            .description("Which sitting is open, and what opens next. Never your answers.")
            #if os(iOS)
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular, .accessoryInline])
            #else
            .supportedFamilies([.systemSmall, .systemMedium])
            #endif
    }
}

@main
struct PersonaWidgets: WidgetBundle {
    var body: some Widget { DayWidget() }
}
