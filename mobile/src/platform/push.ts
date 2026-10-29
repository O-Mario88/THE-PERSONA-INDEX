// Notices when someone you trust reaches out, on this phone (Edwin,
// 2026-10-29: "tackle that now"). Turning them on asks the phone's
// permission, gets this phone's push address from Expo and gives it to the
// server for the person signed in (backend/notify.go); turning them off takes
// it back. Tapping a notice opens Connect. The web build has none.
//
// The push address needs the app's Expo project id (app.json
// expo.extra.eas.projectId, made by `eas init`). Until it is set, the option
// is not offered at all rather than failing.
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { pushState, savePush } from '@shared/push'
import { registerPush, turnOffPushHere } from '@shared/social'

const native = Platform.OS === 'ios' || Platform.OS === 'android'
const CHANNEL = 'people'

const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId ?? (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined)

export const pushAvailable = native && !!projectId

const ADDRESS_WAIT_MS = 15_000 // the push address can hang without a network; never leave a spinner

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    )
  })
}

async function addressHere(): Promise<string> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'People you trust', importance: Notifications.AndroidImportance.DEFAULT })
  }
  return (await within(Notifications.getExpoPushTokenAsync({ projectId }), ADDRESS_WAIT_MS)).data
}

export type PushResult = 'on' | 'denied' | 'failed'

export async function turnOnPush(): Promise<PushResult> {
  if (!pushAvailable) return 'failed'
  try {
    const asked = await within(Notifications.requestPermissionsAsync(), 120_000) // the phone's own prompt waits for the person
    if (!asked.granted) {
      savePush({ ...pushState(), on: false })
      return 'denied'
    }
    const token = await addressHere()
    await registerPush(token, Platform.OS === 'ios' ? 'ios' : 'android')
    savePush({ ...pushState(), on: true, token })
    return 'on'
  } catch {
    return 'failed'
  }
}

export async function turnOffPush(): Promise<void> {
  await turnOffPushHere()
}

// After signing in, or when the phone's address changes, the server hears the
// current address for the person signed in now.
export async function refreshPush(): Promise<void> {
  const s = pushState()
  if (!pushAvailable || !s.on) return
  try {
    const perm = await Notifications.getPermissionsAsync()
    if (!perm.granted) return
    const token = await addressHere()
    await registerPush(token, Platform.OS === 'ios' ? 'ios' : 'android')
    if (token !== s.token) savePush({ ...s, token })
  } catch {
    // tried again next time the app opens
  }
}

// open runs when someone taps a notice about people (also one that opened the app).
export function onPeopleNotice(open: () => void): () => void {
  if (!native) return () => {}
  const isPeople = (r: Notifications.NotificationResponse | null) => r?.notification.request.content.data?.open === 'connect'
  Notifications.getLastNotificationResponseAsync().then(
    (r) => {
      if (isPeople(r)) {
        open()
        Notifications.clearLastNotificationResponseAsync?.().catch(() => {})
      }
    },
    () => {},
  )
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    if (isPeople(r)) open()
  })
  return () => sub.remove()
}
