import { NEED_NAMES } from './needs'
import { season, type Season } from './tapestry'

// The Season Tapestry: ninety tiles, one a day (tapestry.ts). On the dark
// morning close it sits on the teal card; on Today it sits in a white card.
// Every woven day is lime: the palette has no per-need colours. A missed
// day is linen, and the row of tiles never turns into a number to keep up.

const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

function tileName(t: Season['tiles'][number]): string {
  if (t.state === 'ahead') return `${longDay(t.date)}: still to come`
  if (t.state === 'linen') return `${longDay(t.date)}: linen, a day without a sitting`
  return `${longDay(t.date)}: ${t.need ? `reached most for ${NEED_NAMES[t.need].toLowerCase()}` : 'answered'}`
}

export function TapestryGrid({ s, dark, cols = 15, weaving }: { s: Season; dark?: boolean; cols?: number; weaving?: boolean }) {
  return (
    <ol
      className={dark ? 'tapestry dark' : 'tapestry'}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      role="img"
      aria-label={`Season tapestry, day ${s.day} of 90: ${s.woven} ${s.woven === 1 ? 'day' : 'days'} woven`}
    >
      {s.tiles.map((t) => (
        <li
          key={t.date}
          className={`tile-${t.state}${t.today ? ' is-today' : ''}${t.today && weaving ? ' weaving' : ''}`}
          title={tileName(t)}
        />
      ))}
    </ol>
  )
}

// The pale card on Today.
export function TapestryCard({ today, onOpen, cols = 18, note }: { today: string; onOpen?: () => void; cols?: number; note?: boolean }) {
  const s = season(today)
  return (
    <section className="tapestry-card" aria-labelledby="tapestry-title">
      <div className="row-between">
        <h2 id="tapestry-title" className="label">
          Season tapestry · day {s.day} of 90
        </h2>
        {note && !onOpen && <p className="tapestry-note">Each tile is one sitting. A missed day stays linen.</p>}
        {onOpen && (
          <button type="button" className="link-button" onClick={onOpen}>
            Open
          </button>
        )}
      </div>
      <TapestryGrid s={s} cols={cols} />
    </section>
  )
}

// The week's seven tiles, Monday to Sunday, for the Sunday Mirror and its share card.
export function weekTiles(today: string, monday: string): { date: string; woven?: boolean }[] {
  const s = season(today)
  const out: { date: string; woven?: boolean }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${monday}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    const date = d.toISOString().slice(0, 10)
    const t = s.tiles.find((x) => x.date === date)
    out.push({ date, ...(t?.state === 'woven' ? { woven: true } : {}) })
  }
  return out
}
