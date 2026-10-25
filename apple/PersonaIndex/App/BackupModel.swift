import Foundation
import Observation
import PersonaKit

/// The encrypted backup for the screens: its state, and the steps the
/// person takes. The engine is PersonaKit's Vault; this keeps the words to
/// show and backs up quietly when the app goes to the background.
@MainActor
@Observable
final class BackupModel {
    private(set) var state: VaultState?
    private(set) var writingWaits = false
    private(set) var busy = false
    private(set) var signedIn = false
    private(set) var sync = false

    private let vault: Vault

    init(vault: Vault) {
        self.vault = vault
    }

    var isOn: Bool { state != nil }

    func refresh(signedIn: Bool) async {
        state = await vault.state
        writingWaits = await vault.writingWaits
        self.signedIn = signedIn
        if !signedIn { sync = false }
    }

    /// Backs up when something changed, without asking. Failing waits for next time.
    func backUpQuietly() async {
        guard state != nil, !busy else { return }
        _ = await vault.backUp()
        state = await vault.state
    }

    func turnOn(_ phrase: String) async -> Vault.Saved {
        await run { await self.vault.turnOn(phrase: phrase) } ?? .later
    }

    func restore(_ phrase: String) async -> Vault.Restored {
        await run { (try? await self.vault.restore(phrase: phrase)) ?? .damaged } ?? .damaged
    }

    func restoreWriting(_ phrase: String) async -> Vault.Restored {
        await run { (try? await self.vault.restoreWriting(phrase: phrase)) ?? .damaged } ?? .damaged
    }

    func turnOff() async -> Bool {
        await run { (try? await self.vault.turnOff()) != nil } ?? false
    }

    /// Returns the new phrase when turning sync on had to start a backup.
    func setSync(_ on: Bool) async -> (ok: Bool, phrase: String?) {
        await run {
            do {
                if on {
                    let made = try await self.vault.syncOn()
                    self.sync = true
                    return (true, made)
                }
                try await self.vault.syncOff()
                self.sync = false
                return (true, nil)
            } catch {
                return (false, nil)
            }
        } ?? (false, nil)
    }

    /// After signing in: brings the account's backup to a phone that has none.
    func afterSignIn(sync: Bool) async -> Vault.Restored {
        self.sync = sync
        let r = await run { (try? await self.vault.pullSync(sync)) ?? .none } ?? .none
        await refresh(signedIn: true)
        return r
    }

    private func run<T>(_ step: @escaping () async -> T) async -> T? {
        guard !busy else { return nil }
        busy = true
        defer { busy = false }
        let out = await step()
        state = await vault.state
        writingWaits = await vault.writingWaits
        return out
    }
}
