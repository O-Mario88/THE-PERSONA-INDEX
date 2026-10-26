import { readsDeep, rememberDepth } from './mirrorChoices'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getPeriodMirror, PERIODS_BACK, type PeriodMirror } from './api'
import { reflectSettings } from './journal'
import { CircleLine, InConnection, showConnection } from './MirrorConnection'
import { keepLetter, keepProud, proudOf } from './mirrorChoices'
import { DepthSwitch, HelpedList, JumpRow, OwnWordsView, Section, StoryHero, type Jump } from './MirrorParts'
import {
  chapterOf,
  changeRows,
  helpedFor,
  NEED_NAMES,
  NEED_PHRASES,
  NEED_PLAIN,
  needsOfYear,
  whenSaid,
  wordsRemembered,
  yearStory,
  type Chapter,
} from './mirrorStory'
import { intentions, reflections } from './notebook'
import { loadHistory } from './profile'

// My Year in Perspective: A Year of Becoming (Edwin, 2026-10-26). "How
// have I grown, what shaped me, and where am I going?" A short book of the
// year, in four chapters (one per quarter, each from its own record), the
// experiences that shaped it, how the person's perspective moved, the needs
// that kept appearing, what helped through hard stretches, the people, their
// own words, what they're proud of, and what they carry forward. Where a
// stretch has nothing on record it says so, rather than guessing.
export function YearMirror({ y, today, back, deeper, footer }: { y: PeriodMirror; today: string; back: number; deeper: ReactNode; footer: ReactNode }) {
  const [deep, setDeepState] = useState(readsDeep)
  const setDeep = (d: boolean) => {
    rememberDepth(d)
    setDeepState(d)
  }
  const [, setTick] = useState(0)
  const quarters = useQuarters(y, today)
  const chapters = [1, 2, 3, 4].map((q) => chapterOf(q, quarters ? quarters[q - 1] : null))
  const story = quarters ? yearStory(chapters, y) : { headline: 'Gathering your year…', paragraphs: [], evidence: [] }
  const history = useMemo(loadHistory, [y])
  const helped = helpedFor(y.from, y.to, { helped: y.helped, noChange: y.noChange, intentions: intentions() })
  const needs = needsOfYear(y, (quarters ?? []).map((q) => (q && q !== 'later' ? q : null)))
  const told = chapters.filter((c) => c.state === 'told')
  const firstTold = told[0]
  const lastTold = told[told.length - 1]
  const pairs = changeRows({ p: { ...y, previousNeeds: undefined }, previousName: null, history, reflections: reflections(), today, includeReflections: reflectSettings().reflectionsInGrowth || reflectSettings().reflectionsInMirror })
  const remembered = reflectSettings().reflectionsInMirror ? wordsRemembered(reflections(), y.from, y.to) : []
  const connected = showConnection(y.from, y.to)

  const jumps: Jump[] = [
    { id: 'ms-chapters', icon: 'doc', tone: 'blue', title: 'Your chapters', note: 'The year in four parts' },
    y.moments.length > 0 && { id: 'ms-shaped', icon: 'star', tone: 'amber', title: 'What shaped it', note: 'Moments in your answers' },
    needs.length > 0 && { id: 'ms-needs', icon: 'leaf', tone: 'green', title: 'What mattered', note: 'Peace, meaning, connection' },
    { id: 'ms-forward', icon: 'arrow', tone: 'purple', title: 'Carrying forward', note: 'Into next year' },
  ].filter(Boolean) as Jump[]

  return (
    <div className="ms-page ms-year">
      <StoryHero eyebrow={`My year in perspective · ${y.label}`} story={story} meta={y.stats.answers > 0 ? `${y.stats.answers.toLocaleString('en-GB')} answers in ${y.stats.weeksActive} weeks` : undefined} span="year" />
      <JumpRow jumps={jumps} />

      <Section id="ms-chapters" icon="doc" tone="blue" title="The chapters of your year" note="One for each quarter, from what was kept of it. A year can be hard, steady, joyful, uncertain, or all four.">
        <ol className="ms-chapters">
          {chapters.map((c) => (
            <ChapterCard key={c.quarter} c={c} />
          ))}
        </ol>
      </Section>

      <div className="ms-grid">
        <div className="ms-main">
          {y.moments.length > 0 && (
            <Section id="ms-shaped" icon="star" tone="amber" title="The experiences that shaped your year" note="Questions where your answer said the most. Only what you answered; nothing is assumed about what happened.">
              <ul className="ms-moments">
                {y.moments.map((m) => (
                  <li key={`${m.date}-${m.prompt}`} className="ms-moment">
                    <span className="ms-change-when">{whenSaid(m.date, 'year')}</span>
                    <p className="ms-moment-q">{m.prompt}</p>
                    <p className="ms-moment-a">You chose “{m.label}”.</p>
                    {m.headline && <p className="ms-fine">{m.headline}</p>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section id="ms-perspective" icon="mountain" tone="blue" title="How your perspective changed" note="Your earliest and latest record, side by side. No growth score: changing is not always better, and staying the same is not always worse.">
            {firstTold && lastTold && firstTold !== lastTold ? (
              <div className="ms-changes" role="table" aria-label="Earlier and later in the year">
                <div className="ms-changes-head" role="row">
                  <span role="columnheader">Earlier</span>
                  <span role="columnheader">Later</span>
                </div>
                <div className="ms-change" role="row">
                  <p className="ms-change-area">What your answers reached for most</p>
                  <div role="cell">
                    <span className="ms-change-when">{firstTold.months}</span>
                    {cap(NEED_PHRASES[firstTold.needs[0].need])}, in {firstTold.needs[0].answers} answers.
                  </div>
                  <div role="cell">
                    <span className="ms-change-when">{lastTold.months}</span>
                    {cap(NEED_PHRASES[lastTold.needs[0].need])}, in {lastTold.needs[0].answers} answers.
                  </div>
                </div>
                {pairs.map((c) => (
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
              <p className="ms-quiet">There is not yet enough dated evidence from different parts of the year to show a change. It will not be guessed.</p>
            )}
          </Section>

          {needs.length > 0 && (
            <Section id="ms-needs" icon="leaf" title="What brought you peace, meaning and connection" note="The needs your choices reached for this year. None is healthier than another.">
              <ul className="ms-needs">
                {needs.map((n) => (
                  <li key={n.need} className="ms-need">
                    <p className="ms-need-name">
                      {NEED_NAMES[n.need]} <span className="ms-tag is-quiet">{n.answers} answers</span>
                    </p>
                    <p>{NEED_PLAIN[n.need]}</p>
                    {n.example && (
                      <p className="ms-fine">
                        For example, on {whenSaid(n.example.date, 'year')}: {n.example.prompt} You chose “{n.example.label}”.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {helped.length > 0 && (
            <Section id="ms-helped" icon="check" title="What helped you through" note="The small steps you tried and what you said about them: knowledge for the years ahead.">
              <HelpedList items={helped} span="year" />
            </Section>
          )}

          <Section id="ms-words" icon="notebook" tone="purple" title="Your words, remembered" note="Reflections you wrote, earliest and latest, side by side. Only on this phone.">
            {remembered.length > 0 ? (
              <div className="ms-remembered">
                {remembered.map((r) => (
                  <blockquote key={r.id} className="ms-quote">
                    “{r.answer.length > 280 ? `${r.answer.slice(0, 279)}…` : r.answer}”<span className="ms-quote-when">{whenSaid(r.date, 'year')}</span>
                  </blockquote>
                ))}
              </div>
            ) : (
              <OwnWordsView pick={null} span="year" onChange={() => setTick((t) => t + 1)} />
            )}
          </Section>
        </div>

        <aside className="ms-side" aria-label="Alongside your year">
          {connected && (
            <Section id="ms-connection" icon="heart" tone="rose" title="The people and connections that mattered" note="What you did, never who. No rankings." className="ms-side-section">
              {/* A year's weeks can start in late December and end in early January;
                  the month by month view keeps to the calendar year. */}
              <InConnection from={/^\d{4}$/.test(y.label) && y.from < `${y.label}-01-01` ? `${y.label}-01-01` : y.from} to={/^\d{4}$/.test(y.label) && y.to > `${y.label}-12-31` ? `${y.label}-12-31` : y.to} span="year" />
              <CircleLine own={y.traits} />
            </Section>
          )}
          <Proud year={y.label} />
        </aside>
      </div>

      <Forward y={y} chapters={chapters} helped={helped.filter((h) => h.outcome === 'helped' || h.outcome === 'some').map((h) => h.text)} today={today} back={back} />

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

// Each quarter of the year, read from its own mirror. A quarter that has not
// begun is "later"; one older than the weekly notes kept is null.
function useQuarters(y: PeriodMirror, today: string): (PeriodMirror | null | 'later')[] | null {
  const [quarters, setQuarters] = useState<(PeriodMirror | null | 'later')[] | null>(null)
  useEffect(() => {
    let live = true
    setQuarters(null)
    getPeriodMirror('quarter', today)
      .then(async (now) => {
        const [cy, cq] = now.label.split('-Q').map(Number)
        const year = Number(y.label)
        if (!Number.isInteger(cy) || !Number.isInteger(cq) || !Number.isInteger(year)) {
          if (live) setQuarters([null, null, null, null])
          return
        }
        const out = await Promise.all(
          [1, 2, 3, 4].map(async (q): Promise<PeriodMirror | null | 'later'> => {
            const back = cy * 4 + cq - (year * 4 + q)
            if (back < 0) return 'later'
            if (back > PERIODS_BACK.quarter) return null
            if (back === 0) return now
            return getPeriodMirror('quarter', today, back).catch(() => null)
          }),
        )
        if (live) setQuarters(out)
      })
      .catch(() => live && setQuarters([null, null, null, null]))
    return () => {
      live = false
    }
  }, [y, today])
  return quarters
}

function ChapterCard({ c }: { c: Chapter }) {
  return (
    <li className={`ms-chapter is-${c.state}`}>
      <p className="ms-chapter-months">{c.months}</p>
      <p className="ms-chapter-title">{c.title}</p>
      {c.state === 'told' && (
        <p className="ms-fine">
          {c.needs
            .slice(0, 2)
            .map((n) => `${NEED_NAMES[n.need]}: ${n.answers}`)
            .join(' · ')}
        </p>
      )}
      {c.state === 'counted' && c.answers > 0 && <p className="ms-fine">{c.answers} answers in {c.weeks} weeks. What they reached for was not yet counted then.</p>}
      {c.state === 'none' && <p className="ms-fine">Nothing kept from these months, so nothing is said.</p>}
      {c.state === 'later' && <p className="ms-fine">This chapter has not begun.</p>}
      {c.moment && (
        <p className="ms-chapter-moment">
          {c.moment.prompt} You chose “{c.moment.label}”.
        </p>
      )}
      {c.helped[0] && <p className="ms-chapter-helped">What helped: “{c.helped[0]}”</p>}
    </li>
  )
}

// What you're proud of: the person's own words, kept in the journal.
function Proud({ year }: { year: string }) {
  const [text, setText] = useState(() => proudOf(year))
  const [saved, setSaved] = useState(false)
  return (
    <section className="ms-proud" aria-labelledby="ms-proud-title">
      <h3 id="ms-proud-title" className="ms-section-title">
        What you’re proud of
      </h3>
      <label className="ms-own-label" htmlFor="ms-proud-text">
        What is something about this year you’re proud of, even if nobody else noticed?
      </label>
      <textarea
        id="ms-proud-text"
        rows={4}
        value={text}
        maxLength={1000}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
      />
      <div className="ms-direction-buttons">
        <button
          type="button"
          className="btn"
          onClick={() => {
            keepProud(year, text)
            setSaved(true)
          }}
        >
          Keep it
        </button>
        {saved && <span className="ms-fit-reply">Kept, privately, in your journal.</span>}
      </div>
      <p className="ms-fine">Only yours. It is encrypted with your journal and never shared.</p>
    </section>
  )
}

// What you're carrying forward, a letter to your future self, and a
// private printable edition.
function Forward({ y, chapters, helped, today, back }: { y: PeriodMirror; chapters: Chapter[]; helped: string[]; today: string; back: number }) {
  const [letter, setLetter] = useState('')
  const [kept, setKept] = useState(false)
  const [withWords, setWithWords] = useState(false)
  const lastTold = [...chapters].reverse().find((c) => c.state === 'told')
  const lines: string[] = []
  if (lastTold) lines.push(`What still matters, by your latest answers: ${NEED_PHRASES[lastTold.needs[0].need]}.`)
  if (helped[0]) lines.push(`What you learned helps you: “${helped[0]}”${helped[1] ? ` and “${helped[1]}”` : ''}.`)
  if (y.noChange && y.noChange[0]) lines.push(`What made little difference, and is fine to leave: “${y.noChange[0].step}”.`)
  return (
    <section id="ms-forward" className="ms-forward" aria-labelledby="ms-forward-title" tabIndex={-1}>
      <h3 id="ms-forward-title" className="ms-section-title">
        What you’re carrying forward
      </h3>
      {lines.length > 0 ? (
        <ul className="ms-forward-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="ms-quiet">As the year fills in, what you learned and what still matters gathers here.</p>
      )}
      {back === 0 && (
        <div className="ms-letter">
          <label className="ms-own-label" htmlFor="ms-letter-text">
            Write a letter to your future self
          </label>
          <p className="ms-fine">Optional, and only in your words. It is kept in your encrypted journal, in Reflect.</p>
          <textarea id="ms-letter-text" rows={5} value={letter} maxLength={4000} onChange={(e) => setLetter(e.target.value)} />
          <div className="ms-direction-buttons">
            <button
              type="button"
              className="btn"
              disabled={!letter.trim() || kept}
              onClick={() => {
                keepLetter(y.label, letter, today)
                setKept(true)
              }}
            >
              {kept ? 'Kept in your journal' : 'Keep my letter'}
            </button>
          </div>
        </div>
      )}
      <div className="ms-print">
        <label className="ms-print-words">
          <input type="checkbox" checked={withWords} onChange={(e) => setWithWords(e.target.checked)} /> Include my own words
        </label>
        <button
          type="button"
          className="ms-chip"
          onClick={() => {
            document.documentElement.classList.toggle('ms-print-no-words', !withWords)
            window.print?.()
          }}
        >
          Print or save as PDF
        </button>
        <p className="ms-fine">Made on this device. Your journal text is left out unless you tick the box.</p>
      </div>
    </section>
  )
}
