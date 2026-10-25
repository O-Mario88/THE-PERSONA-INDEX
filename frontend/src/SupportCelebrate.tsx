import { useCallback, useEffect, useState } from 'react'
import { ReachOutPicker } from './Closer'
import { NodPicker } from './Friends'
import { ringOf, type Rings } from './rings'
import { getReachOuts, putAwayReachOut, type FriendView, type ReachOutView } from './social'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'

// Support & Celebrate (the new Connect): reach out, appreciate progress and be
// there for each other, with fixed words only. And Closer Together, at the
// top of the page: at most two quiet cards, from what friends chose to send
// and from who has not been in the app this week. Silence is never read as
// anything: a quiet week is only that.

const MAX_CLOSER_CARDS = 2

type Open = 'encourage' | 'celebrate' | 'support' | null

export function SupportCelebrate({ today }: { today?: string }) {
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)
  return (
    <section className="connect-card support" aria-labelledby="support-title">
      <div className="card-head">
        <div>
          <h3 id="support-title" className="card-title">
            Support &amp; Celebrate
          </h3>
          <p className="muted small">Reach out, appreciate progress and be there for each other.</p>
        </div>
      </div>
      {open === null && (
        <>
          <div className="support-tiles">
            {today && (
              <div className="support-tile is-encourage">
                <Icon name="heart" size={22} />
                <p className="support-title">Is there someone you’d like to encourage?</p>
                <p className="muted small">A small message can make a big difference.</p>
                <button type="button" className="btn small" onClick={() => setOpen('encourage')}>
                  Reach out <Icon name="arrow" size={16} />
                </button>
              </div>
            )}
            <div className="support-tile is-celebrate">
              <Icon name="sun" size={22} />
              <p className="support-title">Celebrate a win together</p>
              <p className="muted small">Made progress on something that matters? Tell someone who matters.</p>
              <button type="button" className="btn small celebrate" onClick={() => setOpen('celebrate')}>
                Share a win <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
          <button type="button" className="text-button" onClick={() => setOpen('support')}>
            Having a hard week? Ask someone for support
          </button>
        </>
      )}
      {open === 'encourage' && today && (
        <>
          <NodPicker date={today} title="Who would you like to encourage?" />
          <button type="button" className="text-button" onClick={close}>
            Close
          </button>
        </>
      )}
      {(open === 'celebrate' || open === 'support') && <ReachOutPicker kind={open} onDone={close} onCancel={close} />}
    </section>
  )
}

type CloserProps = { friends: FriendView[]; rings: Rings }

export function CloserTogether({ friends, rings }: CloserProps) {
  const [received, setReceived] = useState<ReachOutView[]>([])
  const refresh = useCallback(() => {
    getReachOuts().then(
      (r) => setReceived(r.received),
      () => {},
    )
  }, [])
  useEffect(refresh, [refresh])

  // Someone close who has not been in this week: one gentle suggestion,
  // never more, and only when there is room for it.
  const quiet = friends.find((f) => !f.muted && f.connect && !f.active && ringOf(rings, f.id) !== 'outer')
  const cards = received.slice(0, MAX_CLOSER_CARDS)
  const showQuiet = quiet && cards.length < MAX_CLOSER_CARDS
  if (cards.length === 0 && !showQuiet) return null

  return (
    <section className="closer-together" aria-labelledby="closer-title">
      <h3 id="closer-title" className="label">
        Closer together
      </h3>
      <ul className="closer-cards">
        {cards.map((r) => (
          <li key={r.id} className={`closer-card is-${r.kind}`}>
            <Avatar name={r.from.name} size={40} />
            <div>
              <p className="closer-card-from">{r.kind === 'support' ? `${r.from.name} reached out` : `${r.from.name} has good news`}</p>
              <p className="closer-card-text">“{r.text}”</p>
              <p className="muted small">{r.kind === 'support' ? 'A call or a message outside the app might mean a lot.' : 'A quiet nod, or a word next time you see them.'}</p>
              <button type="button" className="text-button" onClick={() => putAwayReachOut(r.id).then(refresh, () => {})}>
                Put away
              </button>
            </div>
          </li>
        ))}
        {showQuiet && (
          <li className="closer-card is-quiet">
            <Avatar name={quiet.name} size={40} />
            <div>
              <p className="closer-card-from">{quiet.name} hasn’t been in this week</p>
              <p className="muted small">If they are on your mind, a quiet nod is enough. No reply needed.</p>
            </div>
          </li>
        )}
      </ul>
    </section>
  )
}
