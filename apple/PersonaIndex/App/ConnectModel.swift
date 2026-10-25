import Foundation
import Observation
import PersonaKit

/// The new Connect's state: what friends shared, Common Ground, reach-outs
/// and nods, and the person's own moves, noted on the device for "Your
/// week in connection". Nothing here is sent without the person pressing a
/// button, and nothing says whether something was seen.
@MainActor
@Observable
final class ConnectModel {
    private(set) var shares: SharesView?
    private(set) var common: CommonView?
    private(set) var reach: ReachOutsView?
    private(set) var nods: NodsView?

    private let api: APIClient
    private let defaults: KeyValueStore

    init(api: APIClient, defaults: KeyValueStore) {
        self.api = api
        self.defaults = defaults
    }

    var log: ConnectionLog { ConnectionLog(store: defaults) }

    /// Common Ground suggestions from this device's answers. Reviewed before anything is sent.
    var suggestedTags: [String] { CommonSuggestions.from(AnswerHistory(store: defaults).answers()) }

    func load(date: String) async {
        async let s = try? api.shares()
        async let c = try? api.common()
        async let r = try? api.reachOuts()
        async let n = try? api.nods(date)
        let (shares, common, reach, nods) = await (s, c, r, n)
        self.shares = shares
        self.common = common
        self.reach = reach
        self.nods = nods
    }

    func share(_ share: NewShare, date: String) async throws {
        try await api.postShare(share)
        log.note(.share, on: date)
        shares = try? await api.shares()
    }

    func withdraw(_ id: String) async throws {
        try await api.withdrawShare(id)
        shares = try? await api.shares()
    }

    func saveTags(_ tags: [String]) async throws {
        try await api.putCommon(tags: tags)
        common = try? await api.common()
    }

    func setCommon(_ friend: FriendView, on: Bool) async throws {
        try await api.setCommonFriend(friend.id, on: on)
        common = try? await api.common()
    }

    func reachOut(to friend: FriendView, kind: ReachKind, phrase: String, date: String) async throws {
        try await api.sendReachOut(to: friend.id, kind: kind, phrase: phrase)
        log.note(kind == .support ? .support : .celebrate, on: date)
    }

    func putAway(_ reachOut: ReachOutView) async {
        try? await api.putAwayReachOut(reachOut.id)
        reach = try? await api.reachOuts()
    }

    func nod(to friend: FriendView, card: Int, date: String) async throws {
        try await api.sendNod(to: friend.id, card: card, date: date)
        log.note(.nod, on: date)
        nods = try? await api.nods(date)
    }

    /// An invite link to the web app, where anyone can join: personaindex.com/c/<code>.
    func invite(tag: Tag) async throws -> URL {
        let made = try await api.createInvite(tag: tag)
        let base = (Bundle.main.object(forInfoDictionaryKey: "PIWebBase") as? String) ?? "https://personaindex.com"
        return URL(string: "\(base)/c/\(made.code)")!
    }

    func mute(_ friend: FriendView, _ muted: Bool) async {
        _ = try? await api.patchFriend(friend.id, muted: muted)
    }

    func retag(_ friend: FriendView, _ tag: Tag) async {
        _ = try? await api.patchFriend(friend.id, tag: tag)
    }

    func disconnect(_ friend: FriendView) async {
        try? await api.disconnect(friend.id)
    }
}
