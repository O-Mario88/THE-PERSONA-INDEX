import { readsDeep, rememberDepth } from './mirrorChoices'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Mirror as MirrorData } from './api'
import { connectionBetween } from './connection'
import { getNotAlone, type NotAloneQuestion } from './insights'
import { reflectSettings } from './journal'
import { CircleLine, InConnection, showConnection } from './MirrorConnection'
import {
  DepthSwitch,
  DirectionBox,
  Fit,
  HelpedList,
  JumpRow,
  NotAloneView,
  OthersView,
  OwnWordsView,
  Section,
  StoryHero,
  Why,
  type FitValue,
  type Jump,
} from './MirrorParts'
import {
  getOthersHelped,
  helpedFor,
  helpedSentence,
  notAlonePicks,
  observations,
  othersHelped,
  ownWordsPick,
  say,
  weekDirection,
  weekStory,
  type Observation,
  type OthersStep,
} from './mirrorStory'
import { leanings, weekRange } from './mirrorText'
import { intentions, reflections } from './notebook'
import { checkPattern, patternCheckOf } from './patterns'
import { helplineHere, loadPrefs, pulseOn } from './prefs'
import { leaningVerdict, loadHistory, notMeSides, rememberLeaning } from './profile'

// Your Sunday Mirror (Edwin, 2026-10-26): "What did this week teach me?" A
// thoughtful conversation, readable in three to five minutes: the week's
// story, three things the answers revealed, that others share the
// experience, what helped (you, and others who reported back), the week in
// connection, one line in the person's own words, and one gentle direction.
// "Explore deeper" opens everything else the week holds.
export function SundayMirror({
  m,
  today,
  back,
  onOpenSettings,
  deeper,
  footer,
}: {
  m: MirrorData
  today: string
  back: number
  onOpenSettings?: () => void
  deeper: ReactNode
  footer: ReactNode
}) {
  const [deep, setDeepState] = useState(readsDeep)
  const setDeep = (d: boolean) => {
    rememberDepth(d)
    setDeepState(d)
  }
  const [, setTick] = useState(0)
  const history = useMemo(loadHistory, [m])
  const notMe = notMeSides(today)
  const leans = leanings(m.traits, notMe)
  const helped = useMemo(
    () =>
      helpedFor(m.from, m.to, {
        // A step marked this week counts this week, whenever it was saved.
        steps: m.steps.map((s) => ({ step: s.step, started: s.started < m.from ? m.from : s.started, status: s.status })),
        intentions: intentions(),
      }),
    [m],
  )
  const connection = connectionBetween(m.from, m.to)
  const story = weekStory({
    from: m.from,
    to: m.to,
    history,
    answers: m.stats.answers,
    heavy: m.lowMood,
    lean: leans[0] ? { headline: leans[0].side.headline, lean: leans[0].side.lean } : null,
    helped,
    connection,
  })
  const found = observations({ from: m.from, to: m.to, today, history, leans })
  const pulse = pulseOn(loadPrefs())
  const [counts, setCounts] = useState<NotAloneQuestion[] | null>(null)
  const [others, setOthers] = useState<OthersStep[] | null>(null)
  useEffect(() => {
    let live = true
    if (pulse) getNotAlone(today).then((c) => live && setCounts(c))
    getOthersHelped().then((s) => live && setOthers(s))
    return () => {
      live = false
    }
  }, [today, pulse])
  const alone = notAlonePicks(history, m.from, m.to, counts)
  const othersPicks = othersHelped(history, m.from, m.to, others)
  const words = reflectSettings().reflectionsInMirror ? ownWordsPick(reflections(), m.from, m.to) : null
  const direction = weekDirection({ from: m.from, history, helped, nextStep: m.nextSteps[0]?.step })
  const helpedLine = helpedSentence(helped)
  const connected = showConnection(m.from, m.to)

  const jumps: Jump[] = [
    found.length > 0 && { id: 'ms-revealed', icon: 'leaf', tone: 'green', title: `${found.length === 1 ? 'One thing' : `${cap(say(found.length))} things`} revealed`, note: 'What stood out this week' },
    pulse && alone.length > 0 && { id: 'ms-alone', icon: 'people', tone: 'blue', title: 'You’re not alone', note: 'Shared experiences' },
    (helped.length > 0 || othersPicks.length > 0) && { id: 'ms-helped', icon: 'bulb', tone: 'amber', title: 'What helped', note: othersPicks.length ? 'For you and others' : 'What you tried' },
    connected && { id: 'ms-connection', icon: 'heart', tone: 'rose', title: 'Your connections', note: 'Support and encouragement' },
  ].filter(Boolean) as Jump[]

  const eyebrow = back === 0 ? 'Your Sunday Mirror' : `Your Sunday Mirror · ${weekRange(m.from)}`
  const meta = m.stats.answers > 0 ? `${m.stats.answers} ${m.stats.answers === 1 ? 'answer' : 'answers'} on ${say(m.stats.daysActive)} ${m.stats.daysActive === 1 ? 'day' : 'days'}` : undefined

  return (
    <div className="ms-page">
      <StoryHero eyebrow={eyebrow} story={story} meta={meta} span="week" />

      {m.lowMood && (
        <div className="ms-support" role="note" aria-label="Support">
          <p>Some of your answers this week sounded heavy. If things feel hard, talking to someone you trust, or to a helpline, can help.</p>
          <a href={helplineHere()} target="_blank" rel="noreferrer">
            Find a helpline in your country
          </a>
        </div>
      )}

      <JumpRow jumps={jumps} />

      <div className="ms-grid">
        <div className="ms-main">
          {found.length > 0 && (
            <Section
              id="ms-revealed"
              icon="leaf"
              title={`${found.length === 1 ? 'One thing' : `${cap(say(found.length))} things`} your answers revealed`}
              note="Based on your daily answers. Not labels: what your answers suggest."
            >
              <ol className="ms-obs-list">
                {found.map((o, i) => (
                  <ObservationCard key={o.key} o={o} n={i + 1} today={today} onFit={() => setTick((t) => t + 1)} />
                ))}
              </ol>
            </Section>
          )}

          {helped.length > 0 && (
            <Section id="ms-helped" icon="check" title="What helped you this week?" note="Based on the steps you chose to try, in your own words.">
              {helpedLine && <p className="ms-lead">{helpedLine}</p>}
              <HelpedList items={helped} span="week" />
            </Section>
          )}

          <Section id="ms-words" icon="notebook" tone="purple" title="In your own words" note="From your private reflections, only if you want them here.">
            <OwnWordsView pick={words} span="week" onChange={() => setTick((t) => t + 1)} />
          </Section>
        </div>

        <aside className="ms-side" aria-label="Alongside your week">
          <Section id="ms-alone" icon="people" tone="blue" title="You’re not alone" className="ms-side-section">
            {!pulse ? (
              <>
                <p className="ms-quiet">With the Human Pulse on, this shows how many people chose the same answer as you. Off unless you turn it on.</p>
                {onOpenSettings && (
                  <button type="button" className="text-button" onClick={onOpenSettings}>
                    Human Pulse in Settings
                  </button>
                )}
              </>
            ) : alone.length > 0 ? (
              <>
                <NotAloneView picks={alone} />
                <p className="ms-fine">Real counts, shown only once enough people have answered. Shared, not a sign that one answer is right.</p>
              </>
            ) : (
              <p className="ms-quiet">The picture is still forming for this week’s questions.</p>
            )}
          </Section>

          {othersPicks.length > 0 && (
            <Section id={helped.length ? 'ms-helped-others' : 'ms-helped'} icon="bulb" tone="amber" title="What helped people" note="For a step one of your answers offered" className="ms-side-section">
              <OthersView picks={othersPicks} />
            </Section>
          )}

          {connected && (
            <Section id="ms-connection" icon="heart" tone="rose" title="Your week in connection" className="ms-side-section">
              <InConnection from={m.from} to={m.to} span="week" />
              <CircleLine own={m.traits} />
            </Section>
          )}

          <DirectionBox span="week" from={m.from} today={today} direction={direction} title="One gentle direction for next week" />
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const FIT_TO_CHECK = { me: 'yes', partly: 'partly', not_me: 'no' } as const
const CHECK_TO_FIT = { yes: 'me', partly: 'partly', no: 'not_me' } as const

export function ObservationCard({ o, n, today, onFit, span = 'week' }: { o: Observation; n: number; today: string; onFit?: () => void; span?: 'week' | 'month' | 'quarter' | 'year' }) {
  const initial: FitValue | null =
    o.kind === 'need' && o.need
      ? (() => {
          const c = patternCheckOf(o.need)
          return c ? CHECK_TO_FIT[c.check] : null
        })()
      : o.trait
        ? leaningVerdict(o.trait, !!o.high, today)
        : null
  function fit(v: FitValue) {
    if (o.kind === 'need' && o.need) checkPattern(o.need, FIT_TO_CHECK[v], today)
    else if (o.trait) rememberLeaning(o.trait, !!o.high, v, today)
    onFit?.()
  }
  return (
    <li className="ms-obs">
      <h4 className="ms-obs-title">
        <span className="ms-obs-n">{n}.</span> {o.title}
      </h4>
      <dl className="ms-obs-parts">
        <div>
          <dt>Strength worth appreciating</dt>
          <dd>{o.strength}</dd>
        </div>
        <div>
          <dt>Something to explore</dt>
          <dd>{o.explore}</dd>
        </div>
      </dl>
      <Why items={o.evidence} span={span} label={o.seen === 1 ? 'Seen in 1 answer' : `Seen in ${o.seen} answers`} />
      <Fit value={initial} onFit={fit} />
    </li>
  )
}
