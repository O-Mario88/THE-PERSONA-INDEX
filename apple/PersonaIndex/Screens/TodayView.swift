import PersonaKit
import SwiftUI

/// Today: the wordmark, the greeting with the day's ring, the open window
/// as a card with a lime button, and "Today's ritual", the five windows.
struct TodayView: View {
    @Environment(AppModel.self) private var model
    @State private var open: Sitting?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.s5) {
                Eyebrow(text: "The Persona Index")
                    .padding(.top, Space.s2)
                header
                switch model.load {
                case .loading:
                    Text("Getting today’s questions ready…").foregroundStyle(Palette.muted).padding(.vertical, Space.s8)
                case .failed(let why):
                    VStack(alignment: .leading, spacing: Space.s3) {
                        Text(why)
                        Button("Try again") { Task { await model.refresh() } }
                            .buttonStyle(PrimaryButtonStyle(wide: false))
                    }
                    .card(fill: Palette.surface2, stroke: .clear)
                case .ready(let set):
                    hero(set)
                    ritual
                }
                Label("Private to you. I never show your answers to anyone.", systemImage: "lock")
                    .font(.pSmall)
                    .foregroundStyle(Palette.muted)
            }
            .padding(Space.gutter)
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
        .refreshable { await model.refresh() }
        .onReceive(Timer.publish(every: 30, on: .main, in: .common).autoconnect()) { _ in model.tick() }
        #if os(iOS)
        .fullScreenCover(item: $open) { SittingView(sitting: $0) }
        #else
        .sheet(item: $open) { SittingView(sitting: $0).frame(minWidth: 560, minHeight: 720) }
        #endif
    }

    private var header: some View {
        HStack(alignment: .center, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s2) {
                Text("\(weekday) · \(Day.clock(minutes))".uppercased())
                    .font(.pLabel).tracking(1.6).foregroundStyle(Palette.muted)
                Text(model.window.greeting(name: model.name)).font(.figtree(36, .heavy, relativeTo: .largeTitle))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            DayRing(part: Double(model.doneCount) / 5, big: "\(model.doneCount)", small: "of 5 today")
        }
    }

    @ViewBuilder
    private func hero(_ set: DailySet) -> some View {
        let offer = heroOffer(set)
        VStack(alignment: .leading, spacing: Space.s3) {
            Eyebrow(text: offer.eyebrow, color: Palette.accentInk)
            Text(offer.title).font(.figtree(24, .heavy, relativeTo: .title2))
            Text(offer.sub).foregroundStyle(Palette.muted)
            if let sitting = offer.sitting {
                Button { open = sitting } label: {
                    Label(offer.action, systemImage: "chevron.right").labelStyle(TrailingIcon())
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, Space.s2)
            }
        }
        .card()
    }

    private var ritual: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            HStack {
                Text("Today’s ritual").font(.pH2)
                Spacer()
                Text("\(model.doneCount) of 5 complete").font(.pSmall).foregroundStyle(Palette.muted)
            }
            HStack(alignment: .top, spacing: 0) {
                ForEach(DayWindow.open, id: \.self) { w in
                    VStack(spacing: Space.s2) {
                        dot(for: w)
                        Text(w.short).font(.figtree(13, state(w) == .later ? .medium : .heavy))
                            .foregroundStyle(state(w) == .later ? Palette.muted : Palette.text)
                        Text(sub(w)).font(.figtree(11)).foregroundStyle(Palette.muted)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .background(alignment: .top) {
                Rectangle().fill(Palette.line).frame(height: 2).padding(.horizontal, 34).padding(.top, 13)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Your day")
        }
        .card()
    }

    // MARK: Helpers

    private enum State { case done, now, later }

    private func state(_ w: DayWindow) -> State {
        if (w == .morning && model.isDone(.morning)) || (w == .evening && model.isDone(.evening)) { return .done }
        return w == model.window ? .now : .later
    }

    private func sub(_ w: DayWindow) -> String {
        switch state(w) {
        case .done: "done"
        case .now: "now"
        case .later: Day.clock(w.opens)
        }
    }

    @ViewBuilder
    private func dot(for w: DayWindow) -> some View {
        switch state(w) {
        case .done:
            ZStack {
                Circle().fill(Palette.lime)
                Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(Palette.onLime)
            }
            .frame(width: 28, height: 28)
        case .now:
            Circle().fill(Palette.onLime).padding(5).background(Circle().strokeBorder(Palette.lime, lineWidth: 3)).frame(width: 28, height: 28)
        case .later:
            Circle().strokeBorder(Palette.lineStrong, lineWidth: 2).background(Circle().fill(Palette.surface)).frame(width: 28, height: 28)
        }
    }

    private var minutes: Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: model.now)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    private var weekday: String {
        model.now.formatted(.dateTime.weekday(.wide))
    }

    private struct Offer {
        let eyebrow: String, title: String, sub: String, action: String, sitting: Sitting?
    }

    private func heroOffer(_ set: DailySet) -> Offer {
        if set.review == true {
            return Offer(eyebrow: "Sunday · the day for looking back", title: "Your week is ready to look back on",
                         sub: "No new questions today. Fresh questions arrive tomorrow at 05:00.", action: "", sitting: nil)
        }
        guard let sitting = model.sitting else {
            return Offer(eyebrow: "Rest", title: "The night is yours", sub: "Your morning three open at 05:00.", action: "", sitting: nil)
        }
        let name = sitting == .morning ? "morning" : "evening"
        if model.isDone(sitting) {
            return Offer(eyebrow: "\(name.capitalized) done", title: "Your \(name) three are answered",
                         sub: sitting == .morning ? "The evening three open at 17:00." : "Sleep well. Your next three open at 05:00.",
                         action: "See your \(name)", sitting: sitting)
        }
        let started = model.questions(for: sitting).contains { model.choice(for: $0) != nil }
        return Offer(eyebrow: "Open now", title: started ? "Your \(name) three are waiting" : "Three questions are ready",
                     sub: "Two minutes, then the day is yours.", action: "Open", sitting: sitting)
    }
}

extension Sitting: @retroactive Identifiable {
    public var id: String { rawValue }
}

/// A label with its icon after the words.
struct TrailingIcon: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: Space.s2) {
            configuration.title
            configuration.icon.font(.system(size: 14, weight: .heavy))
        }
    }
}
