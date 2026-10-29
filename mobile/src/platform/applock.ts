// The phone's side of the privacy curtain (shared appLock.ts): the phone's
// own check of its owner (face, fingerprint or passcode), the cover in the app
// switcher, and the quiet icon. All of it on the phone; nothing is sent.
import { Platform } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import * as ScreenCapture from 'expo-screen-capture'
import { setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons'
import type { QuietIcon } from '@shared/appLock'

// face / finger: the phone checks a face or a fingerprint (its passcode
// still works); passcode: only the passcode; none: the phone has no lock.
export type OwnerCheck = 'face' | 'finger' | 'passcode' | 'none'

export async function ownerCheck(): Promise<OwnerCheck> {
  if (Platform.OS === 'web') return 'none'
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync()
    if (level === LocalAuthentication.SecurityLevel.NONE) return 'none'
    if (await LocalAuthentication.isEnrolledAsync()) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face'
      if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'finger'
    }
    return 'passcode'
  } catch {
    return 'none'
  }
}

// What the phone calls its check, inside a sentence.
export function checkName(c: OwnerCheck): string {
  if (c === 'face') return Platform.OS === 'ios' ? 'Face ID' : 'your face'
  if (c === 'finger') return Platform.OS === 'ios' ? 'Touch ID' : 'your fingerprint'
  return 'your passcode'
}

// ok: it was the owner; cancelled: they stopped it; failed: it didn't match.
export type Checked = 'ok' | 'cancelled' | 'failed'

export async function confirmOwner(promptMessage: string): Promise<Checked> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel', disableDeviceFallback: false })
    if (r.success) return 'ok'
    return r.error === 'user_cancel' || r.error === 'system_cancel' || r.error === 'app_cancel' ? 'cancelled' : 'failed'
  } catch {
    return 'failed'
  }
}

// The cover: on an iPhone the app switcher sees a blur instead of the page;
// on Android the window is marked secure, which blanks the preview and also
// stops screenshots inside the app.
export async function applyCover(on: boolean): Promise<void> {
  try {
    if (Platform.OS === 'ios') await (on ? ScreenCapture.enableAppSwitcherProtectionAsync(1) : ScreenCapture.disableAppSwitcherProtectionAsync())
    else if (Platform.OS === 'android') await (on ? ScreenCapture.preventScreenCaptureAsync('cover') : ScreenCapture.allowScreenCaptureAsync('cover'))
  } catch {
    // the cover is a help, never a reason to fail
  }
}

export const quietIconsHere = (): boolean => Platform.OS !== 'web' && supportsAlternateIcons

const NATIVE_ICON: Record<QuietIcon, string | null> = { usual: null, pebble: 'Pebble', horizon: 'Horizon' }

export async function setQuietIcon(icon: QuietIcon): Promise<boolean> {
  if (!quietIconsHere()) return false
  try {
    await setAlternateAppIcon(NATIVE_ICON[icon])
    return true
  } catch {
    return false
  }
}
