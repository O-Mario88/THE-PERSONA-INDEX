// A person's initials on a soft pastel picked from their name, so the same
// friend always has the same colour (the reference designs: lavender, mint,
// sky, peach). No photos. Muted friends turn grey.

const TINTS = ['#e6e3f6', '#dcefdc', '#dde9f8', '#fbe6d8', '#f6e0ea', '#e8eedc', '#e0eeef']

export function tintFor(name: string): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

export function Avatar({ name, muted, size = 36, tint }: { name: string; muted?: boolean; size?: number; tint?: string }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, background: muted ? '#e3e6e4' : (tint ?? tintFor(name)) }}
    >
      {letter}
    </span>
  )
}
