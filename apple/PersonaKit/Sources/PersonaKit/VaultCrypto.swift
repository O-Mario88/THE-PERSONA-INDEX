import CommonCrypto
import Compression
import CryptoKit
import Foundation

// The encrypted backup's cryptography, byte for byte the web's
// (frontend/src/vault.ts), so one 12-word phrase opens the same backup on
// the web, an iPhone or a Mac:
//   - the phrase is twelve BIP39 English words with a checksum;
//   - the seed is BIP39's: PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic";
//   - HKDF-SHA256 with salt "persona-index vault v1" makes four keys: the
//     main copy's "vault key" (the server's address for it) and "seal key",
//     and the journal copy's "journal vault key" and "journal seal key";
//   - a sealed copy is one format byte (1 plain, 2 gzip), a 12-byte nonce
//     and AES-GCM ciphertext with its tag, the format bound in as
//     "persona-index vault <format>";
//   - easy sync keeps "sk2.<vault key>.<seal key>": the main copy's keys,
//     never the phrase, so it can never open the journal copy.

public enum Phrase {
    public static func new() -> String {
        var entropy = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, entropy.count, &entropy)
        return words(for: entropy)
    }

    static func words(for entropy: [UInt8]) -> String {
        let check = Array(SHA256.hash(data: Data(entropy)))[0] >> 4
        var bits = entropy.flatMap { b in (0..<8).reversed().map { (b >> $0) & 1 } }
        bits += (0..<4).reversed().map { (check >> $0) & 1 }
        return stride(from: 0, to: bits.count, by: 11).map { i in
            BIP39Words.english[bits[i..<i + 11].reduce(0) { $0 << 1 | Int($1) }]
        }.joined(separator: " ")
    }

    /// Lower case, single spaces, NFKD, as BIP39 asks.
    public static func normalise(_ input: String) -> String {
        input.decomposedStringWithCompatibilityMapping.lowercased().split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    public enum Problem: Equatable { case count(Int), word(String, at: Int), checksum }

    /// What is wrong with a typed phrase, or nil.
    public static func problem(_ input: String) -> Problem? {
        let words = normalise(input).split(separator: " ").map(String.init)
        guard words.count == 12 else { return .count(words.count) }
        var bits: [UInt8] = []
        for (i, w) in words.enumerated() {
            guard let n = BIP39Words.english.firstIndex(of: w) else { return .word(w, at: i) }
            bits += (0..<11).reversed().map { UInt8((n >> $0) & 1) }
        }
        let entropy = stride(from: 0, to: 128, by: 8).map { i in bits[i..<i + 8].reduce(0) { $0 << 1 | $1 } }
        let check = Array(SHA256.hash(data: Data(entropy)))[0] >> 4
        let given = bits[128..<132].reduce(UInt8(0)) { $0 << 1 | $1 }
        return check == given ? nil : .checksum
    }

    /// BIP39's seed: PBKDF2-HMAC-SHA512 of the phrase, salt "mnemonic", 2048 rounds.
    public static func seed(_ phrase: String) -> Data {
        let password = Array(normalise(phrase).utf8)
        let salt = Array("mnemonic".utf8)
        var out = [UInt8](repeating: 0, count: 64)
        _ = password.withUnsafeBufferPointer { p in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), p.baseAddress!.withMemoryRebound(to: CChar.self, capacity: p.count) { $0 }, p.count,
                                 salt, salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA512), 2048, &out, out.count)
        }
        return Data(out)
    }
}

/// One copy's two keys: its address on the server, and what seals it.
public struct CopyKeys: Sendable {
    public let vaultKey: String
    let seal: SymmetricKey
    let sealRaw: Data
}

/// The four keys a phrase makes.
public struct VaultKeys: Sendable {
    public let main: CopyKeys
    public let journal: CopyKeys

    public init(phrase: String) {
        let seed = SymmetricKey(data: Phrase.seed(phrase))
        let salt = Data("persona-index vault v1".utf8)
        func bits(_ info: String) -> Data {
            HKDF<SHA256>.deriveKey(inputKeyMaterial: seed, salt: salt, info: Data(info.utf8), outputByteCount: 32).withUnsafeBytes { Data($0) }
        }
        let (v, s, jv, js) = (bits("vault key"), bits("seal key"), bits("journal vault key"), bits("journal seal key"))
        main = CopyKeys(vaultKey: v.base64url, seal: SymmetricKey(data: s), sealRaw: s)
        journal = CopyKeys(vaultKey: jv.base64url, seal: SymmetricKey(data: js), sealRaw: js)
    }

    /// What easy sync keeps for the account: the main copy's keys only.
    public var syncSecret: String { "sk2.\(main.vaultKey).\(main.sealRaw.base64url)" }

    public static func isSyncSecret(_ s: String) -> Bool {
        let parts = s.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 3 && parts[0] == "sk2" && parts[1].count == 43 && parts[2].count == 43
    }

    /// The main copy's keys, from what sync gave a device without the phrase.
    public static func main(fromSync secret: String) -> CopyKeys? {
        guard isSyncSecret(secret) else { return nil }
        let parts = secret.split(separator: ".")
        guard let raw = Data(base64url: String(parts[2])) else { return nil }
        return CopyKeys(vaultKey: String(parts[1]), seal: SymmetricKey(data: raw), sealRaw: raw)
    }
}

/// What a copy carries: every registered key it holds, as text.
public struct Snapshot: Codable, Sendable, Equatable {
    public var v = 1
    public var made: Double
    public var words: Bool
    public var entries: [String: String]
}

public enum Sealer {
    public enum Failure: Error { case format, unreadable }

    /// Seals plain (format 1); the web reads it as it reads its own.
    public static func seal(_ snapshot: Snapshot, with keys: CopyKeys) throws -> Data {
        let body = try JSONEncoder().encode(snapshot)
        let box = try AES.GCM.seal(body, using: keys.seal, authenticating: aad(1))
        return Data([1]) + Data(box.nonce) + box.ciphertext + box.tag
    }

    /// Opens a copy the web or this app sealed, plain or gzip.
    public static func open(_ sealed: Data, with keys: CopyKeys) throws -> Snapshot {
        guard let format = sealed.first, format == 1 || format == 2, sealed.count > 29 else { throw Failure.format }
        let bytes = [UInt8](sealed)
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: bytes[1..<13]), ciphertext: bytes[13..<(bytes.count - 16)], tag: bytes[(bytes.count - 16)...])
        var body = try AES.GCM.open(box, using: keys.seal, authenticating: aad(format))
        if format == 2 { body = try gunzip(body) }
        let s = try JSONDecoder().decode(Snapshot.self, from: body)
        guard s.v <= 1 else { throw Failure.unreadable }
        return s
    }

    static func aad(_ format: UInt8) -> Data { Data("persona-index vault \(format)".utf8) }

    /// Gzip as CompressionStream writes it: a header, raw deflate, a trailer.
    static func gunzip(_ data: Data) throws -> Data {
        let b = [UInt8](data)
        guard b.count > 18, b[0] == 0x1f, b[1] == 0x8b, b[2] == 8 else { throw Failure.unreadable }
        var i = 10
        let flags = b[3]
        if flags & 4 != 0 { i += 2 + Int(b[i]) + Int(b[i + 1]) << 8 }
        if flags & 8 != 0 { while i < b.count, b[i] != 0 { i += 1 }; i += 1 }
        if flags & 16 != 0 { while i < b.count, b[i] != 0 { i += 1 }; i += 1 }
        if flags & 2 != 0 { i += 2 }
        let size = Int(b[b.count - 4]) | Int(b[b.count - 3]) << 8 | Int(b[b.count - 2]) << 16 | Int(b[b.count - 1]) << 24
        let deflate = Array(b[i..<(b.count - 8)])
        var out = [UInt8](repeating: 0, count: max(size, 1))
        let n = compression_decode_buffer(&out, out.count, deflate, deflate.count, nil, COMPRESSION_ZLIB)
        guard n == size else { throw Failure.unreadable }
        return Data(out[0..<n])
    }
}

extension Data {
    var base64url: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    init?(base64url: String) {
        var s = base64url.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while s.count % 4 != 0 { s += "=" }
        self.init(base64Encoded: s)
    }
}
