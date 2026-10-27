import { describe, expect, it } from 'vitest'
import { googleAuthUrl, readGoogleReturn } from './googleRedirect'

// A Google ID token's shape: header.payload.signature, base64url. Only the
// payload matters here; the server checks the signature (backend/signin.go).
const token = (payload: object) =>
  ['e30', btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'sig'].join('.')

describe('Continue with Google on the website', () => {
  it("sends the person to Google's own page for an ID token, back to this site", () => {
    const url = new URL(googleAuthUrl({ clientId: 'web-client.apps.googleusercontent.com', redirectUri: 'https://personaindex.com/', state: 's1', nonce: 'n1' }))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'web-client.apps.googleusercontent.com',
      redirect_uri: 'https://personaindex.com/',
      response_type: 'id_token',
      scope: 'openid email profile',
      state: 's1',
      nonce: 'n1',
      prompt: 'select_account',
    })
  })

  it('takes the token back only with the state and nonce it sent', () => {
    const good = token({ nonce: 'n1', given_name: 'Ama' })
    expect(readGoogleReturn(`#state=s1&id_token=${good}`, { state: 's1', nonce: 'n1' })).toEqual({ token: good, givenName: 'Ama' })
    // Another tab's or an attacker's state, a replayed token, or nothing sent at all.
    expect(readGoogleReturn(`#state=s2&id_token=${good}`, { state: 's1', nonce: 'n1' })).toEqual({ error: 'state' })
    expect(readGoogleReturn(`#state=s1&id_token=${token({ nonce: 'old' })}`, { state: 's1', nonce: 'n1' })).toEqual({ error: 'nonce' })
    expect(readGoogleReturn(`#state=s1&id_token=${good}`, null)).toEqual({ error: 'state' })
  })

  it('says when the person turned Google down, and ignores ordinary addresses', () => {
    expect(readGoogleReturn('#state=s1&error=access_denied', { state: 's1', nonce: 'n1' })).toEqual({ error: 'cancelled' })
    expect(readGoogleReturn('', { state: 's1', nonce: 'n1' })).toBeNull()
    expect(readGoogleReturn('#top', null)).toBeNull()
    expect(readGoogleReturn('#state=s1&id_token=not-a-token', { state: 's1', nonce: 'n1' })).toEqual({ error: 'nonce' })
  })
})
