import { useEffect, useMemo, useState } from 'react'
import { cachedEdition, getMirror, recalledChoice, type Mirror, type Question } from './api'
import { reflectSettings, rootOf, setReflectSettings, type ReflectSettings } from './journal'
import { intentionsDue, keptCards, reflections, type Reflection, type ReflectionPeriod } from './notebook'
import { noticedFrom, type Noticed } from './noticed'
import { loadHistory } from './profile'
import { PERIOD_NAMES, reflectionItems } from './reflect'
import { ReflectNoticed } from './ReflectNoticed'
import { ReflectSide } from './ReflectSide'
import { ReflectThread } from './ReflectThread'
import { PRIVACY_LINE, ReflectWriting } from './ReflectWriting'
import { accountToken, outsideMirror, type OutsideMirror } from './social'
import { addDays } from './storage'
import { thoughtsFor, type Answered, type Thought } from './thoughts'
import { Icon } from './ui/icons'
import { restoreWriting, writingWaits } from './vault'

// Reflect (Edwin, 2026-10-25): a quiet space for your thoughts. Writing
// first, with one question made on this phone from the person's own answers,
// cards, Mirrors and earlier words, or none at all; then what they have
// noticed across the parts of their life, and earlier words brought back.
// Everything stays on this phone, and the backup carries the writing only in
// its end-to-end journal copy.

const SPAN_DAYS: Record<ReflectionPeriod, number> = { day: 0, week: 6, month: 30 }
const THIS: Record<ReflectionPeriod, string> = { day: 'today', week: 'this week', month: 'this month' }
const NEXT: Record<ReflectionPeriod, string> = { day: 'tomorrow', week: 'next week', month: 'next month' }
const NOTICED_SOURCE: Record<Noticed['source'], string> = {
  answers: 'From your answers',
  week: 'From your answers this week',
  circle: 'From your Circle',
  reflections: 'From your reflections',
}

// The questions answered in a span, from this phone's history and the
// editions it kept, newest first.
function answeredIn(period: ReflectionPeriod, today: string, todays: Question[]): Answered[] {
  const from = addDays(today, -SPAN_DAYS[period])
  const out: Answered[] = []
  for (const a of [...loadHistory().answers].reverse()) {
    if (a.date < from || a.date > today || !a.optionId || a.regional) continue
    const set = a.date === today ? null : cachedEdition(a.date)
    const q = (a.date === today ? todays : [...(set?.questions ?? []), ...(set?.evening ?? [])]).find((x) => x.id === a.questionId)
    const option = q?.options.find((o) => o.id === a.optionId)
    if (q && option) out.push({ question: q, option, date: a.date })
  }
  return out
}

function fromNoticed(n: Noticed, period: ReflectionPeriod): Thought {
  return {
    id: `noticed-${n.area}-${n.group}`,
    question: n.group === 'grow' ? `What is one small thing you could try ${NEXT[period]}?` : `Where did this help you ${THIS[period]}?`,
    lead: n.text,
    why: NOTICED_SOURCE[n.source],
    source: n.source === 'circle' ? 'circle' : n.source === 'week' ? 'week' : n.source === 'reflections' ? 'reflections' : 'answers',
    area: n.area,
  }
}

function followUp(r: Reflection): Thought {
  return {
    id: `follow-${r.id}`,
    question: 'Have you noticed anything changing since?',
    lead: `You wrote: “${r.answer.length > 160 ? `${r.answer.slice(0, 160)}…` : r.answer}”`,
    why: 'From your reflection memory',
    source: 'reflections',
    area: r.area,
    followsUp: r.id,
  }
}

export function ReflectGuide({ today, questions }: { today: string; questions: Question[] }) {
  const [period, setPeriod] = useState<ReflectionPeriod>('day')
  const [free, setFree] = useState(false)
  const [at, setAt] = useState(0)
  const [chosen, setChosen] = useState<{ thought: Thought; thread?: string } | null>(null)
  const [thread, setThread] = useState<Reflection | null>(null)
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [outside, setOutside] = useState<OutsideMirror | null>(null)
  const [settings, setSettings] = useState<ReflectSettings>(reflectSettings)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    if (period !== 'day') getMirror(today).then((m) => live && setMirror(m), () => {})
    if (accountToken()) outsideMirror().then((o) => live && setOutside(o), () => {})
    return () => {
      live = false
    }
  }, [period, today])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- version marks a save on this phone
  const past = useMemo(() => reflections(), [version])
  const answered = useMemo(() => answeredIn(period, today, questions), [period, today, questions])
  const thoughts = useMemo(
    () => thoughtsFor({ period, today, answered, kept: keptCards(), traits: mirror?.traits ?? null, outside, past, due: intentionsDue(today) }),
    [period, today, answered, mirror, outside, past],
  )
  const thought = chosen?.thought ?? thoughts[at % thoughts.length]

  const todays = questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    const option = q.options.find((o) => o.id === id)
    return option ? [{ question: q, option }] : []
  })
  const items = reflectionItems(period, period === 'day' ? todays : answered, mirror, outside)
  const noticed = noticedFrom(items, past, settings.reflectionsInNoticed, addDays(today, -30))
  const consider = noticed.find((n) => n.group === 'grow') ?? null

  function choose(next: { thought: Thought; thread?: string }) {
    setFree(false)
    setChosen(next)
    if (typeof window !== 'undefined') window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }
  function changeSettings(next: Partial<ReflectSettings>) {
    setReflectSettings(next)
    setSettings(reflectSettings())
  }
  const saved = () => setVersion((v) => v + 1)
  const done = () => setChosen(null)

  if (thread) {
    return <ReflectThread from={thread} today={today} period={period} onBack={() => setThread(null)} onSaved={() => setVersion((v) => v + 1)} />
  }

  return (
    <section className="reflect" aria-labelledby="reflect-title">
      <header className="page-head">
        <h2 id="reflect-title" className="display">
          Reflect
        </h2>
        <p>A quiet space for your thoughts.</p>
      </header>

      <div className="reflect-controls">
        <div className="m-spans is-three" role="group" aria-label="Reflect on">
          {(Object.keys(PERIOD_NAMES) as ReflectionPeriod[]).map((p) => (
            <button
              key={p}
              type="button"
              className="m-span"
              aria-pressed={!free && period === p}
              onClick={() => {
                setFree(false)
                setPeriod(p)
                setAt(0)
                setChosen(null)
              }}
            >
              {PERIOD_NAMES[p]}
            </button>
          ))}
        </div>
        <button type="button" className="btn outline small" aria-pressed={free} onClick={() => setFree(!free)}>
          <Icon name="reflect" size={16} /> Write freely
        </button>
      </div>

      {writingWaits() && <BringBack onBack={() => setVersion((v) => v + 1)} />}

      <div className="reflect-layout">
        <div className="reflect-main">
          <ReflectWriting
            key={`${free ? 'free' : period}-${thought.id}`}
            today={today}
            period={period}
            free={free}
            thought={free ? null : thought}
            thread={chosen?.thread}
            onAnother={chosen ? () => setChosen(null) : () => setAt((n) => n + 1)}
            onSaved={saved}
            onDone={done}
          />
          <ReflectNoticed noticed={noticed} onReflect={(n) => choose({ thought: fromNoticed(n, period) })} />
        </div>
        <ReflectSide
          key={version}
          today={today}
          consider={consider}
          onFollowUp={(r) => choose({ thought: followUp(r), thread: rootOf(r) })}
          onOpenThread={setThread}
          onReflect={(n) => choose({ thought: fromNoticed(n, period) })}
        />
      </div>

      <section className="reflect-choices" aria-labelledby="choices-title">
        <h3 id="choices-title" className="card-title">
          Your choices
        </h3>
        <label className="toggle-row">
          <span>
            <span className="toggle-label">Use my reflections in What you’ve noticed</span>
            <span className="toggle-note">Only counts of what you wrote about, worked out on this phone. Off unless you turn it on.</span>
          </span>
          <input type="checkbox" role="switch" checked={settings.reflectionsInNoticed} onChange={(e) => changeSettings({ reflectionsInNoticed: e.target.checked })} />
        </label>
        <label className="toggle-row">
          <span>
            <span className="toggle-label">Let my threads add to the longer Mirrors</span>
            <span className="toggle-note">Your month, quarter and year Mirrors show which threads you kept going. Off unless you turn it on.</span>
          </span>
          <input type="checkbox" role="switch" checked={settings.threadsInMirror} onChange={(e) => changeSettings({ threadsInMirror: e.target.checked })} />
        </label>
        <p className="muted small">
          <Icon name="lock" size={14} /> {PRIVACY_LINE} Download or delete your reflections in You.
        </p>
      </section>
    </section>
  )
}

// On a phone restored through sync, the writing is still sealed: the 12
// words bring it back, once.
function BringBack({ onBack }: { onBack: () => void }) {
  const [phrase, setPhrase] = useState('')
  const [note, setNote] = useState('')
  async function bring() {
    try {
      const r = await restoreWriting(phrase)
      if (r === 'restored') onBack()
      else setNote(r === 'mismatch' ? 'Those aren’t the 12 words for this account’s backup.' : 'No reflections were found under those words.')
    } catch {
      setNote('Check the 12 words: one of them isn’t right.')
    }
  }
  return (
    <section className="reflect-card is-sealed" aria-labelledby="sealed-title">
      <h3 id="sealed-title" className="card-title">
        <Icon name="lock" size={18} /> Your reflections are sealed with your 12 words
      </h3>
      <p className="muted">
        Everything else came back with sync. Your writing is end-to-end encrypted, so only your 12 words can open it. You’ll only need to do this once on this
        device.
      </p>
      <label className="field-label" htmlFor="sealed-words">
        Your 12 words
      </label>
      <textarea id="sealed-words" className="field" rows={2} autoComplete="off" spellCheck={false} value={phrase} onChange={(e) => setPhrase(e.target.value)} />
      {note && (
        <p role="alert" className="error small">
          {note}
        </p>
      )}
      <button type="button" className="btn small" disabled={phrase.trim().split(/\s+/).length !== 12} onClick={bring}>
        Bring them back
      </button>
    </section>
  )
}
