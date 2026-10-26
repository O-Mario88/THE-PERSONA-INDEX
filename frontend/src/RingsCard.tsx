import { RING_NAMES, RINGS, ringOf, type Ring, type Rings } from './rings'
import type { FriendView } from './social'
import { tintFor } from './ui/Avatar'
import { Icon } from './ui/icons'

// Three circles, biggest to smallest (Edwin, 2026-10-25), with each friend's
// initial in the circle the person placed them in. Private to this phone.

const RADII: Record<Ring, number> = { outer: 152, middle: 110, inner: 68 }
const SIZE = 320
const YOU = 28
// Each circle's people sit in the middle of its band, between it and the next one in.
const BAND: Record<Ring, number> = { outer: (152 + 110) / 2, middle: (110 + 68) / 2, inner: (68 + YOU) / 2 }

// Where the n-th of count initials sits on a circle of radius r: spread
// evenly, starting at the top, the inner circle starting a little turned.
function spot(ring: Ring, i: number, count: number) {
  const start = ring === 'inner' ? -Math.PI / 2 + 0.6 : ring === 'middle' ? -Math.PI / 2 + 0.3 : -Math.PI / 2
  const a = start + (2 * Math.PI * i) / Math.max(count, 1)
  const radius = BAND[ring]
  return { x: SIZE / 2 + radius * Math.cos(a), y: SIZE / 2 + radius * Math.sin(a) }
}

export function RingsCard({ friends, rings }: { friends: FriendView[]; rings: Rings }) {
  const byRing = (ring: Ring) => friends.filter((f) => ringOf(rings, f.id) === ring)
  return (
    <section className="rings card" role="group" aria-label="Your three circles">
      <div className="rings-figure">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {(['outer', 'middle', 'inner'] as Ring[]).map((ring) => (
            <circle key={ring} className={`ring-${ring}`} cx={SIZE / 2} cy={SIZE / 2} r={RADII[ring]} />
          ))}
          <circle className="ring-you" cx={SIZE / 2} cy={SIZE / 2} r={YOU} />
          <text className="ring-you-text" x={SIZE / 2} y={SIZE / 2} dy="0.36em" textAnchor="middle">
            You
          </text>
          {RINGS.flatMap((ring) => {
            const list = byRing(ring).slice(0, ring === 'inner' ? 4 : ring === 'middle' ? 8 : 10)
            return list.map((f, i) => {
              const p = spot(ring, i, list.length)
              return (
                <g key={f.id} className={f.muted ? 'ring-person is-muted' : 'ring-person'}>
                  <circle cx={p.x} cy={p.y} r={19} fill={f.muted ? '#e3e6e4' : tintFor(f.name)} />
                  <text x={p.x} y={p.y} dy="0.36em" textAnchor="middle">
                    {(f.name.trim()[0] ?? '?').toUpperCase()}
                  </text>
                </g>
              )
            })
          })}
        </svg>
      </div>
      <ul className="rings-key">
        {RINGS.map((ring) => {
          const list = byRing(ring)
          return (
            <li key={ring} role="img" aria-label={`${RING_NAMES[ring]}: ${list.length ? list.map((f) => f.name).join(', ') : 'no one yet'}`}>
              <span className={`rings-dot ring-${ring}`} aria-hidden="true" />
              <span className="rings-key-text">
                <strong>{RING_NAMES[ring]}</strong>
                <span className="muted small">{list.length === 1 ? '1 person' : `${list.length} people`}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="rings-private muted small">
        <Icon name="lock" size={14} /> Only you see who is in which circle. Friends never see it.
      </p>
    </section>
  )
}

// The picker under a friend: which circle they are in.
export function RingPicker({ name, ring, onPlace }: { name: string; ring: Ring; onPlace: (r: Ring) => void }) {
  return (
    <div className="chips labelled" role="group" aria-label={`Which circle is ${name} in?`}>
      <span className="chips-label">Circle</span>
      {RINGS.map((r) => (
        <button key={r} type="button" className="chip-toggle" aria-pressed={ring === r} onClick={() => onPlace(r)}>
          {RING_NAMES[r]}
        </button>
      ))}
    </div>
  )
}
