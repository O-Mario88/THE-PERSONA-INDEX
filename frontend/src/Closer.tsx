import { useEffect, useState } from 'react'
import { ApiError } from './api'
import type { ReflectionGroup } from './notebook'
import {
  accountToken,
  getCircle,
  getReachOuts,
  getShares,
  postShare,
  sendReachOut,
  SHARE_TEXT_MAX,
  SHARE_TEXT_MIN,
  type FriendView,
  type ReachKind,
  type ShareKind,
  type ThemeOption,
} from './social'
import { Avatar } from './ui/Avatar'

// Closer Together (Connect 3.0): the two ways a person gives something to a
// friend. A share is words they approved, to friends they picked, and can be
// withdrawn; a reach-out is one fixed phrase to one friend. Nothing is ever
// sent without the person pressing the button, and nothing says whether it
// was seen.

const SHARE_NOTE_MAX = 160

const KIND_TITLES: Record<ShareKind, string> = { helped: 'Share what helped', win: 'Share a win' }

function useFriends(): FriendView[] | null {
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  useEffect(() => {
    let live = true
    getCircle().then(
      (c) => live && setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => live && setFriends([]),
    )
    return () => {
      live = false
    }
  }, [])
  return friends
}

function names(list: string[]): string {
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

type ComposerProps = { kind: ShareKind; text: string; onDone: () => void; onCancel: () => void }

export function ShareComposer({ kind, text: initial, onDone, onCancel }: ComposerProps) {
  const friends = useFriends()
  const [themes, setThemes] = useState<ThemeOption[]>([])
  const [text, setText] = useState(initial.trim().slice(0, SHARE_TEXT_MAX))
  const [theme, setTheme] = useState('')
  const [why, setWhy] = useState('')
  const [tryThis, setTryThis] = useState('')
  const [to, setTo] = useState<string[]>([])
  const [sentTo, setSentTo] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getShares().then(
      (s) => live && setThemes(s.themes),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  const words = text.trim()
  const ready = words.length >= SHARE_TEXT_MIN && theme !== '' && to.length > 0

  function share() {
    if (!ready || !friends) return
    const notes = { ...(why.trim() ? { why: why.trim() } : {}), ...(tryThis.trim() ? { try: tryThis.trim() } : {}) }
    postShare({ kind, theme, text: words, ...notes, to }).then(
      () => setSentTo(friends.filter((f) => to.includes(f.id)).map((f) => f.name)),
      (e) => setError(e instanceof ApiError && e.code === 'no_links' ? 'Links can’t be shared here. Say it in your own words.' : 'That didn’t go through. Nothing was shared.'),
    )
  }

  if (sentTo) {
    return (
      <div className="closer-sheet">
        <p role="status" className="notice">
          Shared with {names(sentTo)}. You can withdraw it any time in Connect.
        </p>
        <button type="button" className="btn small" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  return (
    <form
      className="closer-sheet"
      aria-labelledby="share-title"
      onSubmit={(e) => {
        e.preventDefault()
        share()
      }}
    >
      <h3 id="share-title" className="card-title">
        {KIND_TITLES[kind]}
      </h3>
      <label className="field-label" htmlFor="share-words">
        What your friends will see
      </label>
      <textarea id="share-words" className="field" rows={3} maxLength={SHARE_TEXT_MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="muted small">
        Exactly these words, and nothing else from your answers. {SHARE_TEXT_MAX - text.length} characters left.
      </p>

      {kind === 'helped' && (
        <>
          <label className="field-label" htmlFor="share-why">
            Why it helped (optional)
          </label>
          <input id="share-why" className="field" maxLength={SHARE_NOTE_MAX} value={why} onChange={(e) => setWhy(e.target.value)} />
          <label className="field-label" htmlFor="share-try">
            Try it for yourself (optional)
          </label>
          <input id="share-try" className="field" maxLength={SHARE_NOTE_MAX} value={tryThis} onChange={(e) => setTryThis(e.target.value)} />
        </>
      )}

      {themes.length > 0 && (
        <div className="chips" role="group" aria-label="Theme">
          {themes.map((t) => (
            <button key={t.id} type="button" className="chip" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <fieldset className="closer-friends">
        <legend className="field-label">Who sees it</legend>
        {friends === null ? (
          <p className="muted small">Finding your circle…</p>
        ) : friends.length === 0 ? (
          <p className="muted small">Add someone to your circle first.</p>
        ) : (
          friends.map((f) => (
            <label key={f.id} className="closer-friend">
              <input
                type="checkbox"
                checked={to.includes(f.id)}
                onChange={(e) => setTo(e.target.checked ? [...to, f.id] : to.filter((x) => x !== f.id))}
                aria-label={f.name}
              />
              <Avatar name={f.name} size={32} />
              <span>{f.name}</span>
            </label>
          ))
        )}
      </fieldset>

      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
      <div className="closer-actions">
        <button type="submit" className="btn" disabled={!ready}>
          {to.length === 0 ? 'Share' : `Share with ${to.length} ${to.length === 1 ? 'friend' : 'friends'}`}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Keep it private
        </button>
      </div>
    </form>
  )
}

const REACH_TITLES: Record<ReachKind, string> = { support: 'Ask someone for support', celebrate: 'Celebrate a win together' }

type PickerProps = { kind: ReachKind; onDone: () => void; onCancel: () => void }

export function ReachOutPicker({ kind, onDone, onCancel }: PickerProps) {
  const friends = useFriends()
  const [phrases, setPhrases] = useState<ThemeOption[]>([])
  const [to, setTo] = useState('')
  const [phrase, setPhrase] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getReachOuts().then(
      (r) => live && setPhrases(r.phrases[kind] ?? []),
      () => {},
    )
    return () => {
      live = false
    }
  }, [kind])

  function send() {
    if (!to || !phrase) return
    sendReachOut(to, kind, phrase).then(
      () => setSentTo(friends?.find((f) => f.id === to)?.name ?? ''),
      (e) => setError(e instanceof ApiError && e.code === 'already_reached_out' ? 'You’ve sent them one of these today.' : 'That didn’t go through.'),
    )
  }

  if (sentTo) {
    return (
      <div className="closer-sheet">
        <p role="status" className="notice">
          Sent to {sentTo}. They are not asked to reply.
        </p>
        <button type="button" className="btn small" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  return (
    <form
      className="closer-sheet"
      aria-labelledby="reach-title"
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      <h3 id="reach-title" className="card-title">
        {REACH_TITLES[kind]}
      </h3>
      <fieldset className="closer-friends">
        <legend className="field-label">To</legend>
        {friends?.length === 0 && <p className="muted small">Add someone to your circle first.</p>}
        {friends?.map((f) => (
          <label key={f.id} className="closer-friend">
            <input type="radio" name="reach-to" checked={to === f.id} onChange={() => setTo(f.id)} aria-label={f.name} />
            <Avatar name={f.name} size={32} />
            <span>{f.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="closer-phrases">
        <legend className="field-label">Say</legend>
        {phrases.map((p) => (
          <label key={p.id} className="closer-phrase">
            <input type="radio" name="reach-phrase" checked={phrase === p.id} onChange={() => setPhrase(p.id)} />
            <span>{p.label}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
      <div className="closer-actions">
        <button type="submit" className="btn" disabled={!to || !phrase}>
          Send
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Not now
        </button>
      </div>
      <p className="muted small">One of these a day to each friend. You won’t be told whether they saw it.</p>
    </form>
  )
}

type Offer = { label: string; open: { share: ShareKind } | { reach: ReachKind } }

const OFFERS: Record<ReflectionGroup, Offer> = {
  strength: { label: 'Share a win', open: { share: 'win' } },
  learnt: { label: 'Share what helped', open: { share: 'helped' } },
  grow: { label: 'Ask someone for support', open: { reach: 'support' } },
}

const OFFER_LINES: Record<ReflectionGroup, string> = {
  strength: 'Someone in your circle might be glad to hear this.',
  learnt: 'What helped you might help a friend too.',
  grow: 'You don’t have to carry it alone. One person is enough.',
}

// The quiet offer after a reflection is kept. Only for someone signed in;
// "Not now" puts it away for this reflection, and silence is never read as
// anything.
export function AfterReflection({ group, answer }: { group: ReflectionGroup; answer: string }) {
  const [state, setState] = useState<'offer' | 'open' | 'gone'>('offer')
  if (!accountToken() || state === 'gone') return null
  const offer = OFFERS[group]
  if (state === 'open') {
    const close = () => setState('gone')
    return 'share' in offer.open ? (
      <ShareComposer kind={offer.open.share} text={answer} onDone={close} onCancel={close} />
    ) : (
      <ReachOutPicker kind={offer.open.reach} onDone={close} onCancel={close} />
    )
  }
  return (
    <div className="closer-offer" role="group" aria-label="Closer together">
      <p className="muted small">{OFFER_LINES[group]}</p>
      <div className="closer-actions">
        <button type="button" className="btn small outline" onClick={() => setState('open')}>
          {offer.label}
        </button>
        <button type="button" className="text-button" onClick={() => setState('gone')}>
          Not now
        </button>
      </div>
    </div>
  )
}
