import { useEffect, useState } from 'react'
import { ApiError, recalledChoice, type Question } from './api'
import { shareable, useNods } from './friendsData'
import {
  answerTogether,
  askTogether,
  friendVote,
  getCircle,
  leaveTogether,
  sendNod,
  type FriendToday,
  type FriendView,
  type TogetherView,
} from './social'
import { useAccount } from './useAccount'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'

// The circle inside the day (Stage 5): today's friend question at midday, a
// quiet nod at night, and Answer Together. None of it is scored, counted or
// pushed: it waits for the next time the person opens the app.

// ---- today's friend question ----

export function FriendQuestion({
  date,
  today,
  onCircle,
  onAnswered,
}: {
  date: string
  today: FriendToday | null
  onCircle: () => void
  onAnswered: () => void
}) {
  const me = useAccount()
  const [chose, setChose] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [error, setError] = useState('')
  if (!me) {
    return (
      <div className="card soft friend-invite">
        <p className="strong">Friends see you in ways you don’t.</p>
        <p className="muted small">Sign in and bring three friends: each midday you answer one question about one of them, and they about you, blended so no one answer can be traced.</p>
        <button type="button" className="btn small" onClick={onCircle}>
          Start your circle
        </button>
      </div>
    )
  }
  if (!today) return null
  if (!today.open) {
    const toGo = Math.max(1, today.need - today.have)
    return (
      <div className="card soft friend-invite">
        <p className="strong">{toGo === 1 ? 'One more friend' : `${toGo} more friends`} and the midday friend question begins.</p>
        <p className="muted small">With three, no answer can be traced to anyone.</p>
        <button type="button" className="btn small" onClick={onCircle}>
          Invite someone
        </button>
      </div>
    )
  }
  const f = today.friend!
  const q = today.question!
  if (skipped) return null
  if (today.answered || chose) {
    return (
      <div className="card soft" role="status">
        <p className="strong">Thank you. That goes into {f.name}’s Outside Mirror.</p>
        <p className="muted small">Anonymous: blended with at least two other friends, never shown on its own, and never who said it.</p>
      </div>
    )
  }
  function pick(optionId: string) {
    setError('')
    friendVote(date, f.id, q.id, optionId).then(
      () => {
        setChose(optionId)
        onAnswered()
      },
      (e) => {
        if (e instanceof ApiError && e.code === 'already_answered') setChose(optionId)
        else setError('That didn’t go through. Try again.')
      },
    )
  }
  return (
    <section className="card friend-q" aria-labelledby="friend-q-title">
      <p className="friend-q-head">
        <Avatar name={f.name} size={28} />
        <span>
          <strong>Today’s friend · {f.name}</strong> · {f.tag} · one question
        </span>
      </p>
      <h2 id="friend-q-title" className="prompt serif">
        {q.prompt}
      </h2>
      <div className="options">
        {q.options.map((o) => (
          <button key={o.id} type="button" className="option" onClick={() => pick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className="muted small row-between">
        <span>
          <Icon name="lock" size={14} /> Anonymous · blended after 3 friends
        </span>
        <button type="button" className="link-button" onClick={() => setSkipped(true)}>
          Skip today
        </button>
      </p>
    </section>
  )
}

// ---- quiet nods ----

// The four cards offered tonight: the same all evening, different each day.
function tonightsCards(cards: string[], date: string): number[] {
  let h = 0
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const out: number[] = []
  for (let i = 0; out.length < Math.min(4, cards.length); i++) {
    const c = (h + i * 7) % cards.length
    if (!out.includes(c)) out.push(c)
  }
  return out
}

export function NodPicker({ date }: { date: string }) {
  const me = useAccount()
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  const nods = useNods(date)
  const [to, setTo] = useState<string | null>(null)
  const [card, setCard] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const [sent, setSent] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!me?.connect) return
    getCircle().then(
      (c) => setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => setFriends([]),
    )
  }, [me])
  if (!me?.connect || !friends?.length || !nods) return null
  const already = [...nods.sentTo, ...sent]
  const offered = all ? nods.cards.map((_, i) => i) : tonightsCards(nods.cards, date)
  function send() {
    if (to === null || card === null) return
    sendNod(to, card, date).then(
      () => {
        setSent([...sent, to])
        setTo(null)
        setCard(null)
      },
      (e) => setError(e instanceof ApiError && e.code === 'already_nodded' ? 'You’ve nodded to them today.' : 'That didn’t go through.'),
    )
  }
  return (
    <section className="nod-picker" aria-labelledby="nod-title">
      <h3 id="nod-title" className="title">
        Send a quiet nod before bed?
      </h3>
      <p className="muted small">Optional · no reply needed, nothing to keep up.</p>
      <div className="chips" role="group" aria-label="To">
        {friends.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip-toggle with-avatar"
            aria-pressed={to === f.id}
            disabled={already.includes(f.id)}
            onClick={() => setTo(to === f.id ? null : f.id)}
          >
            <Avatar name={f.name} size={22} /> {f.name}
            {already.includes(f.id) && ' · sent'}
          </button>
        ))}
      </div>
      {to && (
        <div className="nod-cards" role="radiogroup" aria-label="Which nod">
          {offered.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={card === i} className="nod-card" onClick={() => setCard(i)}>
              “{nods.cards[i]}”
            </button>
          ))}
          {!all && (
            <button type="button" className="link-button" onClick={() => setAll(true)}>
              More nods
            </button>
          )}
          <button type="button" className="btn wide" disabled={card === null} onClick={send}>
            Send the nod
          </button>
        </div>
      )}
      {sent.length > 0 && !to && <p className="small" role="status">Sent. It waits for them to open the app; you won’t be told when.</p>}
      {error && <p className="small">{error}</p>}
    </section>
  )
}

// ---- Answer Together ----

const labelOf = (t: TogetherView, id?: string) => t.options.find((o) => o.id === id)?.label ?? ''

export function TogetherAsk({ question }: { question: Question }) {
  const me = useAccount()
  const [friends, setFriends] = useState<FriendView[] | null>(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mine = recalledChoice(question.id)
  useEffect(() => {
    if (!open || friends) return
    getCircle().then(
      (c) => setFriends(c.friends.filter((f) => !f.muted && f.connect)),
      () => setFriends([]),
    )
  }, [open, friends])
  if (!me?.connect || !shareable(question) || !mine || !question.options.some((o) => o.id === mine)) return null
  if (done) return <p className="small" role="status">Asked {done}. Your choice stays sealed until they answer; it lapses quietly after 48 hours.</p>
  if (!open) {
    return (
      <button type="button" className="chip together-chip" onClick={() => setOpen(true)}>
        <Icon name="together" size={16} /> Answer with a friend
      </button>
    )
  }
  return (
    <div className="together-ask" role="group" aria-label="Answer with a friend">
      <p className="small muted">They answer the same question. Neither sees the other’s choice until both are in.</p>
      {friends === null && <p className="small muted">One moment…</p>}
      {friends?.length === 0 && <p className="small muted">Bring someone into your circle first.</p>}
      <div className="chips">
        {friends?.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip-toggle with-avatar"
            onClick={() =>
              askTogether(f.id, question.id, mine).then(
                () => setDone(f.name),
                (e) =>
                  setError(
                    e instanceof ApiError && e.code === 'already_asked'
                      ? `You already asked ${f.name} this one.`
                      : e instanceof ApiError && e.code === 'too_many_open'
                        ? 'Three are waiting already. Let one finish first.'
                        : 'That didn’t go through.',
                  ),
              )
            }
          >
            <Avatar name={f.name} size={22} /> {f.name}
          </button>
        ))}
      </div>
      {error && <p className="small">{error}</p>}
    </div>
  )
}

export function TogetherCard({ t, onChange }: { t: TogetherView; onChange: () => void }) {
  const [pick, setPick] = useState<string | null>(null)
  const [error, setError] = useState('')
  const name = t.with.name
  if (t.state === 'yours') {
    return (
      <section className="card together" aria-label={`Answer together with ${name}`}>
        <p className="friend-q-head">
          <Avatar name={name} size={28} />
          <span>
            <strong>{name}</strong> asked you to answer this one together
          </span>
        </p>
        <h3 className="prompt serif">{t.prompt}</h3>
        <div className="options">
          {t.options.map((o) => (
            <button key={o.id} type="button" className="option" aria-pressed={pick === o.id} onClick={() => setPick(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="row-gap">
          <button
            type="button"
            className="btn small"
            disabled={!pick}
            onClick={() => answerTogether(t.id, pick!).then(onChange, () => setError('That didn’t go through.'))}
          >
            Answer · reveals both
          </button>
          <button type="button" className="btn small ghost" onClick={() => leaveTogether(t.id).then(onChange, () => {})}>
            Not this one
          </button>
        </div>
        {error && <p className="small">{error}</p>}
      </section>
    )
  }
  if (t.state === 'revealed') {
    const same = t.mine === t.theirs
    return (
      <section className="card together" aria-label={`Answered together with ${name}`}>
        <p className="label">Answer together · you and {name}</p>
        <h3 className="prompt serif">{t.prompt}</h3>
        <div className="together-pair">
          <div className="together-side">
            <p className="small muted">You</p>
            <p>{labelOf(t, t.mine)}</p>
          </div>
          <div className="together-side">
            <p className="small muted">{name}</p>
            <p>{labelOf(t, t.theirs)}</p>
          </div>
        </div>
        <p className="small">
          {same
            ? `You and ${name} reach for the same thing here. Worth saying out loud sometime.`
            : `You reach for different things. Neither is the right one; it might explain a few mornings.`}
        </p>
        <p className="muted small">Just between the two of you. It never feeds your mirror.</p>
      </section>
    )
  }
  if (t.state === 'waiting') {
    return (
      <section className="card soft together" aria-label={`Waiting for ${name}`}>
        <p>
          <strong>You’ve answered.</strong> {name} hasn’t yet. Your choice stays sealed until they do.
        </p>
        <p className="muted small">If {name} doesn’t answer in 48 hours it quietly goes away; nobody is told.</p>
        <button type="button" className="link-button" onClick={() => leaveTogether(t.id).then(onChange, () => {})}>
          Withdraw quietly
        </button>
      </section>
    )
  }
  return (
    <section className="card soft together" aria-label="Came and went">
      <p>That one came and went. Ask {name} something else tomorrow, or send a quiet nod tonight.</p>
    </section>
  )
}
