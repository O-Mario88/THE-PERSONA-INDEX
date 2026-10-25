// A person's initial on a colour picked from their name, so the same friend
// always has the same colour (the design note: Kofi ochre, Nakato sage, Joel
// terracotta, Sarah indigo, Daniel grey). Muted friends turn grey.

const TINTS = ['#b8922e', '#4f7357', '#bf5f3c', '#6f6cc0', '#8a8f8c', '#2f5a4f', '#a8607e']

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
      style={{ width: size, height: size, fontSize: size * 0.4, background: muted ? '#a3a6a2' : (tint ?? tintFor(name)) }}
    >
      {letter}
    </span>
  )
}
