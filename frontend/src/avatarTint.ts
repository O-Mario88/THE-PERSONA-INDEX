// The soft pastel behind a person's initials, picked from their name, so the same
// friend always has the same colour (the reference designs: lavender, mint,
// sky, peach). No photos.

const TINTS = ['#e6e3f6', '#dcefdc', '#dde9f8', '#fbe6d8', '#f6e0ea', '#e8eedc', '#e0eeef']

export function tintFor(name: string): string {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}
