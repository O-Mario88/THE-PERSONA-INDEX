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
    /// Where the person is: a tab on iPhone, the sidebar on a Mac.
    var section: AppSection = .today
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
    /// Reflect: the writing, kept on the device.
    let reflect: ReflectModel
    /// The encrypted backup and easy sync.
    let backup: BackupModel
    /// Face ID, Touch ID or Optic ID before the app opens.
    let lock: AppLock
    /// Local reminders for the sittings, the Sunday Mirror and check-ins.
    let reminders: ReminderScheduler

    enum Keys {
        static let welcomed = "pi.welcomed"
        static let name = "pi.name"
        static let choice = "pi.choice."
        static let unsent = "pi.unsent."
        /// Before settings moved into pi.prefs.v1 (26 October 2026).
        static let oldPulse = "pi.pulse"
    }

    init(api: APIClient, defaults: KeyValueStore, secrets: KeyValueStore) {
        self.api = api
        self.defaults = defaults
        self.connect = ConnectModel(api: api, defaults: defaults)
        self.reflect = ReflectModel(defaults: defaults)
        self.backup = BackupModel(vault: Vault(api: api, defaults: defaults, secrets: secrets))
        self.lock = AppLock(defaults: defaults)
        self.reminders = ReminderScheduler(defaults: defaults)
        self.welcomed = defaults.string(forKey: Keys.welcomed) == "1"
        self.name = defaults.string(forKey: Keys.name) ?? ""
        var prefs = PrefStore(store: defaults).prefs
        if defaults.string(forKey: Keys.oldPulse) == "1" {
            prefs.pulse = true
            PrefStore(store: defaults).save(prefs)
        }
        defaults.set(nil, forKey: Keys.oldPulse)
        self.prefs = prefs
    }

    static func live() -> AppModel {
        let base = (Bundle.main.object(forInfoDictionaryKey: "PIApiBase") as? String).flatMap(URL.init(string:))
            ?? URL(string: "http://localhost:8080")!
        let defaults = DefaultsStore()
        let secrets = KeychainStore()
        return AppModel(api: APIClient(base: base, store: secrets, voteStore: defaults), defaults: defaults, secrets: secrets)
    }

    // MARK: The day

    var date: String { Day.localDate(now) }
    var window: DayWindow { DayWindow.at(now) }
    var sitting: Sitting? { Day.sitting(at: now) }

    var set: DailySet? {
        if case let .ready(set) = load { return set }
        return nil
    }

    /// The questions of a sitting. Intimate questions only after "I'm 18 or
    /// older" in Settings, and never with "Keep it mild"; their answers are
    /// sent without the option either way.
    func questions(for sitting: Sitting) -> [Question] {
        let all = sitting == .morning ? (set?.questions ?? []) : (set?.evening ?? [])
        return prefs.asksIntimate ? all : all.filter { $0.care != .intimate }
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

    /// Today's answers with the option chosen, for what went well and where to grow.
    var answeredToday: [(Question, Option)] {
        guard let set else { return [] }
        return (set.questions + (set.evening ?? [])).compactMap { q in
            guard let id = choices[q.id], let o = q.options.first(where: { $0.id == id }) else { return nil }
            return (q, o)
        }
    }

    // MARK: Signing in, the circle and Growing Together

    private(set) var signedIn = false
    private(set) var circle: CircleView?
    private(set) var growing: Growing?
    private(set) var rings: [String: Ring] = [:]

    private var ringStore: RingStore { RingStore(store: defaults) }

    func loadConnect() async {
        signedIn = await api.isSignedIn
        await backup.refresh(signedIn: signedIn)
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

    // MARK: The account (You)

    private(set) var account: AccountDetails?
    /// What just happened to the account, said once on the You screen.
    var accountNote: String?

    func loadAccount() async {
        signedIn = await api.isSignedIn
        guard signedIn else { account = nil; return }
        account = try? await api.account()
    }

    /// Saves a new name or handle; the error says why it was refused.
    func updateProfile(name: String, handle: String) async throws {
        guard let me = account?.account else { return }
        let n = name.trimmingCharacters(in: .whitespaces)
        let h = handle.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "").lowercased()
        let change = AccountChange(name: n == me.name ? nil : n, handle: h.isEmpty || h == me.handle ? nil : h)
        guard change.name != nil || change.handle != nil else { return }
        try await api.updateAccount(change)
        await loadAccount()
    }

    func setSuggest(_ on: Bool) async {
        _ = try? await api.updateAccount(AccountChange(suggest: on))
        await loadAccount()
    }

    /// Quiet nods and Answer Together: one switch, on the device and the account.
    func setConnect(_ on: Bool) async {
        prefs.connect = on
        if signedIn { _ = try? await api.updateAccount(AccountChange(connect: on)) }
    }

    func signOut(session id: String) async throws {
        try await api.signOut(session: id)
        if id == "current" { await signedOutHere() } else { await loadAccount() }
    }

    func deleteAccount() async throws {
        try await api.deleteAccount()
        accountNote = "Your account is deleted. Friends see that you’ve gone, nothing more. This device keeps its own copy until you delete it here too."
        await signedOutHere()
    }

    private func signedOutHere() async {
        account = nil
        circle = nil
        await loadConnect()
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
        if await backup.afterSignIn(sync: me.sync ?? false) == .restored { await reloadAfterRestore() }
        if name.isEmpty { name = me.name }
        await loadConnect()
        await loadAccount()
    }

    func place(_ friend: FriendView, in ring: Ring) {
        ringStore.place(friend.id, in: ring)
        rings = ringStore.all()
    }

    func ring(of friend: FriendView) -> Ring { rings[friend.id] ?? .outer }

    // MARK: Insights

    /// The person's settings, in the web's shape, carried in the backup.
    var prefs: Prefs {
        didSet { PrefStore(store: defaults).save(prefs) }
    }

    /// The Human Pulse: counts of who chose the same, only for someone who
    /// said yes. Off until turned on, as on the web.
    var pulse: Bool {
        get { prefs.pulse }
        set { prefs.pulse = newValue }
    }

    /// Changes when an answer or a tap changes what Insights shows.
    private(set) var insightsVersion = 0

    /// The person's own cards from the last `days`, newest first.
    func insightCards(days: Int) -> [ForYouCard] {
        _ = insightsVersion
        let today = set.map { $0.questions + ($0.evening ?? []) } ?? []
        return Insights.forYou(store: defaults, today: date, days: days, questions: today)
    }

    /// The counts for You're not alone, or nil when they can't be reached.
    func notAloneCounts() async -> [NotAloneQuestion]? {
        try? await api.notAlone(date).questions
    }

    /// The tap under a card: kept with the answer, and sent as a count.
    func rate(_ card: ForYouCard, _ verdict: Verdict) {
        AnswerHistory(store: defaults).setVerdict(verdict, for: card.questionId)
        guard !card.regional else { return }
        Task { try? await api.rate(questionId: card.questionId, optionId: card.optionId, verdict: verdict) }
    }

    /// After a "Not me" reply has been read, the card leaves For You.
    func refreshInsights() { insightsVersion += 1 }


    /// After a restore: everything on screen reads again from the device.
    func reloadAfterRestore() async {
        welcomed = true
        name = defaults.string(forKey: Keys.name) ?? name
        rings = ringStore.all()
        reflect.load()
        prefs = PrefStore(store: defaults).prefs
        insightsVersion += 1
        await refresh()
    }

    // MARK: Reminders

    /// The week ahead's reminders, from what is done today and the intentions due.
    func reminderPlan() -> [PlannedReminder] {
        let done = Set([Sitting.morning, .evening].filter(isDone))
        let minutes = Calendar.current.component(.hour, from: now) * 60 + Calendar.current.component(.minute, from: now)
        return Reminders.plan(reminders.settings, today: date, minutesNow: minutes, doneToday: done,
                              intentionDays: reflect.intentions.filter { $0.check == nil }.map(\.checkOn))
    }

    func setReminders(_ s: ReminderSettings) async {
        await reminders.update(s) { reminderPlan() }
    }

    func rescheduleReminders() async {
        await reminders.schedule(reminderPlan())
    }

    // MARK: Saved

    /// Changes when a card is kept or removed, so Saved and the buttons redraw.
    private(set) var savedVersion = 0
    var notebook: Notebook { _ = savedVersion; return Notebook(store: defaults) }

    /// Keeps a card in Saved, on this device only (and in the backup, if on).
    func keep(prompt: String, questionId: String, theme: String?, intimate: Bool, answer: String, reveal: String, otherSide: String?, step: String?, date: String) {
        let parts = Reveal.split(reveal)
        let verdict = AnswerHistory(store: defaults).answers().first { $0.questionId == questionId }?.verdict
        Notebook(store: defaults).keep(KeptCard(date: date, questionId: questionId, theme: theme ?? "", private: intimate ? true : nil,
                                                prompt: prompt, answer: answer, headline: parts.headline,
                                                body: parts.body.isEmpty ? nil : parts.body, otherSide: otherSide, step: step, verdict: verdict))
        savedVersion += 1
    }

    func unkeep(_ questionId: String) {
        Notebook(store: defaults).remove(questionId)
        savedVersion += 1
    }

    // MARK: The mirror

    /// The month, quarter or year that holds today, from the server.
    func periodMirror(_ period: Period) async throws -> PeriodMirror {
        try await api.periodMirror(period, date: date)
    }

    /// The Outside Mirror, for a signed-in person.
    func outsideMirror() async throws -> OutsideMirror {
        try await api.outsideMirror()
    }

    /// This phone's week, from the server.
    func weekMirror() async throws -> WeekMirror {
        try await api.mirror(date)
    }

    // MARK: Loading and answering

    func refresh() async {
        tick()
        // Signed in is known from the Keychain, so every screen sees it from the start.
        signedIn = await api.isSignedIn
        CardTexts(store: defaults).prune(today: date)
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
        CardTexts(store: defaults).keep(question, optionId: option.id, date: date)
        insightsVersion += 1
        defaults.set(sitting.rawValue, forKey: Keys.unsent + question.id)
        await send(question, optionId: option.id, sitting: sitting)
        // A finished sitting needs no reminder today.
        if isDone(sitting) { await rescheduleReminders() }
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
