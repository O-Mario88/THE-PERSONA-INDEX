// Compare with someone: the link carries this edition's number and the
// answers its sender chose to send (never intimate ones). The receiver
// answers the same questions first and only then sees where they agree.
// Nothing goes through the server.

export type ComparePayload = { e: number; a: [string, string][] }

export function encodeCompare(p: ComparePayload): string {
  return btoa(JSON.stringify(p)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function readCompare(hash: string): ComparePayload | null {
  const m = /[#&]c=([A-Za-z0-9_-]{4,2000})/.exec(hash)
  if (!m) return null
  try {
    const v = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (
      typeof v?.e === 'number' &&
      Array.isArray(v.a) &&
      v.a.length > 0 &&
      v.a.length <= 3 &&
      v.a.every((x: unknown) => Array.isArray(x) && x.length === 2 && x.every((y) => typeof y === 'string'))
    ) {
      return v as ComparePayload
    }
  } catch {
    // not a compare link
  }
  return null
}
