import { readsDeep, rememberDepth } from './mirrorChoices'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PeriodMirror } from './api'
import { reflectSettings } from './journal'
import { CircleLine, InConnection, showConnection } from './MirrorConnection'
import { fitOf, rememberFit } from './mirrorChoices'
import { DepthSwitch, DirectionBox, Fit, HelpedList, JumpRow, OthersView, OwnWordsView, Section, StoryHero, Why, type Jump } from './MirrorParts'
import { MirrorPatterns } from './MirrorPatterns'
import {
  areaPatterns,
  changeRows,
  earlierIntention,
  getOthersHelped,
  helpedFor,
  helpedSentence,
  monthThemes,
  NEED_NAMES,
  othersHelped,
  ownWordsPick,
  periodNeeds,
  periodStory,
  say,
  type OthersStep,
} from './mirrorStory'
import { MirrorThreads } from './MirrorThreads'
import { leanings, periodName } from './mirrorText'
import { checkIntention, intentions, reflections } from './notebook'
import { hasPatterns } from './patterns'
import { loadHistory, notMeSides } from './profile'
import { threadsBetween } from './journal'
import { Disc } from './ui/Disc'

// The month (Your Month in Perspective) and the quarter, which bridges the
// months and the year (Edwin, 2026-10-26): "What patterns are emerging, and
// what is helping me?" A personal review, not a performance evaluation.
// Not four Sunday Mirrors stapled together: recurring patterns by part of
// life, what changed since the period before, strengths and areas to grow,
// what worked, lessons from others, relationships, an earlier intention to
// revisit, and a theme for the period ahead.
export function PeriodStory({
  p,
  today,
  back,
  deeper,
  footer,
}: {
  p: PeriodMirror
  today: string
  back: number
  deeper: ReactNode
  footer: ReactNode
}) {
  const noun = p.period
  const [deep, setDeepState] = useState(readsDeep)
  const setDeep = (d: boolean) => {
    rememberDepth(d)
    setDeepState(d)
  }
  const [showAll, setShowAll] = useState(false)
  const [, setTick] = useState(0)
  const history = useMemo(loadHistory, [p])
  const own = intentions()
  const helped = helpedFor(p.from, p.to, { helped: p.helped, noChange: p.noChange, intentions: own })
  const story = periodStory(p, history, helped)
  const areas = areaPatterns(history, p.from, p.to)
  const includeReflections = reflectSettings().reflectionsInGrowth || reflectSettings().reflectionsInMirror
  const changes = changeRows({
    p,
    previousName: p.previousLabel ? periodName(p.period, p.previousLabel, false) : null,
    history,
    reflections: reflections(),
    today,
    includeReflections,
  })
  const notMe = notMeSides(today)
  const leans = leanings(p.traits, notMe)
  const [others, setOthers] = useState<OthersStep[] | null>(null)
  useEffect(() => {
    let live = true
    getOthersHelped().then((s) => live && setOthers(s))
    return () => {
      live = false
    }
  }, [])
  const lessons = othersHelped(history, p.from, p.to, others, undefined, 3)
  const intention = earlierIntention(own, p.from, p.to)
  const words = reflectSettings().reflectionsInMirror ? ownWordsPick(reflections(), p.from, p.to) : null
  const themes = monthThemes(periodNeeds(p, history))
  const connected = showConnection(p.from, p.to)
  const threads = threadsBetween(p.from, p.to).length > 0
  const name = periodName(noun, p.label)
  const meta = p.stats.answers > 0 ? `${p.stats.answers} answers on ${p.stats.daysActive} days, in ${p.stats.weeksActive} of ${p.stats.weeksSoFar} weeks` : undefined

  const jumps: Jump[] = [
    (areas.length > 0 || hasPatterns(today)) && { id: 'ms-patterns', icon: 'leaf', tone: 'green', title: 'Your patterns', note: 'What kept coming back' },
    changes.length > 0 && { id: 'ms-changed', icon: 'mountain', tone: 'blue', title: 'What changed', note: `Since last ${noun}` },
    (helped.length > 0 || lessons.length > 0) && { id: 'ms-worked', icon: 'bulb', tone: 'amber', title: 'What worked', note: 'For you and others' },
    connected && { id: 'ms-connection', icon: 'heart', tone: 'rose', title: 'Your connections', note: 'People and support' },
  ].filter(Boolean) as Jump[]

  return (
    <div className="ms-page">
      <StoryHero
        eyebrow={noun === 'month' ? `Your month in perspective · ${name}` : `Your quarter in perspective · ${name}`}
        story={story}
        meta={meta}
        span={noun}
      />
      <JumpRow jumps={jumps} />

      <div className="ms-grid">
        <div className="ms-main">
          {(areas.length > 0 || hasPatterns(today)) && (
            <Section id="ms-patterns" icon="leaf" title="Your recurring patterns" note="Across the parts of your life your answers touched. Mixed answers are called uncertain, not forced.">
              {areas.length > 0 && (
                <ul className="ms-areas">
                  {areas.map((a) => (
                    <li key={a.area} className="ms-area">
                      <p className="ms-area-name">
                        {a.areaName}
                        {a.need && <span className="ms-tag">{NEED_NAMES[a.need]}</span>}
                        {a.uncertain && <span className="ms-tag is-quiet">Uncertain</span>}
                      </p>
                      <p>{a.description}</p>
                      {a.benefit && (
                        <dl className="ms-obs-parts">
                          <div>
                            <dt>What it gives you</dt>
                            <dd>{a.benefit}</dd>
                          </div>
                          <div>
                            <dt>What it can cost</dt>
                            <dd>{a.cost}</dd>
                          </div>
                        </dl>
                      )}
                      <Why items={a.evidence} span={noun} />
                      {!a.uncertain && <Fit value={fitOf(`area.${p.label}.${a.area}`)} onFit={(v) => rememberFit(`area.${p.label}.${a.area}`, v)} />}
                    </li>
                  ))}
                </ul>
              )}
              {areas.length > 0 && noun !== 'month' && <p className="ms-fine">From the answers on this phone, which keeps the last 60 days of them.</p>}
              {hasPatterns(today) && (
                <details className="ms-more">
                  <summary>What you’ve been reaching for</summary>
                  <MirrorPatterns today={today} />
                </details>
              )}
            </Section>
          )}

          <Section id="ms-changed" icon="mountain" tone="blue" title={`What changed since last ${noun}?`} note="Earlier and more recent, side by side, from your own record. Not every change is an improvement, and that is fine.">
            {changes.length > 0 ? (
              <div className="ms-changes" role="table" aria-label="Earlier and more recently">
                <div className="ms-changes-head" role="row">
                  <span role="columnheader">Earlier in your journey</span>
                  <span role="columnheader">More recently</span>
                </div>
                {changes.map((c) => (
                  <div key={c.key} className="ms-change" role="row">
                    <p className="ms-change-area">{c.area}</p>
                    <div role="cell">
                      <span className="ms-change-when">{c.earlier.when}</span>
                      {c.earlier.text}
                    </div>
                    <div role="cell">
                      <span className="ms-change-when">{c.recent.when}</span>
                      {c.recent.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ms-quiet">Not enough on record yet to set earlier against more recent. This fills in once there are answers at least two weeks apart.</p>
            )}
          </Section>

          {leans.length > 0 && (
            <Section id="ms-strengths" icon="star" tone="amber" title="Your strengths and areas to grow" note="What your answers showed, and where there is room to explore.">
              <ul className="ms-strengths">
                {(showAll ? leans : leans.slice(0, 3)).map((l) => (
                  <li key={l.read.trait} className="ms-strength">
                    <p className="ms-strength-head">{l.side.headline}</p>
                    <p>
                      <strong>Strength:</strong> {l.side.strength}
                    </p>
                    <p>
                      <strong>To explore:</strong> {l.side.grow}
                    </p>
                    <p className="ms-fine">
                      From {l.read.answers} {l.read.answers === 1 ? 'answer' : 'answers'} in {say(l.read.weeks)} {l.read.weeks === 1 ? 'week' : 'weeks'} this {noun}.
                    </p>
                  </li>
                ))}
              </ul>
              {leans.length > 3 && (
                <button type="button" className="text-button" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show fewer' : `View all ${leans.length}`}
                </button>
              )}
            </Section>
          )}

          {helped.length > 0 && (
            <Section id="ms-worked" icon="check" title="What worked for you" note="Only what you marked yourself. Choosing a step is not the same as it working.">
              {helpedSentence(helped) && <p className="ms-lead">{helpedSentence(helped)}</p>}
              <HelpedList items={helped} span={noun} />
            </Section>
          )}

          {(intention || words || threads) && (
            <Section id="ms-memory" icon="notebook" tone="purple" title="Your reflection memory" note="Something from earlier, brought back to ask whether it still matters.">
              {intention && <IntentionAsk id={intention.id} text={intention.text} noun={noun} today={today} onDone={() => setTick((t) => t + 1)} />}
              {words && <OwnWordsView pick={words} span={noun} onChange={() => setTick((t) => t + 1)} />}
              {threads && <MirrorThreads from={p.from} to={p.to} span={noun} />}
            </Section>
          )}
          {!words && !reflectSettings().reflectionsInMirror && (
            <Section id="ms-words" icon="notebook" tone="purple" title="In your own words" note="From your private reflections, only if you want them here.">
              <OwnWordsView pick={null} span={noun} onChange={() => setTick((t) => t + 1)} />
            </Section>
          )}
        </div>

        <aside className="ms-side" aria-label={`Alongside your ${noun}`}>
          {lessons.length > 0 && (
            <Section id={helped.length ? 'ms-lessons' : 'ms-worked'} icon="bulb" tone="amber" title="Lessons from others" note="What people who tried a step from your answers reported" className="ms-side-section">
              <OthersView picks={lessons} />
            </Section>
          )}
          {connected && (
            <Section id="ms-connection" icon="heart" tone="rose" title="Your relationships and connection" className="ms-side-section">
              <InConnection from={p.from} to={p.to} span={noun} />
              <CircleLine own={p.traits} />
            </Section>
          )}
          <ThemeBox noun={noun} from={p.from} today={today} themes={themes} back={back} />
        </aside>
      </div>

      <DepthSwitch deep={deep} onChange={setDeep} />
      {deep && (
        <div className="ms-deeper" role="region" aria-label="Explore deeper">
          {deeper}
        </div>
      )}
      {footer}
    </div>
  )
}

const INTENTION_REPLIES = { keep: 'Kept. It is still in your notebook.', let_go: 'Let go. It won’t come back here.' }

function IntentionAsk({ id, text, noun, today, onDone }: { id: string; text: string; noun: string; today: string; onDone: () => void }) {
  const [said, setSaid] = useState<'keep' | 'let_go' | null>(null)
  return (
    <div className="ms-intention">
      <p className="ms-ask-q">Earlier this {noun}, you wanted to:</p>
      <blockquote className="ms-quote">“{text}”</blockquote>
      <p className="ms-ask-q">What have you noticed since then?</p>
      {said ? (
        <p className="ms-fit-reply">{INTENTION_REPLIES[said]}</p>
      ) : (
        <div className="ms-fit" role="group" aria-label="Does it still matter?">
          <button type="button" className="ms-chip" onClick={() => setSaid('keep')}>
            It still matters
          </button>
          <button
            type="button"
            className="ms-chip"
            onClick={() => {
              checkIntention(id, 'let_go', today)
              setSaid('let_go')
              onDone()
            }}
          >
            Close it
          </button>
        </div>
      )}
    </div>
  )
}

// One direction for the period ahead: a theme the person picks from what
// their own answers reached for, or their own words. Never a plan.
function ThemeBox({ noun, from, today, themes, back }: { noun: 'month' | 'quarter' | 'year'; from: string; today: string; themes: { need: string; theme: string }[]; back: number }) {
  const [picked, setPicked] = useState<string | null>(null)
  if (back > 0) return null
  const chosen = themes.find((t) => t.need === picked)
  return (
    <div className="ms-themes">
      {themes.length > 0 && !chosen && (
        <div className="ms-theme-pick">
          <div className="ms-section-head">
            <Disc icon="arrow" tone="amber" size={40} />
            <div className="ms-section-titles">
              <h3 className="ms-section-title">One direction for the coming {noun}</h3>
              <p className="ms-section-note">A theme from your own answers, if one feels right. Pick one, or none.</p>
            </div>
          </div>
          <div className="ms-theme-chips" role="group" aria-label="Themes">
            {themes.map((t) => (
              <button key={t.need} type="button" className="ms-chip" onClick={() => setPicked(t.need)}>
                {t.theme}
              </button>
            ))}
          </div>
        </div>
      )}
      <DirectionBox
        key={picked ?? 'none'}
        span={noun}
        from={from}
        today={today}
        direction={chosen ? { key: `theme.${chosen.need}`, text: chosen.theme, why: 'A theme you picked from your own answers.' } : null}
        title={chosen ? `Your theme for the coming ${noun}` : `Something of your own for the coming ${noun}?`}
        allowOwn
      />
    </div>
  )
}
