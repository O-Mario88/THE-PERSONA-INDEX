import Foundation
import Security

/// Where small values are kept on the device. The pass and anything else
/// that proves who the phone is go to the Keychain; answers and settings to
/// UserDefaults; tests use memory.
public protocol KeyValueStore: AnyObject, Sendable {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
    /// Every key held under a prefix, for gathering a backup copy.
    func keys(withPrefix prefix: String) -> [String]
}

public final class MemoryStore: KeyValueStore, @unchecked Sendable {
    private var values: [String: String] = [:]
    private let lock = NSLock()

    public init() {}

    public func string(forKey key: String) -> String? {
        lock.withLock { values[key] }
    }

    public func set(_ value: String?, forKey key: String) {
        lock.withLock { values[key] = value }
    }

    public func keys(withPrefix prefix: String) -> [String] {
        lock.withLock { values.keys.filter { $0.hasPrefix(prefix) }.sorted() }
    }
}

/// Answers, choices and settings: UserDefaults under the web's key names (pi.*).
public final class DefaultsStore: KeyValueStore, @unchecked Sendable {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func string(forKey key: String) -> String? {
        defaults.string(forKey: key)
    }

    public func set(_ value: String?, forKey key: String) {
        if let value { defaults.set(value, forKey: key) } else { defaults.removeObject(forKey: key) }
    }

    public func keys(withPrefix prefix: String) -> [String] {
        defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }.sorted()
    }
}

/// The device pass: the Keychain, this device only, never in a backup.
public final class KeychainStore: KeyValueStore, @unchecked Sendable {
    private let service: String

    public init(service: String = "com.personaindex.app") {
        self.service = service
    }

    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: key]
    }

    public func string(forKey key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func set(_ value: String?, forKey key: String) {
        SecItemDelete(query(key) as CFDictionary)
        guard let value else { return }
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    /// The Keychain holds a few named secrets; a backup reads them by name.
    public func keys(withPrefix prefix: String) -> [String] { [] }
}
