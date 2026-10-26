import { useEffect, useState, type FormEvent } from 'react'
import qrcode from 'qrcode-generator'
import { ApiError } from './api'
import { createInvite, inviteLink, joinRoom, openRoom, TAG_NAMES, TAGS, type CircleView, type Tag } from './social'
import { Icon } from './ui/icons'

// Invite & Grow (the new Connect): three ways to bring someone in (a link, a QR
// code, a room code for a team in one place) and how far the circle is from
// the Outside Mirror. Once the mirror is open the card shrinks to the three
// ways in: the page is about the people, not about growing a number.

const NAME_FIRST = 'Add a display name first (Account), so people know who invited them.'

export function hoursLeft(expires: string): string {
  const h = Math.max(0, Math.round((Date.parse(expires) - Date.now()) / 3_600_000))
  return h >= 1 ? `closes in ${h}h` : 'closes within the hour'
}

type Props = { circle: CircleView | null; named: boolean; onChange: () => void; onOpenMirror?: () => void }

export function InviteGrow({ circle, named, onChange, onOpenMirror }: Props) {
  const [panel, setPanel] = useState<'qr' | 'room' | 'why' | null>(null)
  const [tag, setTag] = useState<Tag>('friends')
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const active = circle?.active ?? 0
  const need = circle?.need ?? 3
  const unlocked = active >= need
  const toGo = Math.max(0, need - active)
  const toggle = (p: typeof panel) => setPanel(panel === p ? null : p)

  // One link a day for each tag: the server hands back the same one, so
  // opening Connect again never piles up invitations.
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setNote('Link copied.')
    } catch {
      setNote('Select the link to copy it.')
    }
  }
  async function share() {
    const text = 'Join my circle on The Persona Index: three questions a morning, and a mirror of how friends experience you.'
    try {
      if (navigator.share) await navigator.share({ title: 'The Persona Index', text, url: link })
      else await copy()
    } catch {
      // the share sheet was closed
    }
  }

  return (
    <section className={unlocked ? 'connect-card invite-grow is-compact' : 'connect-card invite-grow'} aria-labelledby="invite-title">
      <div className="invite-body">
        <div className="invite-main">
          <h3 id="invite-title" className="card-title">
            {unlocked ? 'Invite someone' : 'Invite & grow your circle'}
          </h3>
          {unlocked ? (
            onOpenMirror && (
              <button type="button" className="link-button" onClick={onOpenMirror}>
                Your Outside Mirror is open. See it →
              </button>
            )
          ) : (
            <p className="muted small">Three friends who are here this week unlock your Outside Mirror and deeper insights.</p>
          )}
          {named ? (
            <div className="invite-copy">
              <span className="invite-url">{link || 'Making your link…'}</span>
              <button type="button" className="btn small" disabled={!link} onClick={copy}>
                Copy
              </button>
            </div>
          ) : (
            <p className="muted small">{NAME_FIRST}</p>
          )}
          {!unlocked && (
            <div className="invite-progress">
              <ol className="unlock-track" role="img" aria-label={`${active} of ${need} friends active this week`}>
                {Array.from({ length: need }, (_, i) => (
                  <li key={i} className={i < active ? 'is-done' : undefined} />
                ))}
              </ol>
              <p className="small">
                <strong>
                  {Math.min(active, need)} / {need} active friends
                </strong>
                <span className="invite-hero muted">{toGo === 1 ? 'One more friend unlocks your Outside Mirror' : `${toGo} more friends unlock your Outside Mirror`}</span>
              </p>
            </div>
          )}
        </div>
        {named && link && (
          <div className="invite-qr">
            <QR text={link} size={96} label="Your invite link as a QR code" />
            <span className="small muted">Scan to join</span>
          </div>
        )}
      </div>

      <div className="circle-tiles" role="group" aria-label="Bring someone in">
        <button type="button" className="circle-tile" disabled={!link} onClick={share}>
          <Icon name="link" />
          <span>Share link</span>
        </button>
        <button type="button" className="circle-tile" aria-pressed={panel === 'qr'} onClick={() => toggle('qr')}>
          <Icon name="qr" />
          <span>My QR</span>
        </button>
        <button type="button" className="circle-tile" aria-pressed={panel === 'room'} onClick={() => toggle('room')}>
          <Icon name="room" />
          <span>Room code</span>
        </button>
        {!unlocked && (
          <button type="button" className="circle-tile" aria-pressed={panel === 'why'} onClick={() => toggle('why')}>
            <Icon name="lock" />
            <span>Why three?</span>
          </button>
        )}
      </div>
      <ul className="invite-why" aria-label="Why invite">
        <li>
          <Icon name="leaf" size={16} /> Discover what you have in common
        </li>
        <li>
          <Icon name="leaf" size={16} /> Learn from what helps them
        </li>
        <li>
          <Icon name="leaf" size={16} /> Be a source of encouragement
        </li>
      </ul>
      {note && (
        <p className="small muted" role="status">
          {note}
        </p>
      )}

      {panel === 'qr' &&
        (named ? (
          <div className="card invite-panel">
            <TagPicker tag={tag} onTag={setTag} label="They’ll be in your circle as" />
            {link && <QR text={link} />}
            <p className="muted small">Works for 30 days. Following it connects you both; you can mute or disconnect anytime.</p>
          </div>
        ) : (
          <p className="card soft">{NAME_FIRST}</p>
        ))}
      {panel === 'why' && (
        <p className="card soft small">
          With one or two friends you could work out who said what. Three or more keeps every answer anonymous, by arithmetic, not by promise.
          Friends who were in the app this week and aren’t muted count.
        </p>
      )}
      {panel === 'room' && <RoomPanel circle={circle} onChange={onChange} named={named} />}

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
    </section>
  )
}

export function TagPicker({ tag, onTag, label }: { tag: Tag; onTag: (t: Tag) => void; label: string }) {
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

export function QR({ text, size = 180, label = 'QR code for your invite link' }: { text: string; size?: number; label?: string }) {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
  return (
    <svg className="qr" role="img" aria-label={label} viewBox={`0 0 ${n + 4} ${n + 4}`} width={size} height={size}>
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
        setNote(`You’re in ${r.host ? `${r.host}’s` : 'the'} room. Everyone inside shows under “People you may know”: connect with whoever you choose.`)
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
      {note && (
        <p className="small" role="status">
          {note}
        </p>
      )}
    </div>
  )
}

export { NAME_FIRST }
