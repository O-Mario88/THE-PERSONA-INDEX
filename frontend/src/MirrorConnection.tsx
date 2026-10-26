import { useEffect, useState } from 'react'
import { connectionBetween, connectionLine } from './connection'
import { accountToken, outsideMirror, type OutsideMirror } from './social'
import { sideOf, TRAITS } from './traits'

// "Your week in connection" in the Mirrors (the new Connect): the person's own
// moves towards friends, from this phone only. The month, quarter and year
// look further back, month by month. The Outside Mirror stays its own thing.

type Span = 'week' | 'month' | 'quarter' | 'year'

function monthsBetween(from: string, to: string): { key: string; from: string; to: string }[] {
  const out: { key: string; from: string; to: string }[] = []
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  while (d.toISOString().slice(0, 10) <= to) {
    const start = d.toISOString().slice(0, 10)
    const next = new Date(d)
    next.setUTCMonth(next.getUTCMonth() + 1)
    const end = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10)
    out.push({ key: start.slice(0, 7), from: start < from ? from : start, to: end > to ? to : end })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

const monthName = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

// Shown to someone signed in, or to anyone who has made a move on this phone.
export function showConnection(from: string, to: string): boolean {
  return !!accountToken() || connectionBetween(from, to).days > 0
}

export function InConnection({ from, to, span }: { from: string; to: string; span: Span }) {
  const counts = connectionBetween(from, to)
  const months = span === 'quarter' || span === 'year' ? monthsBetween(from, to) : []
  return (
    <>
      <p className="m-text">{connectionLine(counts, span)}</p>
      {months.length > 0 && (
        <ol className="m-connection-months" aria-label="Month by month">
          {months.map((m) => {
            const c = connectionBetween(m.from, m.to)
            const total = c.nod + c.share + c.support + c.celebrate
            return (
              <li key={m.key} aria-label={`${monthName(m.key)}: ${total === 1 ? 'one move' : `${total} moves`}`}>
                <span className="m-step-meta">{monthName(m.key)}</span>
                <span className="m-connection-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(total, 8) }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="m-note">Only what you did, kept on this phone. Never who, and never sent.</p>
    </>
  )
}

// One perspective from the Circle in the story Mirrors (Edwin's Mirrors,
// 2026-10-26). The Outside Mirror opens at three friends; a line here waits
// for CIRCLE_LINE_MIN, so a single friend's view can never be picked out by
// someone who knows who answered. Only where the circle and the person's own
// answers meet; never who said it.
export const CIRCLE_LINE_MIN = 5

export function circleLine(o: OutsideMirror | null, own: { trait: string; score: number }[]): string | null {
  if (!o || !o.open || o.friends < CIRCLE_LINE_MIN) return null
  const mine = new Map(own.map((t) => [t.trait, t.score]))
  const shared = o.traits
    .filter((t) => TRAITS[t.trait] && mine.has(t.trait))
    .map((t) => ({ t, gap: Math.abs(t.position - (mine.get(t.trait) ?? 50)) }))
    .sort((a, b) => a.gap - b.gap)[0]
  if (!shared || shared.gap >= 15) return null
  return `Blended from ${o.friends} friends: your circle also sees you near ${sideOf(TRAITS[shared.t.trait], shared.t.position >= 50).lean}.`
}

export function CircleLine({ own }: { own: { trait: string; score: number }[] }) {
  const [o, setO] = useState<OutsideMirror | null>(null)
  useEffect(() => {
    if (!accountToken()) return
    let live = true
    outsideMirror().then(
      (x) => live && setO(x),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])
  const line = circleLine(o, own)
  return line ? <p className="ms-circle-line">{line}</p> : null
}
