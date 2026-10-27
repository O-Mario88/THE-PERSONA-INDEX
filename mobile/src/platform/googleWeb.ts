// "Continue with Google" when this app is the website: the page goes to
// Google and comes back to the site's front page with an ID token in the
// address (shared googleRedirect.ts). The state and nonce wait in this tab's
// sessionStorage only for that trip; nothing here is kept or backed up.
import { Platform } from 'react-native'
import { googleAuthUrl, readGoogleReturn, type GoogleExpected, type GoogleReturn } from '@shared/googleRedirect'

const TRIP = 'persona.google'
const web = Platform.OS === 'web' && typeof window !== 'undefined'

function random(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Sends the whole page to Google. The promise never settles: the page leaves.
export function startGoogleWeb(clientId: string): Promise<never> {
  const trip: GoogleExpected = { state: random(), nonce: random() }
  sessionStorage.setItem(TRIP, JSON.stringify(trip))
  window.location.assign(googleAuthUrl({ clientId, redirectUri: `${window.location.origin}/`, ...trip }))
  return new Promise<never>(() => {})
}

let taken: GoogleReturn | null | undefined

// takeGoogleReturn reads Google's reply once, then wipes it from the address
// and from sessionStorage so a reload or the back button cannot replay it.
export function takeGoogleReturn(): GoogleReturn | null {
  if (!web) return null
  if (taken !== undefined) return taken
  let expected: GoogleExpected | null = null
  try {
    expected = JSON.parse(sessionStorage.getItem(TRIP) ?? 'null')
  } catch {
    expected = null
  }
  taken = readGoogleReturn(window.location.hash, expected)
  if (taken) {
    sessionStorage.removeItem(TRIP)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }
  return taken
}

// Whether the page just came back from Google, so the app opens on sign-in.
export function backFromGoogle(): boolean {
  return takeGoogleReturn() !== null
}

// Once the sign-in page has used the reply, it is gone for good.
export function doneWithGoogleReturn(): void {
  taken = null
}
