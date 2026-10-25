import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'
import { CommonGround } from './CommonGround'
import { InviteGrow, NAME_FIRST, TagPicker } from './InviteGrow'
import { SignInSheet } from './SignIn'
import { load } from './storage'
import { CloserTogether, SupportCelebrate } from './SupportCelebrate'
import { WhatHelped } from './WhatHelped'
import {
  acceptInvite,
  connectTo,
  disconnect,
  dismissSuggestion,
  dropInvite,
  getCircle,
  INVITE_KEY,
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
import { Growing } from './Growing'
import type { Question } from './api'
import { loadRings, placeIn, RING_NAMES, ringOf, type Ring, type Rings } from './rings'
import { RingPicker, RingsCard } from './RingsCard'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'

// Connect (Connect 3.0, Edwin, 2026-10-25): a private space for
// understanding, encouragement and meaningful connection. Four sections,
// no feed: Your Circle, Our Common Ground, What Helped Us and Support &
// Celebrate, with at most two quiet "Closer together" cards above them and
// Invite & Grow below. Friends see only a name, a handle and the tag they
// were given; muting is silent; nobody is connected without both choosing it.

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

type ScreenProps = { onOpenMirror?: () => void; today?: string; questions?: Question[] }

export function CircleScreen({ onOpenMirror, today, questions = [] }: ScreenProps) {
  const me = useAccount()
  const [circle, setCircle] = useState<CircleView | null>(null)
  const [error, setError] = useState('')
  const [rings, setRings] = useState(loadRings)

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
          <p className="label">Connect</p>
          <h2 id="circle-title" className="display">
            Your circle
          </h2>
          <p>A private space for understanding, encouragement and meaningful connection.</p>
        </header>
        <InviteWaiting onJoined={refresh} />
        <p className="muted">
          Three friends unlock your Outside Mirror: how the people around you experience you, blended so no one answer can
          be traced. Friends never see your answers or your readings.
        </p>
        <SignInSheet title="Sign in to start your circle." lead="No password: one tap or a 6-digit code. Your answers stay as private as they are now." onDone={() => {}} />
        {today && <Growing date={today} questions={questions} circle={null} />}
      </section>
    )
  }

  const friends = circle?.friends ?? []

  return (
    <section className="circle connect" aria-labelledby="connect-title">
      <header className="page-head">
        <p className="label">Connect{me.handle ? ` · @${me.handle}` : ''}</p>
        <h2 id="connect-title" className="display">
          Connect
        </h2>
        <p>A private space for understanding, encouragement and meaningful connection.</p>
      </header>

      <div className="circle-stats card" role="group" aria-label="Your circle in numbers">
        <p className="circle-stat">
          <span className="stat-num">{friends.length}</span>
          <span className="stat-name">People in your circle</span>
        </p>
        <p className="circle-stat">
          <span className="stat-num">{circle?.active ?? 0}</span>
          <span className="stat-name">Active this week</span>
        </p>
      </div>

      <InviteWaiting onJoined={refresh} />
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {friends.length > 0 && <CloserTogether friends={friends} rings={rings} />}

      <div className="connect-grid">
        <YourCircle circle={circle} rings={rings} onChange={refresh} onPlace={(id, r) => setRings(placeIn(id, r))} />
        {friends.length > 0 && <CommonGround friends={friends} />}
        {friends.length > 0 && <WhatHelped />}
        <InviteGrow circle={circle} named={!!me.name} onChange={refresh} onOpenMirror={onOpenMirror} />
        {friends.length > 0 && <SupportCelebrate today={today} />}
      </div>

      {today && <Growing date={today} questions={questions} circle={circle} />}

      <p className="connect-tagline">A little closer. A little stronger. Together.</p>
      <p className="muted small">
        Friends see that you’re connected and the circle tag you gave them. Never your answers, your readings, or who else
        is here. Anything more is only what you choose to share, with the people you choose.
      </p>
    </section>
  )
}

type CircleProps = { circle: CircleView | null; rings: Rings; onChange: () => void; onPlace: (id: string, r: Ring) => void }

function YourCircle({ circle, rings, onChange, onPlace }: CircleProps) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const friends = circle?.friends ?? []
  const q = query.trim().toLowerCase()
  const shown = q ? friends.filter((f) => f.name.toLowerCase().includes(q) || (f.handle ?? '').toLowerCase().includes(q)) : friends

  return (
    <section className="connect-card your-circle" aria-labelledby="circle-title">
      <h3 id="circle-title" className="card-title">
        Your circle
      </h3>
      {friends.length > 0 && <RingsCard friends={friends} rings={rings} />}
      {friends.length > 0 && (
        <label className="circle-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            className="field"
            aria-label="Search people in your circle"
            placeholder="Search people in your circle…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {TAGS.filter((t) => shown.some((f) => f.tag === t)).map((t) => {
        const inTag = shown.filter((f) => f.tag === t)
        const active = inTag.filter((f) => f.active && !f.muted).length
        return (
          <details key={t} className="tag-group" open={!!q}>
            <summary>
              <span className="tag-name">
                {TAG_NAMES[t]} ({inTag.length})
              </span>
              <span className="tag-count">{active} active this week</span>
            </summary>
            <ul className="people-list">
              {inTag.map((f) => (
                <FriendRow key={f.id} friend={f} onChange={onChange} ring={ringOf(rings, f.id)} onPlace={(r) => onPlace(f.id, r)} />
              ))}
            </ul>
          </details>
        )
      })}

      {(circle?.suggestions.length ?? 0) > 0 && (
        <div className="group" role="group" aria-labelledby="suggest-title">
          <h4 id="suggest-title" className="label">
            People you may know
          </h4>
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
                <button type="button" className="btn small" onClick={() => connectTo(s.id, 'friends').then(onChange, () => setError('That didn’t go through. Try again.'))}>
                  Connect
                </button>
                <button type="button" className="icon-button" aria-label={`Not ${s.name}`} onClick={() => dismissSuggestion(s.id).then(onChange, () => {})}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {friends.length === 0 && !circle?.suggestions.length && circle && (
        <p className="muted">No one yet. Share your link with two or three people you see often: a link works for 30 days.</p>
      )}
      {error && <p className="muted small">{error}</p>}
    </section>
  )
}

function FriendRow({ friend: f, onChange, ring, onPlace }: { friend: FriendView; onChange: () => void; ring: Ring; onPlace: (r: Ring) => void }) {
  const [open, setOpen] = useState(false)
  const set = (p: { tag?: Tag; muted?: boolean }) => patchFriend(f.id, p).then(onChange, () => {})
  return (
    <li className={`person-row${f.muted ? ' is-muted' : ''}`}>
      <Avatar name={f.name} muted={f.muted} size={40} />
      <button type="button" className="person-text as-button" aria-label={f.name} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="person-name">{f.name}</span>
        <span className="person-sub">{f.muted ? 'Silently muted · they’ll never know' : `${TAG_NAMES[f.tag]} · since ${shortDate(f.since)}`}</span>
        {!f.muted && <span className="person-sub">{f.active ? 'Active this week' : 'Not seen this week'} · {RING_NAMES[ring]}</span>}
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
          <RingPicker name={f.name} ring={ring} onPlace={onPlace} />
          <div className="chips labelled" role="group" aria-label={`How you know ${f.name}`}>
            <span className="chips-label">How you know them</span>
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
