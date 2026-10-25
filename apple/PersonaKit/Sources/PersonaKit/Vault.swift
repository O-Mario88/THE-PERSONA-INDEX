import Foundation

// The encrypted backup on the device, behaving as the web's does
// (frontend/src/vault.ts): two sealed copies on the server, the main copy
// (everything but the writing) and the journal copy (the writing in
// Reflect), each written naming the version it replaces, merging when
// another device wrote first. The phrase and the backup's state live in the
// Keychain, on this device only.

/// Which copy a key travels in, by the web's registry (frontend/src/registry.ts).
public enum BackupRegistry {
    public enum Copy: Sendable { case main, journal }

    /// Keys this app keeps in UserDefaults that a backup carries.
    static let main = ["pi.choice.", "pi.history.v1", "pi.connection.v1", "pi.rings", "pi.name"]
    static let journal = ["pi.nb.reflection.", "pi.nb.intention.", "pi.reflect."]

    public static func copy(of key: String) -> Copy? {
        let matches = { (list: [String]) in list.contains { $0.hasSuffix(".") ? key.hasPrefix($0) : key == $0 } }
        if matches(journal) { return .journal }
        if matches(main) { return .main }
        return nil
    }
}

/// The backup's state, in the web's shape, kept in the Keychain.
public struct VaultState: Codable, Sendable, Equatable {
    public var phrase: String?
    public var sync: String?
    public var version: Int
    public var journalVersion: Int?
    public var words: Bool
    public var savedAt: Double?
    public var dirty: Bool?
}

public actor Vault {
    public enum Saved: Sendable, Equatable { case saved, off, gone, later }
    public enum Restored: Sendable, Equatable { case restored, none, damaged, mismatch }

    static let stateKey = "pi.vault.v1"
    /// Set in settings once this install holds the backup's contents. The
    /// Keychain outlives a reinstall and settings don't: without this mark a
    /// reinstalled app would back up its empty settings over the real backup.
    static let hereKey = "pi.vault.here"
    let api: APIClient
    let defaults: KeyValueStore
    let secrets: KeyValueStore

    public init(api: APIClient, defaults: KeyValueStore, secrets: KeyValueStore) {
        self.api = api
        self.defaults = defaults
        self.secrets = secrets
    }

    public var state: VaultState? {
        secrets.string(forKey: Self.stateKey).flatMap { try? JSONDecoder().decode(VaultState.self, from: Data($0.utf8)) }
    }

    func save(_ s: VaultState?) {
        defaults.set(s == nil ? nil : "1", forKey: Self.hereKey)
        secrets.set(s.flatMap { (try? JSONEncoder().encode($0)).flatMap { String(data: $0, encoding: .utf8) } }, forKey: Self.stateKey)
    }

    /// A device restored through sync whose writing is still sealed.
    public var writingWaits: Bool { state.map { $0.phrase == nil && $0.sync != nil } ?? false }

    // MARK: What a copy carries

    func snapshot(_ copy: BackupRegistry.Copy, words: Bool) -> Snapshot {
        var entries: [String: String] = [:]
        let prefixes = copy == .main ? BackupRegistry.main : BackupRegistry.journal
        for p in prefixes {
            for k in defaults.keys(withPrefix: p) where BackupRegistry.copy(of: k) == copy {
                if let v = defaults.string(forKey: k) { entries[k] = v }
            }
        }
        // What only another device knows about rides along untouched.
        for (k, v) in carried(copy) where entries[k] == nil { entries[k] = v }
        // The pass travels in the main copy, so a restored device keeps its mirror.
        if copy == .main, let pass = secrets.string(forKey: APIClient.deviceKey) { entries[APIClient.deviceKey] = pass }
        return Snapshot(made: Date().timeIntervalSince1970 * 1000, words: words, entries: entries)
    }

    /// Brings a copy in. Restoring prefers the copy's settings; merging
    /// keeps this device's. An answered question stays answered, and the
    /// newer of two notebook entries wins.
    func takeIn(_ entries: [String: String], copy: BackupRegistry.Copy, preferOther: Bool) {
        var carry = carried(copy)
        for (k, theirs) in entries {
            if k == APIClient.deviceKey {
                if preferOther { secrets.set(theirs, forKey: k) }
                continue
            }
            guard BackupRegistry.copy(of: k) != nil else {
                if !k.hasPrefix("pi.vault."), preferOther || carry[k] == nil { carry[k] = theirs }
                continue
            }
            guard let mine = defaults.string(forKey: k) else { defaults.set(theirs, forKey: k); continue }
            if k.hasPrefix("pi.nb.") || k == "pi.reflect.settings" {
                defaults.set(Self.at(theirs) > Self.at(mine) ? theirs : mine, forKey: k)
            } else if Self.indexes.contains(k) {
                defaults.set(Self.joinIds(mine, theirs), forKey: k)
            } else if k == AnswerHistory.key {
                defaults.set(Self.mergeHistory(mine, theirs), forKey: k)
            } else if k.hasPrefix("pi.choice.") {
                continue // answered here stays as answered here
            } else if preferOther {
                defaults.set(theirs, forKey: k)
            }
        }
        setCarried(carry, copy)
    }

    /// Keys a backup holds that this app doesn't use yet (the web's saved
    /// cards, its own notes), kept so a backup from here never drops them.
    private func carryKey(_ copy: BackupRegistry.Copy) -> String { copy == .main ? "pi.vault.carry.main" : "pi.vault.carry.journal" }

    func carried(_ copy: BackupRegistry.Copy) -> [String: String] {
        defaults.string(forKey: carryKey(copy)).flatMap { try? JSONDecoder().decode([String: String].self, from: Data($0.utf8)) } ?? [:]
    }

    private func setCarried(_ carry: [String: String], _ copy: BackupRegistry.Copy) {
        let json = carry.isEmpty ? nil : (try? JSONEncoder().encode(carry)).flatMap { String(data: $0, encoding: .utf8) }
        defaults.set(json, forKey: carryKey(copy))
    }

    /// Lists of ids, joined so nothing written on either device goes missing.
    static let indexes: Set<String> = ["pi.reflect.index", "pi.reflect.intentions"]

    static func joinIds(_ a: String, _ b: String) -> String {
        Set((a + "," + b).split(separator: ",").map(String.init)).sorted().joined(separator: ",")
    }

    static func at(_ json: String) -> Double {
        ((try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any])?["at"] as? Double ?? 0
    }

    static func mergeHistory(_ a: String, _ b: String) -> String {
        func parse(_ s: String) -> [String: Any] { ((try? JSONSerialization.jsonObject(with: Data(s.utf8))) as? [String: Any]) ?? [:] }
        let x = parse(a), y = parse(b)
        var answers: [String: [String: Any]] = [:]
        for e in (y["answers"] as? [[String: Any]] ?? []) + (x["answers"] as? [[String: Any]] ?? []) {
            if let q = e["questionId"] as? String { answers[q] = e }
        }
        let skips = (x["skips"] as? [[String: Any]] ?? []) + (y["skips"] as? [[String: Any]] ?? [])
        let merged: [String: Any] = ["answers": answers.values.sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") }, "skips": skips]
        return (try? JSONSerialization.data(withJSONObject: merged)).flatMap { String(data: $0, encoding: .utf8) } ?? a
    }

    // MARK: The server

    private func read(_ keys: CopyKeys) async throws -> (version: Int, snapshot: Snapshot)? {
        let r = try await api.raw("/api/vault", method: "GET", headers: ["Authorization": "Vault \(keys.vaultKey)"])
        if r.status == 404 { return nil }
        guard r.status == 200 else { throw APIError(status: r.status, code: "unavailable") }
        return (Self.version(r.etag), try Sealer.open(r.data, with: keys))
    }

    static func version(_ etag: String?) -> Int { Int(etag?.replacingOccurrences(of: "\"", with: "") ?? "") ?? 0 }

    /// Puts one copy, taking in another device's first when it wrote first.
    private func write(_ copy: BackupRegistry.Copy, keys: CopyKeys, version start: Int, words: Bool) async throws -> Int? {
        var version = start
        for _ in 0..<4 {
            let sealed = try Sealer.seal(snapshot(copy, words: words), with: keys)
            let match = version == 0 ? ["If-None-Match": "*"] : ["If-Match": "\"\(version)\""]
            let r = try await api.raw("/api/vault", method: "PUT", headers: ["Authorization": "Vault \(keys.vaultKey)"].merging(match) { $1 }, body: sealed)
            switch r.status {
            case 200, 201: return Self.version(r.etag)
            case 404: return nil
            case 412:
                let theirs = try await read(keys)
                if let theirs { takeIn(theirs.snapshot.entries, copy: copy, preferOther: false) }
                version = theirs?.version ?? 0
            default: throw APIError(status: r.status, code: "unavailable")
            }
        }
        throw APIError(status: 412, code: "version_conflict")
    }

    // MARK: Backing up, turning on and off, restoring

    @discardableResult
    public func backUp() async -> Saved {
        guard var st = state else { return .off }
        guard defaults.string(forKey: Self.hereKey) != nil else { return .later }
        do {
            let main = st.phrase.map { VaultKeys(phrase: $0).main } ?? st.sync.flatMap(VaultKeys.main(fromSync:))
            guard let main else { return .off }
            guard let v = try await write(.main, keys: main, version: st.version, words: st.words) else { save(nil); return .gone }
            st.version = v
            if let phrase = st.phrase, (st.journalVersion ?? 0) > 0 || !snapshot(.journal, words: st.words).entries.isEmpty {
                st.journalVersion = try await write(.journal, keys: VaultKeys(phrase: phrase).journal, version: st.journalVersion ?? 0, words: st.words) ?? 0
            }
            st.savedAt = Date().timeIntervalSince1970 * 1000
            st.dirty = nil
            save(st)
            return .saved
        } catch {
            st.dirty = true
            save(st)
            return .later
        }
    }

    /// Starts backing up under a phrase the person has written down.
    @discardableResult
    public func turnOn(phrase: String, words: Bool = false) async -> Saved {
        save(VaultState(phrase: Phrase.normalise(phrase), sync: state?.sync, version: 0, journalVersion: 0, words: words, dirty: true))
        return await backUp()
    }

    /// After a reinstall: the Keychain still holds the backup's keys, so
    /// everything comes back before anything is written. Nil when there is
    /// nothing to do, or the server can't be reached (it tries again next launch).
    public func resumeAfterInstall() async -> Restored? {
        guard let st = state, defaults.string(forKey: Self.hereKey) == nil else { return nil }
        let r: Restored?
        if let phrase = st.phrase {
            r = try? await restore(phrase: phrase)
        } else if let sync = st.sync {
            r = try? await restoreFromSync(sync)
        } else {
            r = nil
        }
        if r == Restored.none { save(nil) } // turned off elsewhere: nothing left to keep
        return r
    }

    /// Deletes both copies from the server, then forgets the phrase.
    public func turnOff() async throws {
        guard let st = state else { return }
        if let phrase = st.phrase {
            let k = VaultKeys(phrase: phrase)
            _ = try await api.raw("/api/vault", method: "DELETE", headers: ["Authorization": "Vault \(k.main.vaultKey)"])
            _ = try await api.raw("/api/vault", method: "DELETE", headers: ["Authorization": "Vault \(k.journal.vaultKey)"])
        } else if let main = st.sync.flatMap(VaultKeys.main(fromSync:)) {
            _ = try await api.raw("/api/vault", method: "DELETE", headers: ["Authorization": "Vault \(main.vaultKey)"])
        }
        save(nil)
    }

    /// Everything a backup holds, the writing included, from the 12 words.
    public func restore(phrase: String) async throws -> Restored {
        let keys = VaultKeys(phrase: phrase)
        let found: (version: Int, snapshot: Snapshot)?
        do { found = try await read(keys.main) } catch let e as APIError { throw e } catch { return .damaged }
        guard let found else { return .none }
        takeIn(found.snapshot.entries, copy: .main, preferOther: true)
        let journal = try? await read(keys.journal)
        if let journal { takeIn(journal.snapshot.entries, copy: .journal, preferOther: true) }
        save(VaultState(phrase: Phrase.normalise(phrase), sync: state?.sync, version: found.version, journalVersion: journal?.version ?? 0,
                        words: found.snapshot.words, savedAt: Date().timeIntervalSince1970 * 1000))
        return .restored
    }

    /// A signed-in device restoring with easy sync's keys: all but the writing.
    public func restoreFromSync(_ secret: String) async throws -> Restored {
        guard let main = VaultKeys.main(fromSync: secret) else { return .damaged }
        guard let found = try await read(main) else { return .none }
        takeIn(found.snapshot.entries, copy: .main, preferOther: true)
        save(VaultState(sync: secret, version: found.version, words: found.snapshot.words, savedAt: Date().timeIntervalSince1970 * 1000))
        return .restored
    }

    /// The 12 words on a device restored through sync: they must be this
    /// account's, then the writing comes back.
    public func restoreWriting(phrase: String) async throws -> Restored {
        if let sync = state?.sync, VaultKeys(phrase: phrase).syncSecret != sync { return .mismatch }
        return try await restore(phrase: phrase)
    }
}

// MARK: Easy sync

// Sync for a signed-in account, as the web's sync.ts: the account keeps the
// keys to the main copy, sealed with a server key, so a phone that signs in
// restores without the 12 words. Never the journal copy's keys: the writing
// in Reflect needs the 12 words on every device.

extension APIClient {
    /// The account's sync secret, or nil when sync is off.
    func getSync() async throws -> String? {
        struct Body: Decodable { let phrase: String }
        do {
            let b: Body = try await request("/api/account/sync", headers: accountHeader)
            return b.phrase
        } catch let e as APIError where e.status == 404 {
            return nil
        }
    }

    func putSync(_ secret: String) async throws {
        try await send("/api/account/sync", method: "PUT", headers: accountHeader, body: try JSONEncoder().encode(["phrase": secret]))
    }

    func deleteSync() async throws {
        try await send("/api/account/sync", method: "DELETE", headers: accountHeader)
    }
}

extension Vault {
    /// Turns sync on, starting a backup first if there is none. Returns the
    /// phrase when a new one was made, for the person to write down.
    @discardableResult
    public func syncOn() async throws -> String? {
        var made: String?
        if state?.phrase == nil {
            let phrase = Phrase.new()
            _ = await turnOn(phrase: phrase)
            made = phrase
        }
        guard let phrase = state?.phrase else { return made }
        try await api.putSync(VaultKeys(phrase: phrase).syncSecret)
        return made
    }

    /// Whether the account keeps sync keys now.
    public func syncIsOn() async throws -> Bool {
        try await api.getSync() != nil
    }

    public func syncOff() async throws {
        try await api.deleteSync()
    }

    /// After signing in: a phone with no backup of its own restores the
    /// account's (all but the writing) and keeps the pass it just signed in
    /// with. An account still holding the 12 words from before is restored
    /// with them, then given the keys instead.
    public func pullSync(_ sync: Bool) async throws -> Restored {
        guard sync, state == nil else {
            try await upgradeSync(sync)
            return .none
        }
        guard let secret = try await api.getSync() else { return .none }
        let pass = secrets.string(forKey: APIClient.deviceKey)
        let legacy = !VaultKeys.isSyncSecret(secret)
        let r = legacy ? try await restore(phrase: secret) : try await restoreFromSync(secret)
        if legacy, r == .restored { try await api.putSync(VaultKeys(phrase: secret).syncSecret) }
        if let pass { secrets.set(pass, forKey: APIClient.deviceKey) }
        return r == .restored ? .restored : .none
    }

    /// Swaps the 12 words an older account kept for the main copy's keys,
    /// once, from a phone that has the words.
    public func upgradeSync(_ sync: Bool) async throws {
        guard sync, let phrase = state?.phrase else { return }
        if let secret = try await api.getSync(), !VaultKeys.isSyncSecret(secret) {
            try await api.putSync(VaultKeys(phrase: phrase).syncSecret)
        }
    }
}
