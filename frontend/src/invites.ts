// Following an invite (found on the iPhone, 2026-10-29). The app makes and
// shares links (personaindex.com/c/<code>); this is how a person follows one:
// from a link that opens the app, or a link or code they paste in. The code
// waits on this device (pi.invite) until they accept or say not now.
import { INVITE_KEY } from './social'
import { load, save } from './storage'

const CODE = /^[a-z2-9]{10}$/
const IN_LINK = /\/c\/([a-z2-9]{10})(?=$|[/?#\s])/i
const IN_QUERY = /[?&]invite=([a-z2-9]{10})(?=$|[&#\s])/i

// The invite code in a shared message, a link, or the bare code; null if none.
export function inviteCodeIn(text: string): string | null {
  const t = text.trim()
  const found = t.match(IN_LINK) ?? t.match(IN_QUERY)
  const code = (found ? found[1] : t).toLowerCase()
  return CODE.test(code) ? code : null
}

export function keepInvite(code: string): void {
  save(INVITE_KEY, code)
}

export function pendingInvite(): string | null {
  const code = load(INVITE_KEY)
  return code && CODE.test(code) ? code : null
}

const ACCEPT_ERRORS: Record<string, string> = {
  no_invite: 'That invite has expired or was already used. Ask them for a new link.',
  own_invite: 'That’s your own invite link. Send it to someone you trust.',
  name_needed: 'Add your name in You first, so they know who you are.',
}

export function acceptError(code: string): string {
  return ACCEPT_ERRORS[code] ?? 'That didn’t go through. Try again in a moment.'
}
