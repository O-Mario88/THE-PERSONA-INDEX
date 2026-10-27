// "Continue with Apple" and "Continue with Google" in the app. Each hands
// back an ID token that the server checks against Apple's or Google's keys
// (backend/signin.go), exactly as the web's buttons do; only how the token is
// fetched differs. A button shows only when the server takes the app's tokens
// (APPLE_APP_IDS, GOOGLE_APP_CLIENT_IDS) and this build knows its own IDs.
//
// Build settings (an EAS secret or a local .env):
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID      the iOS OAuth client
//   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  the Android OAuth client
// On the website the server's own web client (GOOGLE_CLIENT_ID, sent as
// googleClientId) is used, through a full-page trip to Google (googleWeb.ts).
import * as AppleAuthentication from 'expo-apple-authentication'
import { AuthRequest, ResponseType, exchangeCodeAsync, type DiscoveryDocument } from 'expo-auth-session'
import { Platform } from 'react-native'
import type { SignInMethods } from '@shared/social'
import { startGoogleWeb } from './googleWeb'

const BUNDLE_ID = 'com.personaindex.app'

const google: DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
}

function googleClientId(): string {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? ''
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? ''
  return ''
}

export type Providers = { google: boolean; apple: boolean }

// Which buttons this phone can show.
export async function appProviders(m: SignInMethods | null): Promise<Providers> {
  const apple = Platform.OS === 'ios' && !!m?.appleApp && (await AppleAuthentication.isAvailableAsync().catch(() => false))
  if (Platform.OS === 'web') return { google: !!m?.google && !!m.googleClientId, apple: false }
  return { google: !!m?.googleApp && googleClientId() !== '', apple }
}

// Thrown when the person closes the sheet: not an error to show.
export class Cancelled extends Error {}

export type IdToken = { token: string; givenName?: string }

export async function appleToken(): Promise<IdToken> {
  try {
    const c = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    })
    if (!c.identityToken) throw new Error('no identity token')
    // Apple sends the name only the first time; it fills in the name step.
    return { token: c.identityToken, givenName: c.fullName?.givenName ?? undefined }
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new Cancelled()
    throw e
  }
}

// Google's own sign-in page in the system browser sheet, with PKCE; the code
// comes back to the app by its bundle ID and is swapped for an ID token. On
// the website the page goes to Google instead and the token arrives when it
// comes back (SignUp reads it).
export async function googleToken(m: SignInMethods | null): Promise<IdToken> {
  if (Platform.OS === 'web') return startGoogleWeb(m?.googleClientId ?? '')
  const clientId = googleClientId()
  const req = new AuthRequest({
    clientId,
    redirectUri: `${BUNDLE_ID}:/oauthredirect`,
    scopes: ['openid', 'email', 'profile'],
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: { prompt: 'select_account' },
  })
  const r = await req.promptAsync(google)
  if (r.type === 'cancel' || r.type === 'dismiss') throw new Cancelled()
  if (r.type !== 'success' || !r.params.code) throw new Error('google sign-in failed')
  const t = await exchangeCodeAsync(
    { clientId, code: r.params.code, redirectUri: req.redirectUri, extraParams: { code_verifier: req.codeVerifier ?? '' } },
    google,
  )
  if (!t.idToken) throw new Error('no id token')
  return { token: t.idToken }
}
