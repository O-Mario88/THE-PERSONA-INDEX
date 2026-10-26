import { useEffect, useState } from 'react'
import { getCircle } from './social'
import { load, save } from './storage'
import { useAccount } from './useAccount'

// A way into Connect (Insights Release 3): for someone with a Circle, a
// gentle line pointing to Support & Celebrate, where they choose whether to
// send anything. It says nothing about any friend and shares nothing about
// the person's answers; it is not drawn from anything a friend did. "Not
// today" puts it away for the day, "Don't suggest this" for good.

const OFF = 'pi.nudge.off'
const NOT_TODAY = 'pi.nudge.later'

export function ConnectNudge({ today, onOpenSupport }: { today: string; onOpenSupport: () => void }) {
  const me = useAccount()
  const [hidden, setHidden] = useState(() => load(OFF) === '1' || load(NOT_TODAY) === today)
  const [hasCircle, setHasCircle] = useState(false)
  useEffect(() => {
    if (!me || hidden) return
    let live = true
    getCircle().then(
      (c) => live && setHasCircle(c.friends.length > 0),
      () => live && setHasCircle(false),
    )
    return () => {
      live = false
    }
  }, [me, hidden])
  if (!me || hidden || !hasCircle) return null

  const line = 'Someone in your Circle might appreciate a little encouragement today.'
  return (
    <section className="connect-nudge" aria-label={line}>
      <p className="connect-nudge-line">{line}</p>
      <p className="muted small">You choose who, if anyone, and what to send. Nothing about your answers is shared.</p>
      <div className="chips">
        <button type="button" className="btn small" onClick={onOpenSupport}>
          Open Support &amp; Celebrate
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            save(NOT_TODAY, today)
            setHidden(true)
          }}
        >
          Not today
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            save(OFF, '1')
            setHidden(true)
          }}
        >
          Don’t suggest this
        </button>
      </div>
    </section>
  )
}
