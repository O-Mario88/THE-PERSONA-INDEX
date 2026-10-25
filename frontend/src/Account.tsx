import { useEffect, useState } from 'react'
import { ApiError } from './api'
import { blackOn, connectOn, pulseOn, type Prefs } from './prefs'
import { SignInSheet } from './SignIn'
import { TapestryCard, weekTiles } from './TapestryViews'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'
import { mondayOf } from './profile'
import { deleteAccount, getAccount, patchAccount, signOut, type AccountDetails, type LoginView } from './social'
import { syncOff, syncOn, pullSync } from './sync'
import { useAccount } from './useAccount'

// Account (the Stage 5 screens, "Ama · @ama"): the two things friends see,
// how this account signs in and where, the person's choices, what is kept
// and for how long, and the ways out. Signed out, it is "This phone", and
// everything stays here, as before.

function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: string
  note: string
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        <span className="toggle-note">{note}</span>
      </span>
      <input type="checkbox" role="switch" className="switch-input" checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Choices({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const without = <K extends keyof Prefs>(k: K): Prefs => {
    const next = { ...prefs }
    delete next[k]
    return next
  }
  return (
    <section className="group" aria-labelledby="choices-title">
      <h3 id="choices-title" className="label">
        Choices
      </h3>
      <Toggle
        label="Dark mode"
        note="Navy through the evening and night, and whenever your phone is set to dark."
        on={blackOn(prefs)}
        onChange={(on) => onChange(on ? without('black') : { ...prefs, black: false })}
      />
      <Toggle
        label="Show me the Human Pulse"
        note="Anonymous totals of how others answered. Off hides every number."
        on={pulseOn(prefs)}
        onChange={(on) => onChange({ ...prefs, pulse: on })}
      />
      <Toggle
        label="Quiet nods & Answer Together"
        note="Off means friends can't send you either. They won't be told."
        on={connectOn(prefs)}
        onChange={(on) => onChange(on ? without('connect') : { ...prefs, connect: false })}
      />
      {prefs.adult === true && (
        <Toggle
          label="Keep it mild (no intimacy questions)"
          note="Leaves intimacy questions out of every sitting not yet started."
          on={prefs.mild}
          onChange={(on) => onChange({ ...prefs, mild: on })}
        />
      )}
      <Toggle
        label="Reduce motion"
        note="Cards appear at once instead of unfolding in three beats."
        on={prefs.still === true}
        onChange={(on) => onChange(on ? { ...prefs, still: true } : without('still'))}
      />
    </section>
  )
}

const LOGIN_NAMES: Record<LoginView['kind'], string> = { google: 'Google', apple: 'Apple', email: 'Email code', phone: 'Phone / WhatsApp code' }

// What the server keeps for an account, and for how long. Plain words for
// the retention in backend/worker.go (social_retention) and social.go.
const KEPT: [string, string][] = [
  ['Readings, plans, Notebook', 'Encrypted · until you delete'],
  ['Who’s in your circle', 'Until you disconnect'],
  ['Friend answers about you', 'The week only, no sender · 35 days'],
  ['That you answered a friend question', 'The date only, no question or option · 35 days'],
  ['Nods & Answer Together', 'Nods 35 days, Answer Together 3 days · never counted'],
  ['Human Pulse totals', 'Anonymous counts only'],
]

export function AccountScreen({
  prefs,
  onChange,
  onOpenSettings,
  onOpenKept,
  today,
}: {
  today?: string
  prefs: Prefs
  onChange: (p: Prefs) => void
  onOpenSettings: () => void
  onOpenKept: () => void
}) {
  const me = useAccount()
  const [details, setDetails] = useState<AccountDetails | null>(null)
  const [name, setName] = useState(me?.name ?? '')
  const [handle, setHandle] = useState(me?.handle ? `@${me.handle}` : '')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () =>
    getAccount().then(
      (d) => {
        setDetails(d)
        setName(d.account.name)
        setHandle(d.account.handle ? `@${d.account.handle}` : '')
      },
      () => {},
    )
  const signedIn = !!me
  useEffect(() => {
    if (signedIn) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn])

  // Quiet nods & Answer Together: one switch, on the phone and the account.
  function changeChoices(next: Prefs) {
    onChange(next)
    if (me && connectOn(next) !== connectOn(prefs)) patchAccount({ connect: connectOn(next) }).catch(() => {})
  }

  async function saveProfile() {
    if (!me) return
    const n = name.trim()
    const h = handle.trim().replace(/^@/, '').toLowerCase()
    if (n === me.name && h === me.handle) return
    try {
      await patchAccount({ ...(n !== me.name ? { name: n } : {}), ...(h && h !== me.handle ? { handle: h } : {}) })
      setNote('Saved.')
    } catch (e) {
      setNote(
        e instanceof ApiError && e.code === 'handle_taken'
          ? 'That handle is taken.'
          : e instanceof ApiError && e.code === 'invalid_handle'
            ? 'A handle is 3 to 20 letters, numbers or underscores.'
            : e instanceof ApiError && e.code === 'invalid_name'
              ? 'A name of 1 to 40 letters, please.'
              : 'That didn’t save. Try again.',
      )
    }
  }

  async function toggleSync(on: boolean) {
    setBusy(true)
    try {
      await (on ? syncOn() : syncOff())
      setNote(on ? 'Your Notebook now syncs to every device you sign in on.' : 'Sync is off. Your backup stays under your 12 words.')
    } catch {
      setNote('That didn’t go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount() {
    setBusy(true)
    try {
      await deleteAccount()
      setConfirm(false)
      setNote('Your account is deleted. Friends see that you’ve gone, nothing more. This phone keeps its own copy until you delete it here too.')
    } catch {
      setNote('I couldn’t reach the server, so nothing was deleted. Try again soon.')
    } finally {
      setBusy(false)
    }
  }

  const sessions = (me && details?.sessions) || []
  return (
    <section className={me ? 'account' : 'account signed-out'} aria-labelledby={me ? 'account-title' : 'signin-title'}>
      {!me && (
        <SignInSheet
          page={{
            label: 'Sign in, or come back',
            title: 'Your Notebook is waiting.',
            lead: 'No password to remember. One tap, or a 6-digit code to your email, phone or WhatsApp.',
            ...(today ? { tiles: weekTiles(today, mondayOf(today)) } : {}),
          }}
          onDone={(acc) => {
            pullSync(acc.sync).catch(() => {})
          }}
        />
      )}
      {me && (
        <header className="profile-head">
          <div className="wordmark-row">
            <p className="label">Your profile</p>
            <button type="button" className="icon-button" aria-label="Settings" onClick={onOpenSettings}>
              <Icon name="gear" size={22} />
            </button>
          </div>
          <div className="profile-id">
            <Avatar name={me.name || 'You'} size={84} />
            <div>
              <h2 id="account-title" className="display">
                {me.name ? `${me.name}${me.handle ? ` · @${me.handle}` : ''}` : 'Your account'}
              </h2>
              <p className="muted small">
                {me.sync ? 'Everything synced' : 'Notebook on this phone'} · {sessions.length || 1} device{sessions.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </header>
      )}
      {me && today && <TapestryCard today={today} />}
      <div className="two-col">
        <div className="col">
          {me && (
            <>
              <section className="group" aria-labelledby="profile-title">
                <h3 id="profile-title" className="label">
                  Profile · the only two things friends see
                </h3>
                <div className="profile-fields">
                  <label className="field-label">
                    <span className="small muted">Display name</span>
                    <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={saveProfile} />
                  </label>
                  <label className="field-label">
                    <span className="small muted">Handle for invites</span>
                    <input className="field" value={handle} maxLength={21} onChange={(e) => setHandle(e.target.value)} onBlur={saveProfile} placeholder="@ama" />
                  </label>
                </div>
              </section>
              <section className="group" aria-labelledby="devices-title">
                <h3 id="devices-title" className="label">
                  Sign-in & devices
                </h3>
                <ul className="kept-list">
                  {(me && details?.logins)?.map((l) => (
                    <li key={l.kind + l.hint} className="kept-row">
                      <span>
                        <span className="toggle-label">{LOGIN_NAMES[l.kind]}</span>
                        <span className="toggle-note">{l.hint}</span>
                      </span>
                      <span className="small ok">Connected</span>
                    </li>
                  ))}
                  {sessions.map((x) => (
                    <li key={x.id} className="kept-row">
                      <span>
                        <span className="toggle-label">{x.label || 'A device'}</span>
                        <span className="toggle-note">{x.current ? 'Now' : `Last here ${x.seenOn}`}</span>
                      </span>
                      {x.current ? (
                        <span className="small muted">This device</span>
                      ) : (
                        <button type="button" className="btn small ghost" onClick={() => signOut(x.id).then(refresh, () => {})}>
                          Sign out there
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <Toggle
                  label="Sync my Notebook across devices"
                  note="Keeps your 12 words with your account, sealed, so a new phone restores by signing in. The server could open them; off, only the words can."
                  on={me.sync}
                  onChange={(on) => !busy && toggleSync(on)}
                />
                <Toggle
                  label="Suggest me to friends of friends"
                  note="Off, only someone with your link or room code can find you."
                  on={me.suggest}
                  onChange={(on) => patchAccount({ suggest: on }).catch(() => {})}
                />
                <button type="button" className="link-button" onClick={() => signOut('current').catch(() => {})}>
                  Sign out on this device
                </button>
              </section>
            </>
          )}
          <Choices prefs={prefs} onChange={changeChoices} />
          <section className="group" aria-label="More">
            <button type="button" className="row-button" onClick={onOpenSettings}>
              Settings: intimacy questions, your words, where you live, your people, backup and lock
            </button>
          </section>
        </div>
        <div className="col">
          {me && (
            <section className="card kept-card" aria-labelledby="keep-title">
              <h3 id="keep-title" className="label">
                What we keep, for how long
              </h3>
              <dl className="kept-table">
                {KEPT.map(([what, how]) => (
                  <div key={what}>
                    <dt>{what}</dt>
                    <dd>{how}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <button type="button" className="btn wide outline" onClick={onOpenKept}>
            {me ? 'Export my Notebook, or delete what this phone keeps' : 'What I keep, and how to delete it'}
          </button>
          <button type="button" className="btn wide outline" onClick={onOpenSettings}>
            Show my 12-word recovery phrase
          </button>
          {me && (
            <section className="card danger-card" aria-labelledby="delete-title">
              <h3 id="delete-title" className="title">
                Delete my account
              </h3>
              <p className="small">
                One tap wipes your account, the answers on the server, your circle and every friend answer about you.
                Friends only see that you’ve gone.
              </p>
              {confirm ? (
                <div className="row-gap">
                  <button type="button" className="btn small danger" disabled={busy} onClick={removeAccount}>
                    Yes, delete it
                  </button>
                  <button type="button" className="btn small ghost" onClick={() => setConfirm(false)}>
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" className="btn small outline danger-outline" onClick={() => setConfirm(true)}>
                  Delete my account
                </button>
              )}
            </section>
          )}
          {note && (
            <p className="small" role="status">
              {note}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
