// splitReveal shows a card's first sentence large, as its headline, and the
// rest underneath. Cards are written so the first sentence is a short,
// warm line about the person (the content gate keeps it under 70 characters).
export function splitReveal(reveal: string): { headline: string; body: string } {
  const m = /^(.+?[.!?])\s+(\S.*)$/s.exec(reveal)
  return m ? { headline: m[1], body: m[2] } : { headline: reveal, body: '' }
}
