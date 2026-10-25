import { useCallback, useEffect, useState } from 'react'
import { ShareComposer } from './Closer'
import { getShares, withdrawShare, type SharesView, type ShareView } from './social'
import { Icon } from './ui/icons'

// What Helped Us (the new Connect): real perspectives from people the person
// trusts. Each one is words a friend approved and chose to share with them,
// filed under a theme, shown without a name (Edwin's mockup): the server
// does not send who it was from. No likes, no replies, no counts. The
// person's own shares show exactly who has them, and each can be withdrawn.

export function WhatHelped() {
  const [view, setView] = useState<SharesView | null>(null)
  const [theme, setTheme] = useState('all')
  const [composing, setComposing] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    getShares().then(
      (v) => {
        setView(v)
        setError('')
      },
      () => setError('I couldn’t load what your circle shared just now.'),
    )
  }, [])
  useEffect(refresh, [refresh])

  const themeName = (id: string) => view?.themes.find((t) => t.id === id)?.label ?? ''
  const received = view?.received ?? []
  const present = view?.themes.filter((t) => received.some((s) => s.theme === t.id)) ?? []
  const shown = theme === 'all' ? received : received.filter((s) => s.theme === theme)

  return (
    <section className="connect-card helped" aria-labelledby="helped-title">
      <div className="card-head">
        <div>
          <h3 id="helped-title" className="card-title">
            What Helped Us
          </h3>
          <p className="muted small">Real perspectives from people you trust.</p>
        </div>
      </div>

      {present.length > 1 && (
        <div className="chips" role="group" aria-label="Themes">
          <button type="button" className="chip" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>
            All themes
          </button>
          {present.map((t) => (
            <button key={t.id} type="button" className="chip" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {shown.length > 0 ? (
        <ul className="helped-list" aria-label="Shared with you">
          {shown.slice(0, 3).map((s) => (
            <HelpedCard key={s.id} share={s} title={themeName(s.theme)} />
          ))}
        </ul>
      ) : (
        view && <p className="muted">Nothing shared with you yet. When a friend shares what helped them, it shows here, for you alone.</p>
      )}

      {composing ? (
        <ShareComposer
          kind="helped"
          text=""
          onDone={() => {
            setComposing(false)
            refresh()
          }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <button type="button" className="btn small outline" onClick={() => setComposing(true)}>
          Share what helped you
        </button>
      )}

      {(view?.sent.length ?? 0) > 0 && (
        <details className="helped-mine">
          <summary>What you’ve shared ({view!.sent.length})</summary>
          <ul>
            {view!.sent.map((s) => (
              <li key={s.id}>
                <p className="nb-line">“{s.text}”</p>
                <p className="muted small">
                  {themeName(s.theme)} · with {s.to.length ? s.to.join(', ') : 'no one now'}
                </p>
                <button type="button" className="text-button" onClick={() => withdrawShare(s.id).then(refresh, () => setError('That didn’t go through.'))}>
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="muted small">{error}</p>}
    </section>
  )
}

function HelpedCard({ share: s, title }: { share: ShareView; title: string }) {
  return (
    <li className="helped-card">
      <p className="helped-from">
        <span className="icon-disc" aria-hidden="true">
          <Icon name="connect" size={18} />
        </span>
        <span>
          <strong>{s.kind === 'win' ? 'A win from your circle' : 'A perspective from your circle'}</strong>
          <span className="muted small"> Shared by someone you trust</span>
        </span>
      </p>
      {title && <p className="helped-title">{title}</p>}
      <p className="helped-text">“{s.text}”</p>
      {(s.why || s.try) && (
        <div className="helped-notes">
          {s.why && (
            <p>
              <Icon name="sun" size={18} />
              <span>
                <strong>Why it helped</strong>
                <span className="muted small">{s.why}</span>
              </span>
            </p>
          )}
          {s.try && (
            <p>
              <Icon name="heart" size={18} />
              <span>
                <strong>Try it for yourself</strong>
                <span className="muted small">{s.try}</span>
              </span>
            </p>
          )}
        </div>
      )}
    </li>
  )
}
