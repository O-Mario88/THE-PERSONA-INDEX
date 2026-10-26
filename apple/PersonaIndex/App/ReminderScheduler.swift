import Foundation
import Observation
import PersonaKit
import UserNotifications

/// Local reminders through the system's notification centre. The plan comes
/// from PersonaKit (`Reminders.plan`); this asks for permission the first
/// time one is turned on, and replaces the pending reminders with the plan.
@MainActor
@Observable
final class ReminderScheduler: NSObject, UNUserNotificationCenterDelegate {
    private(set) var settings: ReminderSettings
    /// The system said no: reminders can't be shown until it's allowed in system settings.
    private(set) var denied = false
    /// Where a tapped reminder asked to go.
    var opened: AppSection?

    private let defaults: KeyValueStore
    private let center = UNUserNotificationCenter.current()

    init(defaults: KeyValueStore) {
        self.defaults = defaults
        settings = ReminderStore(store: defaults).settings
        super.init()
        center.delegate = self
    }

    /// Saves new settings; asks the system first when a reminder is being turned on.
    func update(_ new: ReminderSettings, plan: () -> [PlannedReminder]) async {
        if new.any, !settings.any {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
            denied = !granted
            guard granted else { return }
        }
        settings = new
        ReminderStore(store: defaults).save(new)
        await schedule(plan())
    }

    /// Replaces every pending reminder with the plan.
    func schedule(_ plan: [PlannedReminder]) async {
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Reminders.idPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard settings.any else { return }
        let status = await center.notificationSettings().authorizationStatus
        denied = status == .denied
        guard status == .authorized || status == .provisional else { return }
        for r in plan {
            let parts = r.date.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { continue }
            var when = DateComponents()
            when.year = parts[0]; when.month = parts[1]; when.day = parts[2]
            when.hour = r.minutes / 60; when.minute = r.minutes % 60
            let content = UNMutableNotificationContent()
            content.title = r.title
            content.body = r.body
            content.sound = .default
            content.threadIdentifier = "reminders"
            content.userInfo = ["open": Self.section(for: r.id).rawValue]
            try? await center.add(UNNotificationRequest(identifier: r.id, content: content,
                                                        trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false)))
        }
    }

    static func section(for id: String) -> AppSection { AppSection(rawValue: Reminders.opens(id)) ?? .today }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let raw = response.notification.request.content.userInfo["open"] as? String
        await MainActor.run { opened = raw.flatMap(AppSection.init(rawValue:)) }
    }

    /// Shown even with the app open, quietly.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
}
