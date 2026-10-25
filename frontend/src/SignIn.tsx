import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from './ui/icons'
import { Restore } from './Backup'
import { ApiError } from './api'
import { patchAccount, sendCode, signInMethods, signInWithID, verifyCode, type AccountView, type SignInMethods } from './social'

// The sign-in sheet (Stage 5, "lazy accounts"): offered once, after the
// third card, and from the Circle and Account. No password: Google, Apple,
// or a 6-digit code to an email or a phone. "Not now" keeps everything on
// this phone, as before. Only the ways the server can really use are shown.

const ERRORS: Record<string, string> = {
  invalid_address: 'That doesn’t look like an email, or a phone number with its country code (+256…).',
  wrong_code: 'That code didn’t match. Check the newest message, or send a new code.',
  rate_limited: 'Too many tries. Wait a few minutes, then try again.',
  sign_in_unavailable: 'Signing in isn’t switched on here yet. Everything stays on this phone.',
  invalid_id_token: 'That sign-in didn’t go through. Try again.',
  login_taken: 'That sign-in already belongs to another account.',
  invalid_name: 'A name of 1 to 40 letters, please.',
  invalid_handle: 'A handle of 3 to 20 letters, numbers or underscores.',
  handle_taken: 'That handle is taken. Try another.',
}

function why(e: unknown): string {
  return e instanceof ApiError ? (ERRORS[e.code] ?? 'Something went wrong. Try again in a moment.') : 'You seem to be offline. Try again soon.'
}

type Step = { at: 'start' } | { at: 'code'; address: string; kind: 'email' | 'phone' } | { at: 'name'; me: AccountView }

export function SignInSheet({
  title = 'Keep it on every device.',
  lead = 'Signing in syncs your Notebook across devices and unlocks your Circle Mirror. No password — one tap or a 6-digit code.',
  onDone,
  onNotNow,
  overlay,
  card,
  page,
}: {
  page?: { label: string; title: string; lead: string; tiles?: { date: string; tint?: string }[] } // the full login page (M20)
  overlay?: boolean // full screen over the close, as in the design (M04)
  card?: { area: string; line: string } // the sitting's first card, shown above the sheet
  title?: string
  lead?: string
  onDone: (me: AccountView) => void
  onNotNow?: () => void
}) {
  const [methods, setMethods] = useState<SignInMethods | null>(null)
  const [step, setStep] = useState<Step>({ at: 'start' })
  const [address, setAddress] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [via, setVia] = useState<'email' | 'phone' | 'whatsapp'>('email')
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    let live = true
    signInMethods().then(
      (m) => live && setMethods(m),
      () => live && setMethods({ email: false, phone: false, google: false, apple: false }),
    )
    return () => {
      live = false
    }
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(why(e))
    } finally {
      setBusy(false)
    }
  }

  const finish = (me: AccountView) => (me.name ? onDone(me) : setStep({ at: 'name', me }))

  function send(e: FormEvent) {
    e.preventDefault()
    const a = address.trim()
    if (!a) return
    run(async () => {
      const { kind } = await sendCode(a)
      setCode('')
      setStep({ at: 'code', address: a, kind })
    })
  }

  function verify(e: FormEvent) {
    e.preventDefault()
    if (step.at !== 'code') return
    run(async () => finish((await verifyCode(step.address, code.trim())).account))
  }

  function provider(p: 'google' | 'apple') {
    run(async () => {
      const token = await idTokenFrom(p, methods)
      finish((await signInWithID(p, token)).account)
    })
  }

  function saveName(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    run(async () => onDone(await patchAccount({ name: n, ...(handle.trim() ? { handle: handle.trim().replace(/^@/, '') } : {}) })))
  }

  const codes = methods && (methods.email || methods.phone)
  const none = methods && !codes && !methods.google && !methods.apple
  const placeholder = methods?.email && methods.phone ? 'ama@example.com or +256…' : methods?.phone ? '+256 …' : 'ama@example.com'

  const sheet = (
    <section className="sheet signin" aria-labelledby="signin-title">
      {step.at === 'start' && (
        <>
          <h2 id="signin-title" className="title serif">
            {title}
          </h2>
          <p className="muted">{lead}</p>
          {!methods && <p className="muted small">One moment…</p>}
          {none && <p className="notice">{ERRORS.sign_in_unavailable}</p>}
          {methods?.google && (
            <button type="button" className="btn wide" disabled={busy} onClick={() => provider('google')}>
              Continue with Google
            </button>
          )}
          {methods?.apple && (
            <button type="button" className="btn wide" disabled={busy} onClick={() => provider('apple')}>
              Continue with Apple
            </button>
          )}
          {codes && (
            <form className="signin-code" onSubmit={send}>
              <label htmlFor="signin-address" className="small muted">
                {methods.email && methods.phone ? 'Or email, phone or WhatsApp number' : methods.phone ? 'Your phone number, with its country code' : 'Or your email'}
              </label>
              <div className="row-gap">
                <input
                  id="signin-address"
                  className="field grow"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="email"
                  inputMode="email"
                />
                <button type="submit" className="btn terracotta" disabled={busy || !address.trim()}>
                  Send code
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {step.at === 'code' && (
        <form onSubmit={verify} className="signin-code-step">
          <p className="label">{step.kind === 'phone' ? 'Check your messages' : 'Check your email'}</p>
          <h2 id="signin-title" className="title serif">
            We sent a 6-digit code to {step.address}
          </h2>
          <p className="muted">It works for 10 minutes. Nothing to type back, just the six digits.</p>
          <label htmlFor="signin-code" className="sr-only">
            The code
          </label>
          <div className="code-boxes">
            <input
              id="signin-code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
            />
            <span className="code-cells" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={i === Math.min(code.length, 5) ? 'code-cell is-next' : 'code-cell'}>
                  {code[i] ?? ''}
                </span>
              ))}
            </span>
          </div>
          <p className="small muted code-again">
            Didn’t get it?{' '}
            <button type="button" className="link-button" onClick={() => setStep({ at: 'start' })}>
              Use a different address
            </button>
          </p>
          <p className="code-device">
            <Icon name="lock" size={18} />
            <span>This device will be added to your account. You can sign it out any time from Account, under Sign-in &amp; devices.</span>
          </p>
          <button type="submit" className="btn wide" disabled={busy || code.length !== 6}>
            Continue
          </button>
        </form>
      )}
      {step.at === 'name' && (
        <form onSubmit={saveName}>
          <h2 id="signin-title" className="title serif">
            What should friends call you?
          </h2>
          <p className="muted">A display name and a handle are the only two things friends ever see.</p>
          <label className="field-label">
            <span className="small muted">Display name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" />
          </label>
          <label className="field-label">
            <span className="small muted">Handle for invites (optional)</span>
            <input className="field" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={21} placeholder="@ama" />
          </label>
          <button type="submit" className="btn wide" disabled={busy || !name.trim()}>
            Done
          </button>
          <button type="button" className="link-button" onClick={() => onDone(step.me)}>
            Later
          </button>
        </form>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {onNotNow && step.at === 'start' && (
        <button type="button" className="link-button strong" onClick={onNotNow}>
          Not now — keep it on this phone
        </button>
      )}
      <p className="muted small center signin-keep">We keep a display name, a handle and your encrypted Notebook. Nothing else.</p>
    </section>
  )
  if (page && step.at === 'start') {
    const both = methods?.email && methods.phone
    const kind = methods && !methods.email ? (via === 'email' ? 'phone' : via) : methods && !methods.phone ? 'email' : via
    const tabs: { id: 'email' | 'phone' | 'whatsapp'; name: string }[] = [
      { id: 'email', name: 'Email' },
      { id: 'phone', name: 'Phone' },
      { id: 'whatsapp', name: 'WhatsApp' },
    ]
    return (
      <section className="signin-page" aria-labelledby="signin-title">
        <header className="signin-hero">
          <p className="signin-brand">
            <span className="signin-mark" aria-hidden="true">
              P
            </span>
            The Persona Index
          </p>
          <div className="signin-hero-words">
            <p className="signin-hero-label">{page.label}</p>
            <h2 id="signin-title">{page.title}</h2>
            <p className="signin-hero-lead">{page.lead}</p>
          </div>
          {page.tiles && (
            <ol className="m-week-tiles signin-tiles" aria-hidden="true">
              {page.tiles.map((t) => (
                <li key={t.date} style={t.tint ? { background: t.tint } : undefined} />
              ))}
            </ol>
          )}
        </header>
        <div className="signin-page-body">
          {restoring ? (
            <div className="signin-restore">
              <h3 className="title serif">Your 12-word recovery phrase</h3>
              <Restore onCancel={() => setRestoring(false)} />
            </div>
          ) : (
            <>
              {!methods && <p className="muted small">One moment…</p>}
              {none && <p className="notice">{ERRORS.sign_in_unavailable}</p>}
              {(methods?.google || methods?.apple) && (
                <div className="signin-providers">
                  {methods?.google && (
                    <button type="button" className="signin-provider is-dark" disabled={busy} onClick={() => provider('google')}>
                      <Icon name="plus-circle" size={18} />
                      Continue with Google
                    </button>
                  )}
                  {methods?.apple && (
                    <button type="button" className="signin-provider" disabled={busy} onClick={() => provider('apple')}>
                      <Icon name="apple" size={18} />
                      Continue with Apple
                    </button>
                  )}
                </div>
              )}
              {codes && (
                <>
                  {(methods.google || methods.apple) && (
                    <p className="signin-or">
                      <span>or get a code</span>
                    </p>
                  )}
                  <form className="signin-code signin-code-page" onSubmit={send}>
                    {both && (
                      <div className="signin-tabs" role="group" aria-label="Send the code by">
                        {tabs.map((t) => (
                          <button key={t.id} type="button" className="signin-tab" aria-pressed={via === t.id} onClick={() => setVia(t.id)}>
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <label htmlFor="signin-address" className="signin-field-label">
                      {kind === 'email' ? 'Email address' : kind === 'whatsapp' ? 'WhatsApp number, with its country code' : 'Phone number, with its country code'}
                    </label>
                    <input
                      id="signin-address"
                      className="signin-field"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={kind === 'email' ? 'ama@example.com' : '+256 …'}
                      autoComplete={kind === 'email' ? 'email' : 'tel'}
                      inputMode={kind === 'email' ? 'email' : 'tel'}
                    />
                    <button type="submit" className="signin-send" disabled={busy || !address.trim()}>
                      Send my 6-digit code
                    </button>
                  </form>
                </>
              )}
              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
          <div className="signin-page-foot">
            {!restoring && (
              <button type="button" className="link-button signin-lost" onClick={() => setRestoring(true)}>
                Lost access? Use your 12-word recovery phrase
              </button>
            )}
            <p>Signing in syncs your encrypted Notebook to this device. We keep a display name, a handle and that bundle — nothing else.</p>
          </div>
        </div>
      </section>
    )
  }
  if (!overlay) return sheet
  return (
    <div className="signin-overlay">
      <div className="signin-stack" aria-hidden="true">
        <span className="signin-stack-back" />
        <span className="signin-stack-mid" />
        {card && (
          <span className="signin-stack-card">
            <span className="signin-stack-area">{card.area}</span>
            <span className="signin-stack-line">{card.line}</span>
          </span>
        )}
      </div>
      {sheet}
    </div>
  )
}

// ---- Google and Apple: their own scripts, loaded only when tapped ----

function script(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => ok()
    s.onerror = () => fail(new ApiError(0, 'invalid_id_token'))
    document.head.appendChild(s)
  })
}

type GoogleId = {
  accounts: { id: { initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void; prompt: () => void } }
}
type AppleId = { auth: { init: (o: Record<string, unknown>) => void; signIn: () => Promise<{ authorization: { id_token: string } }> } }

async function idTokenFrom(p: 'google' | 'apple', m: SignInMethods | null): Promise<string> {
  const w = window as unknown as { google?: GoogleId; AppleID?: AppleId }
  if (p === 'google') {
    await script('https://accounts.google.com/gsi/client')
    return new Promise((ok) => {
      w.google!.accounts.id.initialize({ client_id: m?.googleClientId ?? '', callback: (r) => ok(r.credential) })
      w.google!.accounts.id.prompt()
    })
  }
  await script('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js')
  w.AppleID!.auth.init({ clientId: m?.appleClientId ?? '', scope: 'email', redirectURI: location.origin, usePopup: true })
  return (await w.AppleID!.auth.signIn()).authorization.id_token
}
