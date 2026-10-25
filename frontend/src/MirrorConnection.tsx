import { connectionBetween, connectionLine } from './connection'
import { accountToken } from './social'

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
