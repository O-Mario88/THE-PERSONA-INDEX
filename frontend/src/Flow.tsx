import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './ui/icons'

// A window opened from Today: its own full screen with a quiet top line
// ("Midday · closes in 2h 16m") and a close button that goes back to Today.
// The sittings put their three dashes under the top line.

export function Flow({
  label,
  live,
  onClose,
  children,
  bar,
  footer,
  tone,
}: {
  label: ReactNode
  live?: boolean // a dot before the label, for a window counting down
  onClose: () => void
  children: ReactNode
  bar?: ReactNode // the sitting's dashes
  footer?: ReactNode
  tone?: string // the window, for its tint
}) {
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' })
  }, [])
  return (
    <div className={`flow${tone ? ` flow-${tone}` : ''}`} ref={top}>
      <div className="flow-top">
        <p className="flow-label">
          {live && <span className="live-dot" aria-hidden="true" />}
          {label}
        </p>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {bar}
      <div className="flow-main">{children}</div>
      {footer && <div className="flow-foot">{footer}</div>}
    </div>
  )
}
