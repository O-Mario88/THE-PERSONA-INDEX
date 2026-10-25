import PersonaKit
import SwiftUI

/// One line in What you've noticed, with where it came from.
struct Noticed: Hashable {
    let area: LifeArea
    let grow: Bool
    let text: String
    let source: String
}

/// What you've noticed: strengths and areas to grow across the eight parts
/// of a life, each naming its source. Areas to grow are openings, not verdicts.
struct NoticedSection: View {
    let noticed: [Noticed]
    let onReflect: (Noticed) -> Void
    @State private var grow = false

    private static let short: [LifeArea: String] = [.work: "Work", .school: "School", .family: "Family", .culture: "Culture", .social: "Social", .health: "Health", .money: "Money", .self: "Self"]
    private static let icon: [LifeArea: String] = [.work: "briefcase", .school: "book", .family: "heart", .culture: "globe", .social: "person.2", .health: "leaf", .money: "sterlingsign.circle", .self: "person"]

    var body: some View {
        let shown = LifeArea.allCases.map { a in (a, noticed.first { $0.area == a && $0.grow == grow }) }
        VStack(alignment: .leading, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: 2) {
                Text("What you’ve noticed").font(.pTitle)
                Text("Insights from your answers, your Circle and, if you choose, your reflections.").font(.pSmall).foregroundStyle(Palette.muted)
            }
            Picker("Show", selection: $grow) {
                Text("Strengths").tag(false)
                Text("Areas to grow").tag(true)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            if shown.allSatisfy({ $0.1 == nil }) {
                Text(grow ? "Places to grow show here as your answers build up. None yet, and that is fine."
                          : "Answer a few questions and what they say about you shows here, area by area.")
                    .font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
            } else {
                if grow { Text("Places to grow are openings, not verdicts.").font(.pSmall).foregroundStyle(Palette.muted) }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: Space.s3, alignment: .top)], spacing: Space.s3) {
                    ForEach(shown, id: \.0) { area, item in
                        VStack(alignment: .leading, spacing: Space.s2) {
                            Label(Self.short[area] ?? area.name, systemImage: Self.icon[area] ?? "circle").font(.figtree(15, .heavy)).foregroundStyle(Palette.accentInk)
                            if let item {
                                Text(item.text).font(.pSmall)
                                Text(item.source).font(.figtree(12)).foregroundStyle(Palette.muted)
                                Button("Reflect on this") { onReflect(item) }.font(.figtree(13, .bold)).foregroundStyle(Palette.accentInk)
                            } else {
                                Text("Nothing here yet.").font(.pSmall).foregroundStyle(Palette.muted)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
                        .card(padding: Space.s4, fill: item == nil ? Palette.surface2 : Palette.surface, stroke: item == nil ? .clear : Palette.line)
                    }
                }
            }
        }
    }
}

/// Beside the writing on a Mac, below it on iPhone: earlier words brought
/// back, a gentle line, the longer journey, recent reflections and one thing
/// to consider.
struct ReflectSide: View {
    let consider: Noticed?
    let onFollowUp: (ReflectionEntry) -> Void
    let onOpen: (ReflectionEntry) -> Void
    let onReflect: (Noticed) -> Void
    @Environment(AppModel.self) private var model
    @State private var revisit = false

    var body: some View {
        let all = model.reflect.reflections
        VStack(alignment: .leading, spacing: Space.s5) {
            if let memory = model.reflect.journal.memory(in: all, today: model.date) {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Label("Reflection memory", systemImage: "clock.arrow.circlepath").font(.pH2)
                    Text("\(memory.when) you wrote: “\(revisit ? memory.entry.answer : String(memory.entry.answer.prefix(120)))”")
                    if revisit { Text("\(Reflection.dayMonth(memory.entry.date)) · \(memory.entry.question)").font(.pSmall).foregroundStyle(Palette.muted) }
                    Text("Have you noticed anything changing?").foregroundStyle(Palette.muted)
                    FlowRow(spacing: Space.s4) {
                        Button("Write a follow-up") { onFollowUp(memory.entry) }.buttonStyle(OutlineButtonStyle()).frame(width: 170)
                        if !revisit { Button("Revisit") { revisit = true } }
                        Button("Put away") { model.reflect.dismissMemory(memory.entry.id) }
                    }
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk)
                }
                .card()
            }
            VStack(alignment: .leading, spacing: Space.s2) {
                Text("A gentle reminder").font(.pH2)
                Text(JournalStore.reminder(model.date)).foregroundStyle(Palette.text2)
            }
            .card(fill: Palette.accentWash, stroke: Palette.accentLine)
            if let journey = model.reflect.journal.journey(in: all, today: model.date) {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("From your journey").font(.pH2)
                    Text("\(journey.when), you wrote: “\(journey.entry.answer.prefix(120))”").font(.figtree(16, .semibold))
                    Text(journey.since > 0 ? "You’ve come back to it \(journey.since == 1 ? "once" : "\(journey.since) times") since. What feels different now?" : "What feels different now?")
                        .foregroundStyle(Palette.muted)
                    Button(journey.since > 0 ? "Explore this thread" : "Start a thread from it") { onOpen(journey.entry) }.buttonStyle(OutlineButtonStyle())
                }
                .card()
            }
            if !all.isEmpty {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Your recent reflections").font(.pH2)
                    ForEach(all.prefix(4)) { r in
                        Button { onOpen(r) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(Reflection.dayMonth(r.date)).font(.pSmall).foregroundStyle(Palette.muted)
                                    Text(r.answer).lineLimit(1).foregroundStyle(Palette.text)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Palette.muted)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, Space.s1)
                    }
                }
                .card()
            }
            if let consider {
                VStack(alignment: .leading, spacing: Space.s3) {
                    Text("Something to consider").font(.pH2)
                    Text(consider.text).foregroundStyle(Palette.text2)
                    Button("Reflect on this") { onReflect(consider) }.buttonStyle(OutlineButtonStyle())
                }
                .card(fill: Palette.surface2, stroke: .clear)
            }
        }
    }
}

/// A thread: dated entries oldest first, with a new question at the end.
struct ThreadView: View {
    let root: String
    let period: ReflectionPeriod
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let entries = model.reflect.thread(root)
        let next = Thought(id: "thread-\(root)",
                           question: entries.count > 1 ? "Looking at all of this, what feels different now?" : "Coming back to this, what would you add now?",
                           lead: "Your thread so far is above. Write on whenever it feels right.",
                           why: "From your thread, begun on \(Reflection.dayMonth(entries.first?.date ?? model.date))",
                           source: .reflections, area: entries.first?.area ?? .self)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.s4) {
                    ForEach(entries) { e in
                        VStack(alignment: .leading, spacing: Space.s1) {
                            Text(Reflection.dayMonth(e.date).uppercased()).font(.pLabel).tracking(1.4).foregroundStyle(Palette.muted)
                            if !e.free { Text(e.question).font(.pSmall).foregroundStyle(Palette.muted) }
                            Text("“\(e.answer)”").font(.figtree(17, .semibold))
                        }
                        .padding(.leading, Space.s4)
                        .overlay(alignment: .leading) { Rectangle().fill(Palette.accentLine).frame(width: 2) }
                        .accessibilityElement(children: .combine)
                    }
                    WritingCard(thought: next, period: period, free: false, thread: root)
                }
                .padding(Space.gutter)
            }
            .background(Palette.bg)
            .sheetTitle(entries.count > 1 ? "Your thread" : "Your reflection")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        #if os(macOS)
        .frame(minWidth: 620, minHeight: 640)
        #endif
    }
}
