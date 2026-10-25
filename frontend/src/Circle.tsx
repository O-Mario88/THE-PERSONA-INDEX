import { useCallback, useEffect, useState, type FormEvent } from 'react'
import qrcode from 'qrcode-generator'
import { ApiError } from './api'
import { SignInSheet } from './SignIn'
import { load } from './storage'
import {
  acceptInvite,
  connectTo,
  createInvite,
  disconnect,
  dismissSuggestion,
  dropInvite,
  getCircle,
  INVITE_KEY,
  inviteLink,
  joinRoom,
  openRoom,
  patchFriend,
  peekInvite,
  TAG_NAMES,
  TAGS,
  type CircleView,
  type FriendView,
  type InvitePeek,
  type Tag,
} from './social'
import { useAccount } from './useAccount'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'

// The Circle tab (Stage 5): the people you're connected with, three ways to
// bring someone in (a link, a QR code, a room code for a team in one place),
// and people you might know. Three friends unlock the Outside Mirror.
// Friends see only a name, a handle and the tag they were given; muting is
// silent; nobody is ever connected without both of them choosing it.

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function hoursLeft(expires: string): string {
  const h = Math.max(0, Math.round((Date.parse(expires) - Date.now()) / 3_600_000))
  return h >= 1 ? `closes in ${h}h` : 'closes within the hour'
}

export function CircleScreen({ onOpenMirror }: { onOpenMirror?: () => void }) {
  const me = useAccount()
  const [circle, setCircle] = useState<CircleView | null>(null)
  const [error, setError] = useState('')
  const [panel, setPanel] = useState<'link' | 'qr' | 'room' | 'why' | null>(null)

  const refresh = useCallback(() => {
    getCircle().then(
      (c) => {
        setCircle(c)
        setError('')
      },
      (e) => setError(e instanceof ApiError && e.status === 401 ? '' : 'I couldn’t load your circle. Try again in a moment.'),
    )
  }, [])
  useEffect(() => {
    if (me) refresh()
  }, [me, refresh])

  if (!me) {
    return (
      <section className="circle" aria-labelledby="circle-title">
        <header className="page-head">
          <p className="label">Your circle</p>
          <h2 id="circle-title" className="display">
            Your circle
          </h2>
        </header>
        <InviteWaiting onJoined={refresh} />
        <p className="muted">
          Three friends unlock your Outside Mirror: how the people around you experience you, blended so no one answer can
          be traced. Friends never see your answers or your readings.
        </p>
        <SignInSheet title="Sign in to start your circle." lead="No password: one tap or a 6-digit code. Your answers stay as private as they are now." onDone={() => {}} />
      </section>
    )
  }

  const friends = circle?.friends ?? []
  const need = circle?.need ?? 3
  const unlocked = (circle?.active ?? 0) >= need
  const toGo = Math.max(0, need - (circle?.active ?? 0))

  return (
    <section className="circle" aria-labelledby="circle-title">
      <header className="page-head row-between">
        <div>
          <p className="label">Your circle{me.handle ? ` · @${me.handle}` : ''}</p>
          <h2 id="circle-title" className="display">
            {friends.length === 1 ? '1 connected' : `${friends.length} connected`}
          </h2>
          <p>Friends see you in ways you don’t.</p>
        </div>
        <div className="row-gap head-actions">
          <button type="button" className="icon-button" aria-label="Join with a room code" onClick={() => setPanel(panel === 'room' ? null : 'room')}>
            <Icon name="scan" size={22} />
          </button>
          <button type="button" className="icon-button" aria-label="Invite someone" onClick={() => setPanel(panel === 'link' ? null : 'link')}>
            <Icon name="user-plus" size={22} />
          </button>
        </div>
      </header>

      <div className="stat-tiles" role="group" aria-label="Your circle in numbers">
        <p className="stat-tile">
          <span className="stat-num">{friends.length}</span>
          <span className="stat-name">People</span>
        </p>
        <p className="stat-tile">
          <span className="stat-num">{new Set(friends.map((f) => f.tag)).size}</span>
          <span className="stat-name">Groups</span>
        </p>
        <p className="stat-tile">
          <span className="stat-num">{circle?.active ?? 0}</span>
          <span className="stat-name">Active this week</span>
        </p>
      </div>

      <InviteWaiting onJoined={refresh} />

      <div className={unlocked ? 'circle-hero is-open' : 'circle-hero'}>
        <span className="icon-disc is-solid" aria-hidden="true">
          <Icon name="connect" size={24} />
        </span>
        <div className="circle-hero-words">
          <p className="circle-hero-title">
            {unlocked
              ? 'Three friends are here. Your Outside Mirror fills as they answer'
              : toGo === 1
                ? 'One more friend unlocks your Outside Mirror'
                : `${toGo} more friends unlock your Outside Mirror`}
          </p>
          {unlocked && onOpenMirror ? (
            <button type="button" className="link-button" onClick={onOpenMirror}>
              See it in your mirror →
            </button>
          ) : (
            <button type="button" className="link-button" aria-expanded={panel === 'why'} onClick={() => setPanel(panel === 'why' ? null : 'why')}>
              Why three? →
            </button>
          )}
          <ol className="unlock-track" role="img" aria-label={`${circle?.active ?? 0} of ${need} friends active this week`}>
            {Array.from({ length: need }, (_, i) => (
              <li key={i} className={i < (circle?.active ?? 0) ? 'is-done' : undefined} />
            ))}
          </ol>
        </div>
      </div>
      {panel === 'why' && (
        <p className="card soft small">
          With one or two friends you could work out who said what. Three or more keeps every answer anonymous, by
          arithmetic, not by promise. Friends who were in the app this week and aren’t muted count.
        </p>
      )}

      <div className="circle-tiles" role="group" aria-label="Bring someone in">
        <button type="button" className="circle-tile" aria-pressed={panel === 'link'} onClick={() => setPanel(panel === 'link' ? null : 'link')}>
          <Icon name="link" />
          <span>Share link</span>
        </button>
        <button type="button" className="circle-tile" aria-pressed={panel === 'qr'} onClick={() => setPanel(panel === 'qr' ? null : 'qr')}>
          <Icon name="qr" />
          <span>My QR</span>
        </button>
        <button type="button" className="circle-tile" aria-pressed={panel === 'room'} onClick={() => setPanel(panel === 'room' ? null : 'room')}>
          <Icon name="room" />
          <span>Room code</span>
        </button>
      </div>

      {(panel === 'link' || panel === 'qr') && <InvitePanel qr={panel === 'qr'} named={!!me.name} />}
      {panel === 'room' && <RoomPanel circle={circle} onChange={refresh} named={!!me.name} />}

      {circle?.room && panel !== 'room' && (
        <div className="room-card">
          <div>
            <p className="small">Open room · {TAG_NAMES[circle.room.tag].toLowerCase()}</p>
            <p className="room-code">{circle.room.code}</p>
          </div>
          <p className="small right">
            {circle.room.inside} inside
            <br />
            {hoursLeft(circle.room.expires)}
          </p>
        </div>
      )}

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {friends.length > 0 && (
        <section className="group" aria-labelledby="connected-title">
          <h3 id="connected-title" className="label">
            Connected
          </h3>
          {TAGS.filter((t) => friends.some((f) => f.tag === t)).map((t) => {
            const inTag = friends.filter((f) => f.tag === t)
            return (
              <details key={t} className="tag-group" open>
                <summary>
                  <span className="tag-name">{TAG_NAMES[t]}</span>
                  <span className="tag-count">{inTag.length}</span>
                </summary>
                <ul className="people-list">
                  {inTag.map((f) => (
                    <FriendRow key={f.id} friend={f} onChange={refresh} />
                  ))}
                </ul>
              </details>
            )
          })}
        </section>
      )}

      {(circle?.suggestions.length ?? 0) > 0 && (
        <section className="group" aria-labelledby="suggest-title">
          <h3 id="suggest-title" className="label">
            People in your circle
          </h3>
          <ul className="people-list">
            {circle!.suggestions.map((s) => (
              <li key={s.id} className="person-row">
                <Avatar name={s.name} size={40} />
                <span className="person-text">
                  <span className="person-name">{s.name}</span>
                  <span className="person-sub">
                    {s.asked ? 'Asked to connect with you' : s.room ? `In room ${s.room}` : `Knows ${(s.mutual ?? []).slice(0, 2).join(' and ')}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => connectTo(s.id, 'friends').then(refresh, () => setError('That didn’t go through. Try again.'))}
                >
                  Connect
                </button>
                <button type="button" className="icon-button" aria-label={`Not ${s.name}`} onClick={() => dismissSuggestion(s.id).then(refresh, () => {})}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {friends.length === 0 && !circle?.suggestions.length && circle && (
        <p className="muted">No one yet. Share your link with two or three people you see often: a link works for 30 days.</p>
      )}

      <p className="muted small">
        Friends see that you’re connected and the circle tag you gave them. Never your answers, your readings, or who else
        is here.
      </p>
    </section>
  )
}

function FriendRow({ friend: f, onChange }: { friend: FriendView; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const set = (p: { tag?: Tag; muted?: boolean }) => patchFriend(f.id, p).then(onChange, () => {})
  return (
    <li className={`person-row${f.muted ? ' is-muted' : ''}`}>
      <Avatar name={f.name} muted={f.muted} size={40} />
      <button type="button" className="person-text as-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="person-name">{f.name}</span>
        <span className="person-sub">{f.muted ? 'Silently muted · they’ll never know' : `${TAG_NAMES[f.tag]} · since ${shortDate(f.since)}`}</span>
      </button>
      {f.muted ? (
        <button type="button" className="btn small ghost" onClick={() => set({ muted: false })}>
          Unmute
        </button>
      ) : (
        <button type="button" className="icon-button" aria-label={`Mute ${f.name}`} onClick={() => set({ muted: true })}>
          <Icon name="mute" size={18} />
        </button>
      )}
      {open && (
        <div className="person-more">
          <div className="chips" role="group" aria-label={`How you know ${f.name}`}>
            {TAGS.map((t) => (
              <button key={t} type="button" className="chip-toggle" aria-pressed={f.tag === t} onClick={() => set({ tag: t })}>
                {TAG_NAMES[t]}
              </button>
            ))}
          </div>
          <button type="button" className="link-button" onClick={() => disconnect(f.id).then(onChange, () => {})}>
            Disconnect from {f.name}
          </button>
          <p className="muted small">Muting and disconnecting are silent. {f.name} is never told.</p>
        </div>
      )}
    </li>
  )
}

function TagPicker({ tag, onTag, label }: { tag: Tag; onTag: (t: Tag) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {TAGS.map((t) => (
        <button key={t} type="button" className="chip-toggle" aria-pressed={tag === t} onClick={() => onTag(t)}>
          {TAG_NAMES[t]}
        </button>
      ))}
    </div>
  )
}

const NAME_FIRST = 'Add a display name first (Account), so people know who invited them.'

function InvitePanel({ qr, named }: { qr: boolean; named: boolean }) {
  const [tag, setTag] = useState<Tag>('friends')
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!named) return
    let live = true
    createInvite(tag).then(
      (i) => live && setLink(inviteLink(i.code)),
      () => live && setNote('I couldn’t make a link just now.'),
    )
    return () => {
      live = false
    }
  }, [tag, named])
  if (!named) return <p className="card soft">{NAME_FIRST}</p>
  async function share() {
    const text = 'Join my circle on The Persona Index: three questions a morning, and a mirror of how friends experience you.'
    try {
      if (navigator.share) await navigator.share({ title: 'The Persona Index', text, url: link })
      else {
        await navigator.clipboard.writeText(link)
        setNote('Link copied.')
      }
    } catch {
      // the share sheet was closed
    }
  }
  return (
    <div className="card invite-panel">
      <TagPicker tag={tag} onTag={setTag} label="They’ll be in your circle as" />
      {qr && link && <QR text={link} />}
      {link && <p className="invite-link">{link}</p>}
      {!qr && (
        <button type="button" className="btn wide" disabled={!link} onClick={share}>
          Share link
        </button>
      )}
      <p className="muted small">Works for 30 days. Following it connects you both; you can mute or disconnect anytime.</p>
      {note && <p className="small" role="status">{note}</p>}
    </div>
  )
}

export function QR({ text, size = 180 }: { text: string; size?: number }) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
  return (
    <svg className="qr" role="img" aria-label="QR code for your invite link" viewBox={`0 0 ${n + 4} ${n + 4}`} width={size} height={size}>
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#1f3a33" />
    </svg>
  )
}

function RoomPanel({ circle, onChange, named }: { circle: CircleView | null; onChange: () => void; named: boolean }) {
  const [code, setCode] = useState('')
  const [tag, setTag] = useState<Tag>('work')
  const [note, setNote] = useState('')
  if (!named) return <p className="card soft">{NAME_FIRST}</p>
  function join(e: FormEvent) {
    e.preventDefault()
    joinRoom(code).then(
      (r) => {
        setNote(`You’re in ${r.host ? `${r.host}’s` : 'the'} room. Everyone inside shows under “People in your circle”: connect with whoever you choose.`)
        setCode('')
        onChange()
      },
      (err) => setNote(err instanceof ApiError && err.code === 'no_room' ? 'No open room has that code.' : 'That didn’t go through. Try again.'),
    )
  }
  return (
    <div className="card room-panel">
      <form onSubmit={join}>
        <label htmlFor="room-code" className="small muted">
          Join a room: type the code on the screen
        </label>
        <div className="row-gap">
          <input id="room-code" className="field grow" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LIMA-42" autoCapitalize="characters" />
          <button type="submit" className="btn" disabled={code.trim().length < 6}>
            Join
          </button>
        </div>
      </form>
      {circle?.room ? (
        <p className="small">
          Your room <strong className="room-code inline">{circle.room.code}</strong> is open: {circle.room.inside} inside, {hoursLeft(circle.room.expires)}.
        </p>
      ) : (
        <>
          <p className="small muted">Or open one for a team in the same place. It lasts 24 hours.</p>
          <TagPicker tag={tag} onTag={setTag} label="The room is for" />
          <button type="button" className="btn wide outline" onClick={() => openRoom(tag).then(onChange, () => setNote('I couldn’t open a room just now.'))}>
            Open a room
          </button>
        </>
      )}
      {circle?.joined.map((r) => (
        <p key={r.code} className="small muted">
          In {r.host ?? 'a'}’s room {r.code} · {r.inside} inside
        </p>
      ))}
      {note && <p className="small" role="status">{note}</p>}
    </div>
  )
}

// InviteWaiting turns a followed invite link into a connection once the
// person is signed in: "Ama invited you to their circle".
function InviteWaiting({ onJoined }: { onJoined: () => void }) {
  const me = useAccount()
  const [code] = useState(() => load(INVITE_KEY))
  const [peek, setPeek] = useState<InvitePeek | null>(null)
  const [tag, setTag] = useState<Tag>('friends')
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!code) return
    peekInvite(code).then(
      (p) => {
        setPeek(p)
        setTag(p.tag)
      },
      () => {
        dropInvite()
        setGone(true)
      },
    )
  }, [code])
  if (!code || gone || !peek) return null
  return (
    <div className="card invite-waiting" role="region" aria-label="An invitation">
      <p>
        <strong>{peek.name}</strong> invited you to their circle.
      </p>
      {me ? (
        <>
          <TagPicker tag={tag} onTag={setTag} label={`How you know ${peek.name}`} />
          <div className="row-gap">
            <button
              type="button"
              className="btn small"
              disabled={!me.name}
              onClick={() =>
                acceptInvite(code, tag).then(
                  () => {
                    dropInvite()
                    setGone(true)
                    onJoined()
                  },
                  () => {
                    dropInvite()
                    setGone(true)
                  },
                )
              }
            >
              Join {peek.name}’s circle
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                dropInvite()
                setGone(true)
              }}
            >
              Not now
            </button>
          </div>
          {!me.name && <p className="muted small">{NAME_FIRST}</p>}
        </>
      ) : (
        <p className="muted small">Sign in below to join. Your answers stay as private as they are now.</p>
      )}
    </div>
  )
}
