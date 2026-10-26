import PersonaKit
import SwiftUI

/// Reflect (Edwin, 2026-10-25): a quiet space for your thoughts. Writing
/// first, with one question made on this device from the person's own
/// answers, week and earlier words, or none at all; then what they have
/// noticed, and earlier words brought back. Two columns on a Mac, one on
/// iPhone. Everything stays on the device.
struct ReflectView: View {
    @Environment(AppModel.self) private var model
    @State private var period: ReflectionPeriod = .day
    @State private var free = false
    @State private var at = 0
    @State private var chosen: (thought: Thought, thread: String?)?
    @State private var openThread: String?
    @State private var mirror: WeekMirror?
    @State private var confirmDelete = false
    @State private var bringingBack: PhraseSheet.Mode?

    private var thoughts: [Thought] {
        let answered = model.answeredToday.map { Thoughts.Answered(question: $0.0, option: $0.1, date: model.date) }
        return Thoughts.make(period: period, today: model.date, answered: answered, mirror: mirror, past: model.reflect.reflections, due: model.reflect.due(model.date))
    }

    private var noticed: [Noticed] {
        var out = Reflection.items(period: period, answered: model.answeredToday, mirror: mirror).map {
            Noticed(area: $0.area, grow: $0.kind == .grow, text: $0.text, source: $0.source.name)
        }
        if model.reflect.settings.reflectionsInNoticed {
            for area in LifeArea.allCases {
                let n = model.reflect.reflections.filter { $0.area == area }.count
                if n >= 2 { out.append(Noticed(area: area, grow: false, text: "You’ve come back to \(area.name.lowercased()) in your writing \(n) times lately.", source: "From your reflections")) }
            }
        }
        return out
    }

    var body: some View {
        let list = thoughts
        let thought = chosen?.thought ?? list[at % max(list.count, 1)]
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.s5) {
                VStack(alignment: .leading, spacing: Space.s2) {
                    Text("Reflect").font(.pHero).accessibilityAddTraits(.isHeader)
                    Text("A quiet space for your thoughts.").font(.figtree(17)).foregroundStyle(Palette.muted)
                }
                .padding(.top, Space.s2)

                if model.backup.writingWaits { bringBack }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: Space.s3) { periodPicker.frame(minWidth: 340); writeFreely }
                    VStack(alignment: .leading, spacing: Space.s3) { periodPicker; writeFreely }
                }

                #if os(macOS)
                HStack(alignment: .top, spacing: Space.s5) {
                    main(thought).frame(maxWidth: .infinity)
                    side.frame(width: 320)
                }
                #else
                VStack(alignment: .leading, spacing: Space.s5) {
                    main(thought)
                    side
                }
                #endif

                choices
            }
            .padding(Space.gutter)
            .frame(maxWidth: 1240, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .scrollDismissesKeyboard(.interactively)
        .task(id: period) { mirror = period == .day ? nil : try? await model.weekMirror() }
        .onAppear { model.reflect.load() }
        .sheet(item: Binding(get: { openThread.map(ThreadID.init) }, set: { openThread = $0?.id })) { t in
            ThreadView(root: t.id, period: period)
        }
    }

    /// On a device restored through sync the writing is still sealed: the
    /// 12 words bring it back, once.
    private var bringBack: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Label("Your reflections are sealed with your 12 words", systemImage: "lock").font(.pH3)
            Text("Everything else came back with sync. Your writing is end-to-end encrypted, so only your 12 words can open it. You’ll only need to do this once on this device.")
                .font(.pSmall).foregroundStyle(Palette.text2)
            Button("Bring them back") { bringingBack = .writing }.buttonStyle(PrimaryButtonStyle()).frame(maxWidth: 280)
        }
        .card(fill: Palette.accentWash, stroke: Palette.accentLine)
        .sheet(item: $bringingBack) { PhraseSheet(mode: $0) }
    }

    private var periodPicker: some View {
        Picker("Reflect on", selection: $period) {
            ForEach(ReflectionPeriod.allCases, id: \.self) { Text($0.name).tag($0) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .onChange(of: period) { _, _ in at = 0; chosen = nil; free = false }
    }

    private var writeFreely: some View {
        Button { free.toggle() } label: { Label("Write freely", systemImage: "square.and.pencil") }
            .buttonStyle(ChipStyle(on: free))
            .keyboardShortcut("n", modifiers: .command)
    }

    private func main(_ thought: Thought) -> some View {
        VStack(alignment: .leading, spacing: Space.s5) {
            WritingCard(thought: free ? nil : thought, period: period, free: free, thread: chosen?.thread,
                        onAnother: { if chosen != nil { chosen = nil } else { at += 1 } },
                        onDone: { chosen = nil })
                .id("\(free ? "free" : period.rawValue)-\(thought.id)")
            NoticedSection(noticed: noticed) { choose(fromNoticed($0)) }
        }
    }

    private var side: some View {
        ReflectSide(consider: noticed.first { $0.grow },
                    onFollowUp: { r in
                        choose(Thought(id: "follow-\(r.id)", question: "Have you noticed anything changing since?",
                                       lead: "You wrote: “\(r.answer.prefix(160))”", why: "From your reflection memory",
                                       source: .reflections, area: r.area, followsUp: r.id), thread: r.root)
                    },
                    onOpen: { openThread = $0.root },
                    onReflect: { choose(fromNoticed($0)) })
    }

    private var choices: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("Your choices").font(.pH2)
            Toggle(isOn: Binding(get: { model.reflect.settings.reflectionsInNoticed },
                                 set: { var s = model.reflect.settings; s.reflectionsInNoticed = $0; model.reflect.setSettings(s) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Use my reflections in What you’ve noticed").font(.pH3)
                    Text("Only counts of what you wrote about, worked out on this device. Off unless you turn it on.").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            Toggle(isOn: Binding(get: { model.reflect.settings.reflectionsInGrowth },
                                 set: { var s = model.reflect.settings; s.reflectionsInGrowth = $0; model.reflect.setSettings(s) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Show my reflections in Your Growth").font(.pH3)
                    Text("Insights sets an earlier and a more recent reflection side by side, on this device only. Off unless you turn it on.").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            Toggle(isOn: Binding(get: { model.reflect.settings.threadsInMirror },
                                 set: { var s = model.reflect.settings; s.threadsInMirror = $0; model.reflect.setSettings(s) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Let my threads add to the longer Mirrors").font(.pH3)
                    Text("When the longer Mirrors arrive, they can show which threads you kept going. Off unless you turn it on.").font(.pSmall).foregroundStyle(Palette.muted)
                }
            }
            Label(privacyLine, systemImage: "lock").font(.pSmall).foregroundStyle(Palette.muted)
            if !model.reflect.reflections.isEmpty || !model.reflect.intentions.isEmpty {
                HStack(spacing: Space.s4) {
                    ShareLink(item: ReflectionsFile(data: model.reflect.export()), preview: SharePreview("My reflections")) {
                        Label("Download my reflections", systemImage: "square.and.arrow.down")
                    }
                    Button("Delete my reflections", role: .destructive) { confirmDelete = true }
                        .foregroundStyle(Palette.danger)
                }
                .font(.figtree(14, .bold))
            }
        }
        .tint(Palette.accentInk)
        .confirmationDialog("Delete every reflection?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Yes, delete them", role: .destructive) { model.reflect.deleteAll() }
        } message: {
            Text("This deletes every reflection and everything you wanted to try from this device. It cannot be undone.")
        }
    }

    private func choose(_ t: Thought, thread: String? = nil) {
        free = false
        chosen = (t, thread)
    }

    private func fromNoticed(_ n: Noticed) -> Thought {
        Thought(id: "noticed-\(n.area.rawValue)-\(n.grow)",
                question: n.grow ? "What is one small thing you could try \(period == .day ? "tomorrow" : period == .week ? "next week" : "next month")?"
                                 : "Where did this help you \(period == .day ? "today" : period == .week ? "this week" : "this month")?",
                lead: n.text, why: n.source, source: .answers, area: n.area)
    }
}

private struct ThreadID: Identifiable { let id: String }

/// The download: a JSON file of the person's reflections and intentions.
struct ReflectionsFile: Transferable {
    let data: Data
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .json) { $0.data }
            .suggestedFileName("my-reflections.json")
    }
}
