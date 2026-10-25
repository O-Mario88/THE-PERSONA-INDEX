import { useEffect, useState } from 'react'
import { getMirror, recalledChoice, type Mirror, type Question } from './api'
import { keepReflection, reflections, type ReflectionGroup, type ReflectionPeriod } from './notebook'
import { AREA_NAMES, dayMonth, PERIOD_NAMES, reflectionItems, reflectionPrompts, SOURCE_NAMES, type ReflectionItem, type ReflectionPrompt } from './reflect'
import { accountToken, outsideMirror, type OutsideMirror } from './social'

// The top of the Reflect tab (Edwin, 2026-10-25): how the day, week or month
// went, in the person's own words. Kept in the notebook on this phone.

const GROUP_TITLES: Record<ReflectionGroup, string> = {
  learnt: 'What you learnt about yourself',
  strength: 'What’s going well',
  grow: 'Where you could grow',
}

export function ReflectGuide({ today, questions }: { today: string; questions: Question[] }) {
  const [period, setPeriod] = useState<ReflectionPeriod>('day')
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [outside, setOutside] = useState<OutsideMirror | null>(null)
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (period === 'day') return
    let live = true
    getMirror(today).then((m) => live && setMirror(m), () => {})
    if (accountToken()) outsideMirror().then((o) => live && setOutside(o), () => {})
    return () => {
      live = false
    }
  }, [period, today])

  const answered = questions.flatMap((q) => {
    const id = recalledChoice(q.id)
    const option = q.options.find((o) => o.id === id)
    return option ? [{ question: q, option }] : []
  })
  const items = reflectionItems(period, answered, mirror, outside)
  const past = reflections()
  const done = new Set(past.filter((r) => r.date === today && r.period === period).map((r) => `${r.question}|${r.about}`))
  const prompts = reflectionPrompts(items, period, past, today).filter((p) => p.followsUp || !done.has(`${p.question}|${p.text}`))

  function keep(p: ReflectionPrompt, answer: string) {
    keepReflection({
      id: p.followsUp ? `follow-${p.followsUp}-${today}` : `${today}-${period}-${p.id}`,
      date: today,
      period,
      area: p.area,
      group: p.group,
      source: p.source,
      about: p.text,
      question: p.question,
      answer,
      ...(p.followsUp ? { followsUp: p.followsUp } : {}),
    })
    setVersion((v) => v + 1)
  }

  return (
    <section className="reflect" aria-labelledby="reflect-title">
      <header className="page-head">
        <p className="label">Reflect</p>
        <h2 id="reflect-title" className="display">
          How did it go?
        </h2>
        <p>What you learnt about yourself, what went well and where you could grow. In your own words.</p>
      </header>

      <div className="m-spans is-three" role="group" aria-label="Look back over">
        {(Object.keys(PERIOD_NAMES) as ReflectionPeriod[]).map((p) => (
          <button key={p} type="button" className="m-span" aria-pressed={period === p} onClick={() => setPeriod(p)}>
            {PERIOD_NAMES[p]}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="notice">
          {period === 'day' ? 'Answer today’s questions and what they said about you shows here, ready to reflect on.' : 'A few days of answers and your week fills this in.'}
        </p>
      ) : (
        (['learnt', 'strength', 'grow'] as ReflectionGroup[]).map((g) => <ItemGroup key={g} group={g} items={items.filter((i) => i.group === g)} />)
      )}

      {prompts.length > 0 && (
        <div className="reflect-prompts">
          <h3 className="card-title">Reflect on it</h3>
          {prompts.map((p) => (
            <PromptCard key={p.id} prompt={p} onKeep={(a) => keep(p, a)} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="reflect-history">
          <h3 className="card-title">Your reflections</h3>
          <ul aria-label="Your reflections">
            {past.slice(0, 20).map((r) => (
              <li key={r.id}>
                <p className="nb-meta">
                  {dayMonth(r.date)} · {AREA_NAMES[r.area]}
                </p>
                <p className="muted small">{r.question}</p>
                <p className="nb-line">“{r.answer}”</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">Kept on this phone, and in your backup if you turn it on. Never sent.</p>
    </section>
  )
}

function ItemGroup({ group, items }: { group: ReflectionGroup; items: ReflectionItem[] }) {
  if (items.length === 0) return null
  return (
    <div className={`reflect-group is-${group}`} role="group" aria-label={GROUP_TITLES[group]}>
      <h3 className="card-title">{GROUP_TITLES[group]}</h3>
      {items.map((i) => (
        <div key={i.id} className="reflect-item">
          <p className="reflect-meta">
            <span className="reflect-area">{AREA_NAMES[i.area]}</span> · {SOURCE_NAMES[i.source]}
          </p>
          <p className="reflect-text">{i.text}</p>
        </div>
      ))}
    </div>
  )
}

function PromptCard({ prompt, onKeep }: { prompt: ReflectionPrompt; onKeep: (answer: string) => void }) {
  const [text, setText] = useState('')
  const id = `reflect-${prompt.id}`
  return (
    <form
      className="card reflect-prompt"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) onKeep(text)
      }}
    >
      {!prompt.followsUp && <p className="muted small">{prompt.text}</p>}
      <label htmlFor={id} className="reflect-question">
        {prompt.question}
      </label>
      <textarea id={id} className="field" rows={3} maxLength={600} placeholder="Write a line or two…" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="btn small" disabled={!text.trim()}>
        Keep this
      </button>
    </form>
  )
}
