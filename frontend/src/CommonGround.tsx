import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './api'
import { suggestCommonTags } from './commonTags'
import { loadHistory } from './profile'
import { getCommon, putCommon, setCommonFriend, type CommonView, type FriendView } from './social'
import { Avatar } from './ui/Avatar'
import { Icon } from './ui/icons'

// Our Common Ground (Connect 3.0), the signature of the page: the broad
// things two friends both value, shown only when each has opted in to the
// other. The person picks their own tags from a fixed list; the server keeps
// the tags and whom they opted in to, never an answer. New tags can be added
// once a week, so the overlap cannot be used to read anyone's whole list.

const MAX_TAGS = 6
const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

export function CommonGround({ friends }: { friends: FriendView[] }) {
  const [view, setView] = useState<CommonView | null>(null)
  const [mode, setMode] = useState<'show' | 'tags' | 'people'>('show')
  const [at, setAt] = useState(0)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    getCommon().then(
      (v) => {
        setView(v)
        setError('')
      },
      () => setError('I couldn’t load your common ground just now.'),
    )
  }, [])
  useEffect(refresh, [refresh])

  if (!view) {
    return (
      <section className="connect-card common" aria-labelledby="common-title">
        <h3 id="common-title" className="card-title">
          Our Common Ground
        </h3>
        {error && <p className="muted small">{error}</p>}
      </section>
    )
  }

  const pair = view.pairs[at % Math.max(view.pairs.length, 1)]
  const label = (id: string) => view.tags.find((t) => t.id === id)?.label ?? id
  const reachable = friends.filter((f) => !f.muted && f.connect)

  return (
    <section className="connect-card common" aria-labelledby="common-title">
      <div className="card-head">
        <h3 id="common-title" className="card-title">
          Our Common Ground
        </h3>
        {view.pairs.length > 1 && mode === 'show' && (
          <button type="button" className="icon-button" aria-label="Next friend" onClick={() => setAt(at + 1)}>
            <Icon name="chevron" size={18} />
          </button>
        )}
      </div>

      {mode === 'tags' && (
        <TagChooser
          view={view}
          onSaved={() => {
            setMode(view.optedIn.length ? 'show' : 'people')
            refresh()
          }}
          onCancel={() => setMode('show')}
        />
      )}
      {mode === 'people' && <PeopleChooser view={view} friends={reachable} onChange={refresh} onDone={() => setMode('show')} />}

      {mode === 'show' &&
        (pair ? (
          <div className="common-pair">
            <p className="common-who">
              <span className="avatar-pair" aria-hidden="true">
                <Avatar name="You" size={36} />
                <Avatar name={pair.friend.name} size={36} />
              </span>
              <span>
                <strong>You &amp; {pair.friend.name}</strong>
                <span className="muted small"> A shared perspective</span>
              </span>
            </p>
            <p className="common-headline">{pair.headline}</p>
            <ul className="chips" aria-label="What you both value">
              {pair.shared.map((id) => (
                <li key={id} className="chip is-static">
                  {label(id)}
                </li>
              ))}
            </ul>
            <div className="common-explore">
              <Icon name="heart" size={20} />
              <span>
                <strong>Something to explore together</strong>
                <span className="muted">“{pair.explore}”</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyCommon view={view} />
        ))}

      {mode === 'show' && (
        <div className="closer-actions">
          <button type="button" className="text-button" onClick={() => setMode('tags')}>
            {view.mine.length ? 'What matters to you' : 'Choose what matters to you'}
          </button>
          {view.mine.length > 0 && reachable.length > 0 && (
            <button type="button" className="text-button" onClick={() => setMode('people')}>
              Who you find it with
            </button>
          )}
        </div>
      )}
      {error && <p className="muted small">{error}</p>}
    </section>
  )
}

function EmptyCommon({ view }: { view: CommonView }) {
  if (!view.mine.length) return <p className="muted">Pick a few things that matter to you. A friend sees what you share only if you both choose to look.</p>
  if (!view.optedIn.length) return <p className="muted">Choose who to find common ground with. Nothing shows until they choose you too.</p>
  return <p className="muted">Nothing in common shows yet. It appears when a friend you chose has chosen you too.</p>
}

function TagChooser({ view, onSaved, onCancel }: { view: CommonView; onSaved: () => void; onCancel: () => void }) {
  // A first choice starts from what the phone suggests; nothing is sent
  // until Save.
  const [suggested] = useState(() => (view.mine.length ? [] : suggestCommonTags(loadHistory().answers).filter((id) => view.tags.some((t) => t.id === id))))
  const [picked, setPicked] = useState<string[]>(view.mine.length ? view.mine : suggested)
  const [error, setError] = useState('')
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < MAX_TAGS ? [...picked, id] : picked)
  function save() {
    putCommon(picked).then(onSaved, (e) =>
      setError(e instanceof ApiError && e.code === 'tags_changed_recently' ? 'You can add new ones once a week. Removing one is always fine.' : 'That didn’t save.'),
    )
  }
  return (
    <div className="common-choose">
      <p className="muted small">Up to six. Only the ones you share with a friend are ever shown to them.</p>
      {suggested.length > 0 && (
        <p className="muted small" role="note">
          Suggested from the themes you answer most, worked out on this phone. Untick any you’d rather keep to yourself; nothing is shared until you save.
        </p>
      )}
      <div className="chips" role="group" aria-label="What matters to you">
        {view.tags.map((t) => (
          <button key={t.id} type="button" className="chip" aria-pressed={picked.includes(t.id)} onClick={() => toggle(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {view.nextChange && <p className="muted small">New ones can be added from {dayMonth(view.nextChange)}.</p>}
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
      <div className="closer-actions">
        <button type="button" className="btn small" onClick={save}>
          Save
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function PeopleChooser({ view, friends, onChange, onDone }: { view: CommonView; friends: FriendView[]; onChange: () => void; onDone: () => void }) {
  const [error, setError] = useState('')
  return (
    <div className="common-choose">
      <p className="muted small">You see what you share with someone only when you have both chosen each other. Turning it off is silent.</p>
      <fieldset className="closer-friends">
        <legend className="field-label">Find common ground with</legend>
        {friends.map((f) => (
          <label key={f.id} className="closer-friend">
            <input
              type="checkbox"
              aria-label={`Find common ground with ${f.name}`}
              checked={view.optedIn.includes(f.id)}
              onChange={(e) => setCommonFriend(f.id, e.target.checked).then(onChange, () => setError('That didn’t save.'))}
            />
            <Avatar name={f.name} size={32} />
            <span>{f.name}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="error small">
          {error}
        </p>
      )}
      <button type="button" className="btn small" onClick={onDone}>
        Done
      </button>
    </div>
  )
}
