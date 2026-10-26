import SwiftUI

/// The card for a heavy answer: kind words and a way to people, never an
/// insight or a small step. Shared by the sitting and Insights.
struct HeavyNote: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            Text("That sounds really hard.").font(.pH2)
            Text("Thank you for saying it. If today feels heavy, reaching out to someone you trust can help.")
                .foregroundStyle(Palette.text2)
            Link("Find a helpline", destination: URL(string: "https://findahelpline.com")!)
                .font(.figtree(16, .bold))
            Text("For self-reflection, not a diagnosis.").font(.figtree(12)).foregroundStyle(Palette.muted)
        }
        .card(stroke: Palette.lineStrong)
    }
}
