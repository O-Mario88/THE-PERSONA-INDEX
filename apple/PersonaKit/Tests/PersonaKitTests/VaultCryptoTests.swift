import Foundation
import Testing
@testable import PersonaKit

// The native backup must open what the web seals and make the same keys
// from the same 12 words. These values come from the web's own code
// (@scure/bip39 and WebCrypto, as frontend/src/vault.ts uses them).
@Suite("The encrypted backup, the same as the web's")
struct VaultCryptoTests {
    static let phrase = "legal winner thank year wave sausage worth useful legal winner thank yellow"

    @Test("makes BIP39's seed and the web's four keys from one phrase")
    func keys() {
        #expect(Phrase.seed(Self.phrase).map { String(format: "%02x", $0) }.joined() == "878386efb78845b3355bd15ea4d39ef97d179cb712b77d5c12b6be415fffeffe5f377ba02bf3f8544ab800b955e51fbff09828f682052a20faa6addbbddfb096")
        let k = VaultKeys(phrase: Self.phrase)
        #expect(k.main.vaultKey == "J0GFO_7zJngCxhmZrubDmXdTzhOBGoVB4wvYX8zSoqs")
        #expect(k.main.sealRaw.base64url == "w2gkrWwU_tVEMILosbxoirXsOEOUM14w4HAAniJTukE")
        #expect(k.journal.vaultKey == "HQvuEMZZnRH2I32X3FQsdT3jjOAAu5bGTBnJALSIy7s")
        #expect(k.journal.sealRaw.base64url == "pTt0xYVAQAKg6xPGitCVxLkdISMAJTTMfwqQpSIDH8k")
        #expect(k.syncSecret == "sk2.J0GFO_7zJngCxhmZrubDmXdTzhOBGoVB4wvYX8zSoqs.w2gkrWwU_tVEMILosbxoirXsOEOUM14w4HAAniJTukE")
    }

    @Test("easy sync's secret opens the main copy and carries no journal key")
    func syncSecret() throws {
        let k = VaultKeys(phrase: Self.phrase)
        let fromSync = try #require(VaultKeys.main(fromSync: k.syncSecret))
        #expect(fromSync.vaultKey == k.main.vaultKey)
        #expect(!k.syncSecret.contains(k.journal.vaultKey) && !k.syncSecret.contains(k.journal.sealRaw.base64url))
        #expect(!VaultKeys.isSyncSecret(Self.phrase))
    }

    @Test("opens a copy the web sealed with gzip")
    func opensWebCopy() throws {
        let sealed = try #require(Data(base64Encoded: "AgcHBwcHBwcHBwcHBzNnD6egfVTy76cYH84OvaLzqiyBWWJ71dlxT0h2bSQ54p8B6gCY6C6YGwWxiRe4vGiq8AuCsjNope3P3HRfYeZW/Jg69adsshKRHQuRURoacz3i+95cTf2UlGD2Vb6+AKmTkuZt77Uh7hE8XlJewYcCwVDvFg1Jz6dqGsoUU2B+f0t+nRip"))
        let s = try Sealer.open(sealed, with: VaultKeys(phrase: Self.phrase).main)
        #expect(s.entries["pi.name"] == "Bea")
        #expect(s.made == 1792900000000)
        // The journal key cannot open the main copy.
        #expect(throws: (any Error).self) { try Sealer.open(sealed, with: VaultKeys(phrase: Self.phrase).journal) }
    }

    @Test("seals so it opens again, and refuses a tampered copy")
    func roundTrip() throws {
        let keys = VaultKeys(phrase: Self.phrase).journal
        let snap = Snapshot(made: 1, words: true, entries: ["pi.nb.reflection.r1": "{\"answer\":\"Private.\"}"])
        var sealed = try Sealer.seal(snap, with: keys)
        #expect(try Sealer.open(sealed, with: keys) == snap)
        #expect(!String(decoding: sealed, as: UTF8.self).contains("Private."))
        sealed[20] ^= 1
        #expect(throws: (any Error).self) { try Sealer.open(sealed, with: keys) }
    }

    @Test("makes valid phrases and catches mistyped ones")
    func phrases() {
        let p = Phrase.new()
        #expect(p.split(separator: " ").count == 12)
        #expect(Phrase.problem(p) == nil)
        #expect(Phrase.problem(Self.phrase) == nil)
        #expect(Phrase.problem("legal winner") == .count(2))
        #expect(Phrase.problem(Self.phrase.replacingOccurrences(of: "yellow", with: "yelow")) == .word("yelow", at: 12))
        #expect(Phrase.problem(Self.phrase.replacingOccurrences(of: "yellow", with: "zoo")) == .checksum)
        #expect(Phrase.words(for: [UInt8](repeating: 0x7f, count: 16)) == Self.phrase)
    }
}
