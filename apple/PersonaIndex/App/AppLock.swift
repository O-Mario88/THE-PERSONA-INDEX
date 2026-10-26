import Foundation
import LocalAuthentication
import Observation
import PersonaKit

/// The app lock: Face ID, Touch ID or Optic ID, falling back to the device
/// passcode. Off until the person turns it on; when on, the app covers
/// itself whenever it leaves the screen and opens again on a match.
@MainActor
@Observable
final class AppLock {
    static let key = "pi.lock"

    private(set) var enabled: Bool
    private(set) var locked: Bool
    /// The app is out of sight (app switcher): hide what's on screen.
    var covered = false
    private let defaults: KeyValueStore

    init(defaults: KeyValueStore) {
        self.defaults = defaults
        let on = defaults.string(forKey: Self.key) == "1"
        enabled = on
        locked = on
    }

    /// What this device unlocks with, in words. Asked once: it changes only in system settings.
    let method: String = {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "your passcode"
        }
    }()

    let available = LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)

    func lock() {
        if enabled { locked = true }
    }

    /// Asks for a match; the system shows its own sheet.
    @discardableResult
    func unlock() async -> Bool {
        guard await check("Open The Persona Index") else { return false }
        locked = false
        return true
    }

    /// Turning it on asks for a match first, so no one is locked out by surprise.
    func setEnabled(_ on: Bool) async {
        guard on != enabled else { return }
        guard await check(on ? "Turn on the app lock" : "Turn off the app lock") else { return }
        enabled = on
        locked = false
        defaults.set(on ? "1" : nil, forKey: Self.key)
    }

    private func check(_ reason: String) async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Not now"
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
