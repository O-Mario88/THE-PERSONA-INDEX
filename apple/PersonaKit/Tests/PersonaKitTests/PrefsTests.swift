import Foundation
import Testing
@testable import PersonaKit

/// Settings in the web's shape (frontend/src/prefs.ts, pi.prefs.v1), so a
/// backup carries them between the web and the app.
@Suite("Preferences")
struct PrefsTests {
    @Test("starts with the web's defaults: not asked about 18+, Human Pulse off")
    func defaults() {
        let p = PrefStore(store: MemoryStore()).prefs
        #expect(p.adult == nil)
        #expect(p.mild == false)
        #expect(p.pulse == false)
        #expect(p.connect == true)
        #expect(p.still == false)
    }

    @Test("writes the web's field names and keeps the ones this app doesn't use")
    func keepsWebFields() throws {
        let store = MemoryStore()
        store.set(#"{"adult":true,"mild":false,"wordsDays":35,"country":"UG","black":false}"#, forKey: "pi.prefs.v1")
        var p = PrefStore(store: store).prefs
        #expect(p.adult == true)
        p.pulse = true
        p.connect = false
        PrefStore(store: store).save(p)
        let saved = try JSONSerialization.jsonObject(with: Data(try #require(store.string(forKey: "pi.prefs.v1")).utf8)) as? [String: Any]
        #expect(saved?["pulse"] as? Bool == true)
        #expect(saved?["connect"] as? Bool == false)
        #expect(saved?["wordsDays"] as? Int == 35)
        #expect(saved?["country"] as? String == "UG")
        #expect(saved?["black"] as? Bool == false)
    }

    @Test("leaves out a field at its default, as the web does")
    func omitsDefaults() throws {
        let store = MemoryStore()
        var p = PrefStore(store: store).prefs
        p.still = true
        PrefStore(store: store).save(p)
        p.still = false
        p.connect = true
        PrefStore(store: store).save(p)
        let saved = try JSONSerialization.jsonObject(with: Data(try #require(store.string(forKey: "pi.prefs.v1")).utf8)) as? [String: Any]
        #expect(saved?["still"] == nil)
        #expect(saved?["connect"] == nil)
    }

    @Test("travels in the backup's main copy")
    func backedUp() {
        #expect(BackupRegistry.copy(of: "pi.prefs.v1") == .main)
    }

    @Test("asks intimate questions only after 18 or older, and never with Keep it mild")
    func intimacy() {
        #expect(Prefs().asksIntimate == false)
        #expect(Prefs(adult: false).asksIntimate == false)
        #expect(Prefs(adult: true).asksIntimate == true)
        #expect(Prefs(adult: true, mild: true).asksIntimate == false)
    }
}
