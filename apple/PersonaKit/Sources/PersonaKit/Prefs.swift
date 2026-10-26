import Foundation

/// The person's settings, in the web's shape (frontend/src/prefs.ts) under
/// pi.prefs.v1, so a backup carries them between the web and the app.
/// Fields this app does not use yet (the country, how long own words stay)
/// are kept as they are. A field at its default is left out, as on the web.
public struct Prefs: Sendable, Equatable {
    /// The 18+ answer: nil until asked.
    public var adult: Bool?
    public var mild = false
    /// The Human Pulse: anonymous counts of how others answered. Off unless turned on.
    public var pulse = false
    /// Quiet nods and Answer Together from friends.
    public var connect = true
    /// Reduce motion: cards appear at once.
    public var still = false

    public init(adult: Bool? = nil, mild: Bool = false, pulse: Bool = false, connect: Bool = true, still: Bool = false) {
        self.adult = adult
        self.mild = mild
        self.pulse = pulse
        self.connect = connect
        self.still = still
    }

    /// Intimate questions are asked only after "I'm 18 or older", and never with "Keep it mild".
    public var asksIntimate: Bool { adult == true && !mild }
}

public struct PrefStore: Sendable {
    public static let key = "pi.prefs.v1"
    private let store: KeyValueStore

    public init(store: KeyValueStore) { self.store = store }

    private func raw() -> [String: Any] {
        store.string(forKey: Self.key).flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String: Any] } ?? [:]
    }

    public var prefs: Prefs {
        let r = raw()
        return Prefs(adult: r["adult"] as? Bool, mild: r["mild"] as? Bool ?? false, pulse: r["pulse"] as? Bool ?? false,
                     connect: r["connect"] as? Bool ?? true, still: r["still"] as? Bool ?? false)
    }

    public func save(_ p: Prefs) {
        var r = raw()
        r["adult"] = p.adult.map { $0 as Any } ?? NSNull()
        r["mild"] = p.mild
        r["pulse"] = p.pulse ? true : nil
        r["connect"] = p.connect ? nil : false
        r["still"] = p.still ? true : nil
        guard let data = try? JSONSerialization.data(withJSONObject: r, options: [.sortedKeys]) else { return }
        store.set(String(data: data, encoding: .utf8), forKey: Self.key)
    }
}
