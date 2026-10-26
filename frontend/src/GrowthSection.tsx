import type { GrowthPair, GrowthSide } from './growth'
import { AREA_NAMES, dayMonth } from './reflect'
import { Disc } from './ui/Disc'

// Insights' Your Growth (Release 3): the person's own earlier and more recent
// entries in one part of life, side by side (growth.ts). Nothing is said
// about what changed; that is theirs to say.

export function GrowthSection({ pairs }: { pairs: GrowthPair[] }) {
  return (
    <section className="insights-growth" aria-labelledby="growth-title">
      <div className="insight-side-head">
        <Disc icon="mountain" tone="blue" size={40} />
        <h3 id="growth-title" className="section-title">
          Your Growth
        </h3>
      </div>
      {pairs.map((p) => (
        <Pair key={`${p.kind}.${p.area}`} pair={p} />
      ))}
      <p className="muted small">Only your own answers, side by side. What changed, if anything, is yours to say.</p>
    </section>
  )
}

function Pair({ pair }: { pair: GrowthPair }) {
  const name = pair.kind === 'reflections' ? `${AREA_NAMES[pair.area]}, in your reflections` : AREA_NAMES[pair.area]
  return (
    <article className="growth-pair" aria-label={name}>
      <p className="label">{name}</p>
      <div className="growth-sides">
        <Side when="Earlier" side={pair.earlier} kind={pair.kind} />
        <Side when="More recent" side={pair.recent} kind={pair.kind} />
      </div>
    </article>
  )
}

function Side({ when, side, kind }: { when: string; side: GrowthSide; kind: GrowthPair['kind'] }) {
  return (
    <div className="growth-side">
      <p className="growth-when">
        {when} · {dayMonth(side.date)}
      </p>
      <p>
        {side.asked}{' '}
        <span className="growth-words">{kind === 'answers' ? `You chose “${side.words}”.` : `“${side.words}”`}</span>
      </p>
    </div>
  )
}
