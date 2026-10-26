import { useMemo } from 'react'
import { growthPairs, type GrowthPair, type GrowthSide } from './growth'
import { reflectSettings } from './journal'
import { reflections } from './notebook'
import { loadHistory } from './profile'
import { AREA_NAMES, dayMonth } from './reflect'

// Insights' Your Growth (Release 3): the person's own earlier and more recent
// entries in one part of life, side by side (growth.ts). Nothing is said
// about what changed; that is theirs to say.

export function GrowthSection({ today }: { today: string }) {
  const pairs = useMemo(
    () => growthPairs(loadHistory(), reflections(), today, undefined, { reflections: reflectSettings().reflectionsInGrowth }),
    [today],
  )
  return (
    <section className="insights-growth" aria-labelledby="growth-title">
      <h3 id="growth-title" className="section-title">
        Your Growth
      </h3>
      {pairs.length === 0 ? (
        <p className="muted empty-note">This fills in over the weeks, from your own earlier and recent answers.</p>
      ) : (
        <>
          {pairs.map((p) => (
            <Pair key={`${p.kind}.${p.area}`} pair={p} />
          ))}
          <p className="muted small">Only your own answers, side by side. What changed, if anything, is yours to say.</p>
        </>
      )}
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
