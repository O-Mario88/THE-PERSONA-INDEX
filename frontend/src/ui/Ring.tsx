// The countdown ring on an expiring window, and the progress ring on the
// Circle's "2/3". The ring is drawn, the words beside it say the same thing
// for a screen reader.

export function Ring({
  part,
  label,
  big,
  small,
  size = 64,
}: {
  part: number // 0..1 of the ring filled
  label: string // what the ring means, read aloud
  big: string // "2h", "2/3"
  small?: string // "16m"
  size?: number
}) {
  const r = 26
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, part))
  return (
    <span className="ring" role="img" aria-label={label} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="ring-track" />
        {/* An empty ring draws no arc: a zero-length stroke still shows its round cap. */}
        {filled > 0 && (
          <circle
            cx="32"
            cy="32"
            r={r}
            className="ring-fill"
            strokeDasharray={`${c * filled} ${c}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <span className="ring-text" aria-hidden="true">
        <span className="ring-big">{big}</span>
        {small && <span className="ring-small">{small}</span>}
      </span>
    </span>
  )
}
