import Foundation
import Testing
@testable import PersonaKit

/// A stand-in for /api/vault: sealed bytes per vault key, with versions,
/// refusing a write that names the wrong one, as the Go server does.
final class VaultServer: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var copies: [String: (version: Int, data: Data)] = [:]
    nonisolated(unsafe) static var sync: String?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let n = stream.read(&buffer, maxLength: buffer.count)
                if n <= 0 { break }
                body.append(buffer, count: n)
            }
            stream.close()
        }
        if request.url?.path == "/api/account/sync" {
            let (status, data) = Self.handleSync(request.httpMethod ?? "GET", body: body)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let key = request.value(forHTTPHeaderField: "Authorization")?.replacingOccurrences(of: "Vault ", with: "") ?? ""
        let (status, data, version) = Self.handle(request.httpMethod ?? "GET", key: key, body: body,
                                                  ifMatch: request.value(forHTTPHeaderField: "If-Match"),
                                                  ifNone: request.value(forHTTPHeaderField: "If-None-Match"))
        var headers = ["Content-Type": "application/octet-stream"]
        if let version { headers["ETag"] = "\"\(version)\"" }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    static func handleSync(_ method: String, body: Data) -> (Int, Data) {
        switch method {
        case "PUT":
            sync = (try? JSONDecoder().decode([String: String].self, from: body))?["phrase"]
            return (204, Data())
        case "DELETE":
            sync = nil
            return (204, Data())
        default:
            guard let sync else { return (404, Data(#"{"error":"no_sync"}"#.utf8)) }
            return (200, try! JSONEncoder().encode(["phrase": sync]))
        }
    }

    static func handle(_ method: String, key: String, body: Data, ifMatch: String?, ifNone: String?) -> (Int, Data, Int?) {
        let have = copies[key]
        switch method {
        case "GET":
            guard let have else { return (404, Data(), nil) }
            return (200, have.data, have.version)
        case "PUT":
            if ifNone == "*", have != nil { return (412, Data(), nil) }
            if let ifMatch, ifMatch != "\"\(have?.version ?? -1)\"" { return (412, Data(), nil) }
            let v = (have?.version ?? 0) + 1
            copies[key] = (v, body)
            return (have == nil ? 201 : 200, Data(), v)
        case "DELETE":
            copies[key] = nil
            return (204, Data(), nil)
        default:
            return (405, Data(), nil)
        }
    }
}

@Suite("The encrypted backup", .serialized)
struct VaultTests {
    static let phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow"

    /// One device: its own settings, its own Keychain, the shared server.
    struct Device {
        let defaults = MemoryStore()
        let secrets = MemoryStore()
        let vault: Vault

        init() {
            let config = URLSessionConfiguration.ephemeral
            config.protocolClasses = [VaultServer.self]
            let api = APIClient(base: URL(string: "http://test.local")!, session: URLSession(configuration: config), store: secrets)
            vault = Vault(api: api, defaults: defaults, secrets: secrets)
        }
    }

    init() {
        VaultServer.copies = [:]
        VaultServer.sync = nil
    }

    static let reflection = #"{"id":"r1","answer":"I was patient today","at":1000}"#

    func filled() -> Device {
        let d = Device()
        d.defaults.set("o2", forKey: "pi.choice.q1")
        d.defaults.set(#"{"answers":[],"skips":[]}"#, forKey: AnswerHistory.key)
        d.defaults.set(Self.reflection, forKey: "pi.nb.reflection.r1")
        d.defaults.set("1", forKey: "pi.welcomed")
        d.secrets.set("pass-123", forKey: APIClient.deviceKey)
        return d
    }

    @Test("Every key travels in the copy the web's registry puts it in")
    func registry() {
        #expect(BackupRegistry.copy(of: "pi.choice.q1") == .main)
        #expect(BackupRegistry.copy(of: "pi.history.v1") == .main)
        #expect(BackupRegistry.copy(of: "pi.nb.reflection.r1") == .journal)
        #expect(BackupRegistry.copy(of: "pi.nb.intention.i1") == .journal)
        #expect(BackupRegistry.copy(of: "pi.reflect.settings") == .journal)
        #expect(BackupRegistry.copy(of: "pi.welcomed") == nil)
        #expect(BackupRegistry.copy(of: "pi.pending.q1") == nil)
        #expect(BackupRegistry.copy(of: "pi.vault.v1") == nil)
        #expect(BackupRegistry.copy(of: "pi.history.v10") == nil)
    }

    @Test("Turning on writes two copies, and no writing goes in the main one")
    func twoCopies() async throws {
        let d = filled()
        #expect(await d.vault.turnOn(phrase: Self.phrase) == .saved)
        #expect(VaultServer.copies.count == 2)
        let keys = VaultKeys(phrase: Self.phrase)
        let main = try Sealer.open(try #require(VaultServer.copies[keys.main.vaultKey]).data, with: keys.main)
        let journal = try Sealer.open(try #require(VaultServer.copies[keys.journal.vaultKey]).data, with: keys.journal)
        #expect(main.entries["pi.choice.q1"] == "o2")
        #expect(main.entries[APIClient.deviceKey] == "pass-123")
        #expect(main.entries.keys.allSatisfy { BackupRegistry.copy(of: $0) != .journal })
        #expect(main.entries["pi.welcomed"] == nil)
        #expect(journal.entries == ["pi.nb.reflection.r1": Self.reflection])
        #expect(await d.vault.state?.phrase == Self.phrase)
    }

    @Test("A new device brings everything back with the 12 words")
    func restore() async throws {
        _ = await filled().vault.turnOn(phrase: Self.phrase)
        let fresh = Device()
        #expect(try await fresh.vault.restore(phrase: Self.phrase) == .restored)
        #expect(fresh.defaults.string(forKey: "pi.choice.q1") == "o2")
        #expect(fresh.defaults.string(forKey: "pi.nb.reflection.r1") == Self.reflection)
        #expect(fresh.secrets.string(forKey: APIClient.deviceKey) == "pass-123")
        #expect(await fresh.vault.writingWaits == false)
    }

    @Test("Wrong words find nothing")
    func wrongWords() async throws {
        _ = await filled().vault.turnOn(phrase: Self.phrase)
        let other = Phrase.new()
        #expect(try await Device().vault.restore(phrase: other) == .none)
    }

    @Test("Restoring through sync brings back all but the writing, until the 12 words")
    func syncThenWriting() async throws {
        _ = await filled().vault.turnOn(phrase: Self.phrase)
        let fresh = Device()
        let secret = VaultKeys(phrase: Self.phrase).syncSecret
        #expect(try await fresh.vault.restoreFromSync(secret) == .restored)
        #expect(fresh.defaults.string(forKey: "pi.choice.q1") == "o2")
        #expect(fresh.defaults.string(forKey: "pi.nb.reflection.r1") == nil)
        #expect(await fresh.vault.writingWaits)

        #expect(try await fresh.vault.restoreWriting(phrase: Phrase.new()) == .mismatch)
        #expect(try await fresh.vault.restoreWriting(phrase: Self.phrase) == .restored)
        #expect(fresh.defaults.string(forKey: "pi.nb.reflection.r1") == Self.reflection)
        #expect(await fresh.vault.writingWaits == false)
    }

    @Test("A device on sync keys alone backs up the main copy, never the writing")
    func syncDeviceBacksUpMainOnly() async throws {
        _ = await filled().vault.turnOn(phrase: Self.phrase)
        let fresh = Device()
        _ = try await fresh.vault.restoreFromSync(VaultKeys(phrase: Self.phrase).syncSecret)
        fresh.defaults.set(#"{"id":"r2","answer":"new words","at":2000}"#, forKey: "pi.nb.reflection.r2")
        fresh.defaults.set("o3", forKey: "pi.choice.q2")
        #expect(await fresh.vault.backUp() == .saved)
        let keys = VaultKeys(phrase: Self.phrase)
        let main = try Sealer.open(try #require(VaultServer.copies[keys.main.vaultKey]).data, with: keys.main)
        let journal = try Sealer.open(try #require(VaultServer.copies[keys.journal.vaultKey]).data, with: keys.journal)
        #expect(main.entries["pi.choice.q2"] == "o3")
        #expect(main.entries["pi.nb.reflection.r2"] == nil)
        #expect(journal.entries["pi.nb.reflection.r2"] == nil)
    }

    @Test("When another device wrote first, both devices' answers are kept")
    func merges() async throws {
        let a = filled()
        _ = await a.vault.turnOn(phrase: Self.phrase)
        let b = Device()
        _ = try await b.vault.restore(phrase: Self.phrase)
        b.defaults.set("o9", forKey: "pi.choice.q7")
        b.defaults.set(#"{"id":"r1","answer":"edited later","at":5000}"#, forKey: "pi.nb.reflection.r1")
        #expect(await b.vault.backUp() == .saved)

        a.defaults.set("o4", forKey: "pi.choice.q4")
        #expect(await a.vault.backUp() == .saved)
        #expect(a.defaults.string(forKey: "pi.choice.q7") == "o9")
        #expect(a.defaults.string(forKey: "pi.nb.reflection.r1")?.contains("edited later") == true)

        let keys = VaultKeys(phrase: Self.phrase)
        let main = try Sealer.open(try #require(VaultServer.copies[keys.main.vaultKey]).data, with: keys.main)
        #expect(main.entries["pi.choice.q4"] == "o4")
        #expect(main.entries["pi.choice.q7"] == "o9")
    }

    @Test("Answer histories from two devices are joined")
    func history() throws {
        let a = #"{"answers":[{"questionId":"q1","date":"2026-10-01"}],"skips":[]}"#
        let b = #"{"answers":[{"questionId":"q2","date":"2026-10-02"}],"skips":[]}"#
        let merged = try JSONSerialization.jsonObject(with: Data(Vault.mergeHistory(a, b).utf8)) as? [String: Any]
        let ids = (merged?["answers"] as? [[String: Any]])?.compactMap { $0["questionId"] as? String }
        #expect(ids == ["q1", "q2"])
    }

    @Test("Turning off deletes both copies and forgets the phrase")
    func turnOff() async throws {
        let d = filled()
        _ = await d.vault.turnOn(phrase: Self.phrase)
        try await d.vault.turnOff()
        #expect(VaultServer.copies.isEmpty)
        #expect(await d.vault.state == nil)
        #expect(d.secrets.string(forKey: Vault.stateKey) == nil)
    }

    @Test("The phrase is kept in the Keychain store, never in settings")
    func phraseInKeychain() async throws {
        let d = filled()
        _ = await d.vault.turnOn(phrase: Self.phrase)
        #expect(d.secrets.string(forKey: Vault.stateKey)?.contains("legal winner") == true)
        #expect(d.defaults.keys(withPrefix: "pi.").allSatisfy { !(d.defaults.string(forKey: $0) ?? "").contains("legal winner") })
    }

    @Test("Sync keeps only the main copy's keys on the server, never the 12 words")
    func syncOn() async throws {
        let d = filled()
        _ = await d.vault.turnOn(phrase: Self.phrase)
        #expect(try await d.vault.syncOn() == nil)
        #expect(VaultServer.sync == VaultKeys(phrase: Self.phrase).syncSecret)
        #expect(VaultServer.sync?.contains("legal") == false)
    }

    @Test("Turning sync on with no backup makes a phrase to write down")
    func syncOnFresh() async throws {
        let made = try #require(try await filled().vault.syncOn())
        #expect(Phrase.problem(made) == nil)
        #expect(VaultServer.sync == VaultKeys(phrase: made).syncSecret)
    }

    @Test("A phone signing in restores all but the writing, and keeps its new pass")
    func pull() async throws {
        let a = filled()
        _ = await a.vault.turnOn(phrase: Self.phrase)
        _ = try await a.vault.syncOn()
        let phone = Device()
        phone.secrets.set("signed-in-pass", forKey: APIClient.deviceKey)
        #expect(try await phone.vault.pullSync(true) == .restored)
        #expect(phone.defaults.string(forKey: "pi.choice.q1") == "o2")
        #expect(phone.defaults.string(forKey: "pi.nb.reflection.r1") == nil)
        #expect(phone.secrets.string(forKey: APIClient.deviceKey) == "signed-in-pass")
        #expect(await phone.vault.writingWaits)
    }

    @Test("An account that kept the 12 words is given the keys instead")
    func legacy() async throws {
        let a = filled()
        _ = await a.vault.turnOn(phrase: Self.phrase)
        VaultServer.sync = Self.phrase
        #expect(try await Device().vault.pullSync(true) == .restored)
        #expect(VaultServer.sync == VaultKeys(phrase: Self.phrase).syncSecret)

        VaultServer.sync = Self.phrase
        try await a.vault.upgradeSync(true)
        #expect(VaultServer.sync == VaultKeys(phrase: Self.phrase).syncSecret)
    }

    @Test("Sync off, a phone signing in restores nothing")
    func pullOff() async throws {
        _ = await filled().vault.turnOn(phrase: Self.phrase)
        #expect(try await Device().vault.pullSync(false) == .none)
    }

    @Test("Reflections written on two devices all show after a merge or a restore")
    func indexesJoin() async throws {
        func entry(_ id: String, _ text: String) -> ReflectionEntry {
            ReflectionEntry(id: id, date: "2026-10-25", period: .day, area: .self, kind: .learnt, source: .yourAnswers,
                            about: "", question: "How was today?", answer: text, free: true)
        }
        let a = Device()
        ReflectionStore(store: a.defaults).save(entry("ra", "from the phone"))
        _ = await a.vault.turnOn(phrase: Self.phrase)

        let b = Device()
        ReflectionStore(store: b.defaults).save(entry("rb", "from the Mac"))
        #expect(try await b.vault.restore(phrase: Self.phrase) == .restored)
        #expect(Set(ReflectionStore(store: b.defaults).all().map(\.id)) == ["ra", "rb"])
        #expect(await b.vault.backUp() == .saved)

        ReflectionStore(store: a.defaults).save(entry("ra2", "later on the phone"))
        #expect(await a.vault.backUp() == .saved)
        #expect(Set(ReflectionStore(store: a.defaults).all().map(\.id)) == ["ra", "rb", "ra2"])
    }

    @Test("What only the web keeps survives a restore and a backup from this device")
    func carriesTheWebsKeys() async throws {
        let keys = VaultKeys(phrase: Self.phrase)
        let main = Snapshot(made: 1, words: true, entries: ["pi.choice.q1": "o2", "pi.saved.v1": "[\"card-1\"]"])
        let journal = Snapshot(made: 1, words: true, entries: ["pi.nb.reflection.r1": Self.reflection, "pi.nb.note.n1": "a web note"])
        VaultServer.copies[keys.main.vaultKey] = (1, try Sealer.seal(main, with: keys.main))
        VaultServer.copies[keys.journal.vaultKey] = (1, try Sealer.seal(journal, with: keys.journal))

        let d = Device()
        #expect(try await d.vault.restore(phrase: Self.phrase) == .restored)
        d.defaults.set("o5", forKey: "pi.choice.q5")
        #expect(await d.vault.backUp() == .saved)

        let mainAfter = try Sealer.open(try #require(VaultServer.copies[keys.main.vaultKey]).data, with: keys.main)
        let journalAfter = try Sealer.open(try #require(VaultServer.copies[keys.journal.vaultKey]).data, with: keys.journal)
        #expect(mainAfter.entries["pi.saved.v1"] == "[\"card-1\"]")
        #expect(mainAfter.entries["pi.choice.q5"] == "o5")
        #expect(mainAfter.words)
        #expect(journalAfter.entries["pi.nb.note.n1"] == "a web note")
        #expect(mainAfter.entries["pi.nb.note.n1"] == nil)
    }
}
