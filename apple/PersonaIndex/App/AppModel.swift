import Foundation
import Observation
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

    private let api: APIClient
    private let defaults: KeyValueStore

    enum Keys {
        static let welcomed = "pi.welcomed"
        static let choice = "pi.choice."
        static let unsent = "pi.unsent."
    }

    init(api: APIClient, defaults: KeyValueStore) {
        self.api = api
        self.defaults = defaults
        self.welcomed = defaults.string(forKey: Keys.welcomed) == "1"
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

    // MARK: Loading and answering

    func refresh() async {
        tick()
        if set == nil { load = .loading }
        do {
            let set = try await api.day(date)
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
        choices[question.id] = option.id
        defaults.set(option.id, forKey: Keys.choice + question.id)
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
