import Foundation
import Observation
import OSLog
import PersonaKit

/// The app's state: today's set from the server, what this phone answered,
/// and the clock's window. Answers are kept here first and sent after; an
/// answer that could not be sent waits and goes with the next load, under
/// the same idempotency key, so it is counted once and never made up.
@MainActor
@Observable
final class AppModel {
    enum Load: Equatable {
        case loading
        case ready(DailySet)
        case failed(String)
    }

    private(set) var load: Load = .loading
    private(set) var choices: [String: String] = [:]
    private(set) var now = AppModel.clock()
    var welcomed: Bool {
        didSet { defaults.set(welcomed ? "1" : nil, forKey: Keys.welcomed) }
    }
    /// What the person asked to be called, for the greeting. On the device only, never sent.
    var name: String {
        didSet { defaults.set(name.isEmpty ? nil : name, forKey: Keys.name) }
    }

    private let api: APIClient
    private let defaults: KeyValueStore
    /// The new Connect: shares, Common Ground, reach-outs and nods.
    let connect: ConnectModel

    enum Keys {
        static let welcomed = "pi.welcomed"
        static let name = "pi.name"
        static let choice = "pi.choice."
        static let unsent = "pi.unsent."
    }

    init(api: APIClient, defaults: KeyValueStore) {
        self.api = api
        self.defaults = defaults
        self.connect = ConnectModel(api: api, defaults: defaults)
        self.welcomed = defaults.string(forKey: Keys.welcomed) == "1"
        self.name = defaults.string(forKey: Keys.name) ?? ""
    }

    static func live() -> AppModel {
        let base = (Bundle.main.object(forInfoDictionaryKey: "PIApiBase") as? String).flatMap(URL.init(string:))
            ?? URL(string: "http://localhost:8080")!
        let defaults = DefaultsStore()
        return AppModel(api: APIClient(base: base, store: KeychainStore(), voteStore: defaults), defaults: defaults)
    }

    // MARK: The day

    var date: String { Day.localDate(now) }
    var window: DayWindow { DayWindow.at(now) }
    var sitting: Sitting? { Day.sitting(at: now) }

    var set: DailySet? {
        if case let .ready(set) = load { return set }
        return nil
    }

    /// The three questions of a sitting. Intimate questions wait for the
    /// 18+ answer in Settings, which arrives in a later build.
    func questions(for sitting: Sitting) -> [Question] {
        let all = sitting == .morning ? (set?.questions ?? []) : (set?.evening ?? [])
        return all.filter { $0.care != .intimate }
    }

    func choice(for question: Question) -> String? { choices[question.id] }

    func isDone(_ sitting: Sitting) -> Bool {
        let qs = questions(for: sitting)
        return !qs.isEmpty && qs.allSatisfy { choices[$0.id] != nil }
    }

    /// Windows done today: the two sittings for now; midday, the pulse and
    /// night count once those screens arrive.
    var doneCount: Int { (isDone(.morning) ? 1 : 0) + (isDone(.evening) ? 1 : 0) }

    func tick() { now = Self.clock() }

    /// The phone's time. A debug build can be started at another moment, to
    /// see a weekday sitting on a Sunday: `-PINow 2026-10-24T08:10:00`.
    static func clock() -> Date {
        #if DEBUG
        if let raw = UserDefaults.standard.string(forKey: "PINow") {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
            if let fixed = f.date(from: raw) { return fixed }
        }
        #endif
        return Date()
    }

    // MARK: Reflect

    private(set) var reflections: [ReflectionEntry] = []

    private var reflectionStore: ReflectionStore { ReflectionStore(store: defaults) }

    func loadReflections() { reflections = reflectionStore.all() }

    /// Today's answers with the option chosen, for what went well and where to grow.
    var answeredToday: [(Question, Option)] {
        guard let set else { return [] }
        return (set.questions + (set.evening ?? [])).compactMap { q in
            guard let id = choices[q.id], let o = q.options.first(where: { $0.id == id }) else { return nil }
            return (q, o)
        }
    }

    /// Keeps a typed reflection on the device, with today's date.
    func saveReflection(_ prompt: ReflectionPrompt, answer: String, period: ReflectionPeriod) {
        let words = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        let id = prompt.followsUp.map { "follow-\($0)~\(date)" } ?? "\(date)-\(period.rawValue)-\(prompt.id)"
        reflectionStore.save(ReflectionEntry(id: id, date: date, period: period, area: prompt.area, kind: prompt.kind,
                                             source: prompt.source, about: prompt.about, question: prompt.question, answer: words))
        loadReflections()
    }

    // MARK: Signing in, the circle and Growing Together

    private(set) var signedIn = false
    private(set) var circle: CircleView?
    private(set) var growing: Growing?
    private(set) var rings: [String: Ring] = [:]

    private var ringStore: RingStore { RingStore(store: defaults) }

    func loadConnect() async {
        signedIn = await api.isSignedIn
        rings = ringStore.all()
        growing = try? await api.growing(date)
        guard signedIn else { circle = nil; return }
        do {
            circle = try await api.circle()
            await connect.load(date: date)
        } catch {
            signedIn = await api.isSignedIn
        }
    }

    func sendCode(to address: String) async throws -> String {
        try await api.sendCode(to: address)
    }

    func verifyCode(address: String, code: String) async throws {
        #if os(iOS)
        let device = "iPhone"
        #else
        let device = "Mac"
        #endif
        let me = try await api.verifyCode(address: address, code: code, device: device)
        if name.isEmpty { name = me.name }
        await loadConnect()
    }

    func place(_ friend: FriendView, in ring: Ring) {
        ringStore.place(friend.id, in: ring)
        rings = ringStore.all()
    }

    func ring(of friend: FriendView) -> Ring { rings[friend.id] ?? .outer }

    // MARK: The mirror

    /// This phone's week, from the server.
    func weekMirror() async throws -> WeekMirror {
        try await api.mirror(date)
    }

    // MARK: Loading and answering

    func refresh() async {
        tick()
        if set == nil { load = .loading }
        do {
            let set = try await api.day(date)
            #if DEBUG
            Logger(subsystem: "com.personaindex.app", category: "answers").debug("loaded \(set.date, privacy: .public)")
            #endif
            choices = Dictionary(uniqueKeysWithValues: (set.questions + (set.evening ?? [])).compactMap { q in
                defaults.string(forKey: Keys.choice + q.id).map { (q.id, $0) }
            })
            load = .ready(set)
            await sendUnsent(set)
        } catch {
            if set == nil { load = .failed("I couldn't load today's questions. Check your connection and try again.") }
        }
    }

    /// Keeps the answer on the phone, then sends it.
    func answer(_ question: Question, with option: Option, in sitting: Sitting) async {
        #if DEBUG
        Logger(subsystem: "com.personaindex.app", category: "answers").debug("answered \(question.id, privacy: .public) with \(option.id, privacy: .public)")
        #endif
        choices[question.id] = option.id
        defaults.set(option.id, forKey: Keys.choice + question.id)
        AnswerHistory(store: defaults).record(question, optionId: option.id, date: date)
        defaults.set(sitting.rawValue, forKey: Keys.unsent + question.id)
        await send(question, optionId: option.id, sitting: sitting)
    }

    private func send(_ question: Question, optionId: String, sitting: Sitting) async {
        do {
            try await api.vote(questionId: question.id, optionId: question.sentOption(for: optionId), sitting: sitting)
            defaults.set(nil, forKey: Keys.unsent + question.id)
        } catch {
            // It waits on the phone and goes with the next load.
        }
    }

    private func sendUnsent(_ set: DailySet) async {
        for q in set.questions + (set.evening ?? []) {
            guard let raw = defaults.string(forKey: Keys.unsent + q.id), let sitting = Sitting(rawValue: raw),
                  let optionId = choices[q.id] else { continue }
            await send(q, optionId: optionId, sitting: sitting)
        }
    }
}
