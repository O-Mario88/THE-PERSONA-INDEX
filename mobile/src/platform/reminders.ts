// Reminders as the phone's own local notifications: planned here from the
// shared plan (frontend/src/reminders.ts) and handed to the system, so no
// server, push key or account is involved and nothing is sent. They are all
// on, with nothing to switch (Edwin, 2026-10-29): the phone asks its owner
// once, at the end of the first sitting, and its own settings can silence them.
import * as Notifications from 'expo-notifications'
import { AppState, Platform } from 'react-native'
import { localDate, type Sitting } from '@shared/day'
import { intentions } from '@shared/notebook'
import { REMINDER_PREFIX, planReminders, reminderSettings, setReminderTimes, type PlannedReminder, type ReminderSettings } from '@shared/reminders'
import { onChange } from '@shared/storage'
import { windowsDone } from '@shared/windows'

export type Opens = PlannedReminder['opens']

const native = Platform.OS === 'ios' || Platform.OS === 'android'
const CHANNEL = 'reminders'

if (native) {
  // Shown even with the app open, quietly.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  })
}

// Whether this phone can show reminders at all (the web build cannot).
export const remindersAvailable = native

// The plan for the week ahead, from what is done today and the check-ins due.
function plan(now = new Date()): PlannedReminder[] {
  const today = localDate(now)
  const w = windowsDone(today)
  const done = new Set<Sitting>()
  if (w.morning !== undefined) done.add('morning')
  if (w.evening !== undefined) done.add('evening')
  const due = intentions()
    .filter((i) => !i.check)
    .map((i) => i.checkOn)
  return planReminders(reminderSettings(), today, now.getHours() * 60 + now.getMinutes(), done, due)
}

let running: Promise<void> = Promise.resolve()

// schedule replaces every pending reminder with the plan, one run at a time.
export function schedule(): Promise<void> {
  running = running.then(scheduleNow, scheduleNow)
  return running
}

async function scheduleNow() {
  if (!native) return
  const pending = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(pending.filter((n) => n.identifier.startsWith(REMINDER_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
  const perm = await Notifications.getPermissionsAsync()
  if (!perm.granted) return
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT })
  }
  for (const r of plan()) {
    const [y, m, d] = r.date.split('-').map(Number)
    const at = new Date(y, m - 1, d, Math.floor(r.minutes / 60), r.minutes % 60)
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { opens: r.opens }, threadIdentifier: 'reminders' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    })
  }
}

// The phone's answer: on (allowed), off (its owner said no, so only its own
// settings can turn them on), or unasked.
export type ReminderPermission = 'on' | 'off' | 'unasked' | 'none'

export async function reminderPermission(): Promise<ReminderPermission> {
  if (!native) return 'none'
  const p = await Notifications.getPermissionsAsync()
  return p.granted ? 'on' : p.canAskAgain ? 'unasked' : 'off'
}

// Asks the phone once, if it hasn't been asked, then plans every reminder.
export async function askForReminders(): Promise<ReminderPermission> {
  if (!native) return 'none'
  let now = await reminderPermission()
  if (now === 'unasked') now = (await Notifications.requestPermissionsAsync()).granted ? 'on' : (await reminderPermission())
  await schedule()
  return now
}

export async function changeReminderTimes(times: Partial<Pick<ReminderSettings, 'morningAt' | 'eveningAt'>>): Promise<void> {
  setReminderTimes(times)
  await schedule()
}

// startReminders plans again whenever the app comes back, a sitting is done
// or an intention changes, and passes on where a tapped reminder opens.
export function startReminders(open: (where: Opens) => void): () => void {
  if (!native) return () => {}
  void schedule()
  let timer: ReturnType<typeof setTimeout> | undefined
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void schedule(), 1000)
  }
  const offStore = onChange((k) => {
    if (k.startsWith('pi.windows.') || k.startsWith('pi.nb.intention.')) soon()
  })
  const app = AppState.addEventListener('change', (s) => s === 'active' && soon())
  const tapped = (r: Notifications.NotificationResponse | null) => {
    const where = r?.notification.request.content.data?.opens
    if (where === 'today' || where === 'mirrors' || where === 'reflect') open(where)
    // Once handled, a remount must not open it again.
    if (r) Notifications.clearLastNotificationResponse()
  }
  Notifications.getLastNotificationResponseAsync().then(tapped, () => {})
  const sub = Notifications.addNotificationResponseReceivedListener(tapped)
  return () => {
    clearTimeout(timer)
    offStore()
    app.remove()
    sub.remove()
  }
}

export { reminderSettings }
