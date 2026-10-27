// "Continue with Google" on the website: the whole page goes to Google's own
// sign-in and comes back to this site with an ID token in the address
// fragment (the implicit flow, so the token never passes through a script
// from anywhere but this site, and no client secret is needed). The server
// then checks the token against Google's keys (backend/signin.go, with
// GOOGLE_CLIENT_ID). The phone apps use their own sheet (mobile/src/platform/
// idSignIn.ts).

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'

export type GoogleRequest = { clientId: string; redirectUri: string; state: string; nonce: string }
export type GoogleExpected = { state: string; nonce: string }
export type GoogleReturn = { token: string; givenName?: string } | { error: 'state' | 'nonce' | 'cancelled' }

export function googleAuthUrl({ clientId, redirectUri, state, nonce }: GoogleRequest): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH}?${q}`
}

// The payload of an ID token, unchecked: only to compare the nonce and read
// the first name. Its signature is the server's to check.
function payloadOf(token: string): { nonce?: string; given_name?: string } | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch {
    return null
  }
}

// readGoogleReturn reads the address fragment Google sends back. It is null
// when the fragment is not a reply from Google, and an error when the reply
// is not the one this tab asked for.
export function readGoogleReturn(hash: string, expected: GoogleExpected | null): GoogleReturn | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const token = q.get('id_token')
  if (!token && !q.get('error')) return null
  if (!expected || q.get('state') !== expected.state) return { error: 'state' }
  if (!token) return { error: 'cancelled' }
  const payload = payloadOf(token)
  if (!payload || payload.nonce !== expected.nonce) return { error: 'nonce' }
  return payload.given_name ? { token, givenName: payload.given_name } : { token }
}
