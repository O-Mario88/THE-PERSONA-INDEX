import SwiftUI

/// The five tabs of the redesign. A tab bar on iPhone; a sidebar on iPad and Mac.
struct MainTabs: View {
    enum Section: Hashable { case today, reflect, connect, insights, you }

    @State private var section: Section = .today

    var body: some View {
        TabView(selection: $section) {
            Tab("Today", systemImage: "house", value: .today) {
                TodayView()
            }
            Tab("Reflect", systemImage: "doc.text", value: .reflect) {
                LaterView(title: "Reflect", lead: "Your notebook: cards you kept, good things, Sunday lines and plans.", arrives: "Your notebook arrives in the next build.")
            }
            Tab("Connect", systemImage: "person.2", value: .connect) {
                LaterView(title: "Your circle", lead: "Friends see you in ways you don’t.", arrives: "Your circle arrives with sign-in, in a later build.")
            }
            Tab("Insights", systemImage: "chart.bar", value: .insights) {
                LaterView(title: "Insights", lead: "Your Sunday Mirror: your week, what you reached for and what to try next.", arrives: "The mirror arrives in the next build.")
            }
            Tab("You", systemImage: "person", value: .you) {
                LaterView(title: "You", lead: "Your profile, choices and what this phone keeps.", arrives: "Settings arrive in a later build.")
            }
        }
        .tabViewStyle(.sidebarAdaptable)
    }
}

/// A tab whose screen comes in a later build: says so plainly.
struct LaterView: View {
    let title: String
    let lead: String
    let arrives: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.s5) {
                Eyebrow(text: "The Persona Index")
                Text(title).font(.pHero)
                Text(lead).font(.figtree(17)).foregroundStyle(Palette.muted)
                Text(arrives).font(.pSmall).foregroundStyle(Palette.text2).card(fill: Palette.surface2, stroke: .clear)
            }
            .padding(Space.gutter)
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Palette.bg)
    }
}
