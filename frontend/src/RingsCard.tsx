import { RING_NAMES, RING_NOTES, RINGS, ringOf, type Ring, type Rings } from './rings'
import type { FriendView } from './social'

// Three circles, biggest to smallest (Edwin, 2026-10-25), with each friend's
// initial in the circle the person placed them in. Private to this phone.

const RADII: Record<Ring, number> = { outer: 150, middle: 104, inner: 58 }
const SIZE = 320

// Where the n-th of count initials sits on a circle of radius r: spread
// evenly, starting at the top, the inner circle starting a little turned.
function spot(r: number, i: number, count: number, ring: Ring) {
  const start = ring === 'inner' ? -Math.PI / 2 + 0.6 : -Math.PI / 2
  const a = start + (2 * Math.PI * i) / Math.max(count, 1)
  const radius = ring === 'inner' && count === 1 ? 0 : r - 22
  return { x: SIZE / 2 + radius * Math.cos(a), y: SIZE / 2 + radius * Math.sin(a) }
}

export function RingsCard({ friends, rings }: { friends: FriendView[]; rings: Rings }) {
  const byRing = (ring: Ring) => friends.filter((f) => ringOf(rings, f.id) === ring)
  return (
    <section className="rings card" role="group" aria-label="Your three circles">
      <div className="rings-head">
        <h3 className="card-title">Your three circles</h3>
        <p className="muted small">Only you see who is in which circle. Tap a name below to move someone.</p>
      </div>
      <div className="rings-figure">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {(['outer', 'middle', 'inner'] as Ring[]).map((ring) => (
            <circle key={ring} className={`ring-${ring}`} cx={SIZE / 2} cy={SIZE / 2} r={RADII[ring]} />
          ))}
          {RINGS.flatMap((ring) => {
            const list = byRing(ring).slice(0, ring === 'inner' ? 5 : 10)
            return list.map((f, i) => {
              const p = spot(RADII[ring], i, list.length, ring)
              return (
                <g key={f.id} className={f.muted ? 'ring-person is-muted' : 'ring-person'}>
                  <circle cx={p.x} cy={p.y} r={17} />
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
              <span>
                <strong>{RING_NAMES[ring]}</strong> · {list.length}
                <span className="muted small"> {RING_NOTES[ring]}</span>
              </span>
            </li>
          )
        })}
      </ul>
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
