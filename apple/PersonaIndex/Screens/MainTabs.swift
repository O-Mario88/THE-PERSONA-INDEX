import SwiftUI

/// Where the person can go. A tab bar on iPhone (the first five); on a Mac,
/// the navy sidebar from Edwin's desktop mockups, with all eight.
enum AppSection: String, CaseIterable, Hashable {
    case today, reflect, connect, insights, mirrors, saved, profile, settings

    var name: String {
        switch self {
        case .today: "Today"
        case .reflect: "Reflect"
        case .connect: "Connect"
        case .insights: "Insights"
        case .mirrors: "Mirrors"
        case .saved: "Saved"
        case .profile: "You"
        case .settings: "Settings"
        }
    }

    var icon: String {
        switch self {
        case .today: "calendar"
        case .reflect: "doc.text"
        case .connect: "person.2"
        case .insights: "chart.bar"
        case .mirrors: "circle.lefthalf.filled"
        case .saved: "bookmark"
        case .profile: "person.crop.circle"
        case .settings: "gearshape"
        }
    }

    /// On iPhone, You holds the profile, settings and what is kept.
    static let phoneTabs: [AppSection] = [.today, .reflect, .connect, .insights, .profile]
}

struct MainTabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        #if os(macOS)
        DesktopShell(section: $model.section)
        #else
        TabView(selection: $model.section) {
            ForEach(AppSection.phoneTabs, id: \.self) { section in
                Tab(section == .profile ? "You" : section.name, systemImage: section == .profile ? "person" : section.icon, value: section) {
                    SectionView(section: section)
                }
            }
        }
        #endif
    }
}

/// The screen for a section, the same on iPhone and Mac.
struct SectionView: View {
    let section: AppSection

    var body: some View {
        switch section {
        case .today: TodayView()
        case .reflect: ReflectView()
        case .connect: ConnectView()
        case .insights:
            #if os(iOS)
            // On iPhone, the Mirrors, Saved and Reflect open on top of Insights, with Back.
            NavigationStack { InsightsView().toolbar(.hidden, for: .navigationBar) }
            #else
            InsightsView()
            #endif
        case .mirrors: MirrorsView()
        case .saved: LaterView(title: "Saved", lead: "Cards you kept, your plans and your notebook.", arrives: "Saved arrives in a later build.")
        case .profile:
            #if os(iOS)
            // On iPhone, Settings opens on top of You, with Back.
            NavigationStack { YouView().toolbar(.hidden, for: .navigationBar) }
            #else
            YouView()
            #endif
        case .settings: SettingsView()
        }
    }
}

#if os(macOS)
/// The Mac's desktop layout: a navy sidebar and the section beside it.
private struct DesktopShell: View {
    @Binding var section: AppSection

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: Space.s2) {
                HStack(spacing: Space.s2) {
                    Image(systemName: "leaf.fill").foregroundStyle(Palette.lime)
                    Text("THE PERSONA INDEX").font(.figtree(12, .heavy)).tracking(1.6).foregroundStyle(Palette.onNavy)
                }
                .padding(.horizontal, Space.s4)
                .padding(.vertical, Space.s5)
                ForEach([AppSection.today, .reflect, .connect, .insights, .mirrors, .saved], id: \.self) { row($0) }
                Spacer()
                ForEach([AppSection.profile, .settings], id: \.self) { row($0) }
            }
            .padding(Space.s3)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(Color(hex: 0x0E1B26))
            .navigationSplitViewColumnWidth(min: 200, ideal: 230, max: 280)
        } detail: {
            SectionView(section: section)
        }
        .frame(minWidth: 960, minHeight: 640)
    }

    private func row(_ s: AppSection) -> some View {
        let on = s == section
        return Button { section = s } label: {
            HStack(spacing: Space.s3) {
                Image(systemName: s.icon).frame(width: 22)
                Text(s.name).font(.figtree(15, on ? .heavy : .semibold))
                Spacer()
            }
            .foregroundStyle(on ? Palette.lime : Palette.onNavy2)
            .padding(.horizontal, Space.s3)
            .frame(height: 40)
            .background(on ? Color.white.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: Radius.md))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
#endif

/// A section whose screen comes in a later build: says so plainly.
struct LaterView<Extra: View>: View {
    let title: String
    let lead: String
    let arrives: String
    @ViewBuilder var extra: Extra

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Space.s5) {
                Eyebrow(text: "The Persona Index")
                Text(title).font(.pHero)
                Text(lead).font(.figtree(17)).foregroundStyle(Palette.muted)
                Text(arrives).font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
                extra
            }
            .padding(Space.gutter)
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
    }
}

extension LaterView where Extra == EmptyView {
    init(title: String, lead: String, arrives: String) {
        self.init(title: title, lead: lead, arrives: arrives) { EmptyView() }
    }
}
