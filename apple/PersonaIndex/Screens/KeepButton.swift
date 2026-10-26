import PersonaKit
import SwiftUI

/// "Keep in Notebook": puts the card in Saved, on this device only. Kept
/// until removed; Undo takes it straight back out.
struct KeepButton: View {
    let questionId: String
    let keep: () -> Void
    @Environment(AppModel.self) private var model

    var body: some View {
        if model.saved.cards.contains(where: { $0.questionId == questionId }) {
            HStack(spacing: Space.s3) {
                Label("Kept in Saved, on this device only.", systemImage: "checkmark").font(.pSmall).foregroundStyle(Palette.accentInk)
                Button("Undo") { model.unkeep(questionId) }
                    .font(.figtree(14, .bold)).foregroundStyle(Palette.accentInk).buttonStyle(.plain)
            }
        } else {
            Button { keep() } label: { Label("Keep in Notebook", systemImage: "plus") }
                .buttonStyle(ChipStyle())
        }
    }
}
