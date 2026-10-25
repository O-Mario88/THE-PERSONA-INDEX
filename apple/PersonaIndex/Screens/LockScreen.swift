import SwiftUI

/// What shows while the app is locked or out of sight: nothing of the
/// person's, and one way back in.
struct LockScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase

    var body: some View {
        VStack(spacing: Space.s4) {
            Image(systemName: "lock.fill").font(.system(size: 40)).foregroundStyle(Palette.lime)
            Text("The Persona Index").font(.pH2).foregroundStyle(.white)
            if model.lock.locked {
                Button("Unlock with \(model.lock.method)") { Task { await model.lock.unlock() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(maxWidth: 320)
            }
        }
        .padding(Space.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Palette.navy)
        .task(id: phase) {
            if phase == .active, model.lock.locked { await model.lock.unlock() }
        }
    }
}
