import { useEffect, useState } from 'react'
import { loadHistory } from '../profile'
import { canPrompt, inviteDue, iosSafari, noteInstall, onInstallChange, promptInstall } from './install'

// The invite to add the app to the home screen, beside the day's questions,
// once a week of answers is behind someone (install.ts).

const firstUse = () =>
  loadHistory()
    .answers.map((a) => a.date)
    .sort()[0] ?? null

export function InstallInvite({ today }: { today: string }) {
  const [, setVersion] = useState(0)
  const [hidden, setHidden] = useState(false)
  useEffect(() => onInstallChange(() => setVersion((v) => v + 1)), [])
  if (hidden || !inviteDue(today, firstUse())) return null
  const ios = iosSafari()
  if (!ios && !canPrompt()) return null

  const answer = (a: 'added' | 'later') => {
    noteInstall(today, a)
    setHidden(true)
  }

  return (
    <section className="notice install" aria-labelledby="install-title">
      <h3 id="install-title" className="install-title">
        Keep me on your home screen
      </h3>
      <p className="muted">
        You've been coming back for a week. On your home screen I open like an app, work without a connection, and your
        phone is far less likely to clear what you've kept here.
      </p>
      {ios && <p>In Safari, tap the Share button, then “Add to Home Screen”.</p>}
      <div className="confirm">
        {ios ? (
          <button type="button" className="option" onClick={() => answer('added')}>
            I've added it
          </button>
        ) : (
          <button
            type="button"
            className="option"
            onClick={async () => answer((await promptInstall()) === 'added' ? 'added' : 'later')}
          >
            Add to home screen
          </button>
        )}
        <button type="button" className="text-button" onClick={() => answer('later')}>
          Not now
        </button>
      </div>
    </section>
  )
}
