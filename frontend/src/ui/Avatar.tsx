// A person's initial in a lime circle. Muted friends are an outline. The
// palette has no per-person colours: who someone is shows in the letter and
// the name beside it, never in a tint.

export function Avatar({ name, muted, size = 36 }: { name: string; muted?: boolean; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className={muted ? 'avatar is-muted' : 'avatar'} aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {letter}
    </span>
  )
}
