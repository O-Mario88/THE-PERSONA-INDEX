import { useEffect, useRef, useState } from 'react'
import { draftOf, rootOf, saveDraft, type DraftSpace } from './journal'
import { checkIntention, keepIntention, keepReflection, reflections, type IntentionCheck, type ReflectionPeriod } from './notebook'
import { dayMonth } from './reflect'
import { listen, localSpeech } from './speech'
import type { Thought } from './thoughts'
import { Icon } from './ui/icons'

// The writing card of Reflect: one question (or none, writing freely),
// a spacious editor, a word count and Save. After saving, the person may
// keep something they would like to try, or add it to a thread. Everything
// stays on this phone; the backup carries it only in the end-to-end
// journal copy.

export const PRIVACY_LINE = 'Your writing is private, end-to-end encrypted and synced only to your devices.'

const CHECKS: { id: IntentionCheck; label: string }[] = [
  { id: 'helped', label: 'It helped' },
  { id: 'some', label: 'A little' },
  { id: 'not_yet', label: 'Not yet' },
  { id: 'let_go', label: 'Let it go' },
]

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

type Props = {
  today: string
  period: ReflectionPeriod
  free: boolean
  thought: Thought | null
  thread?: string // continuing this thread
  onAnother?: () => void
  onSaved: () => void
}

export function ReflectWriting({ today, period, free, thought, thread, onAnother, onSaved }: Props) {
  const space: DraftSpace = free ? 'free' : period
  const [text, setText] = useState(() => draftOf(space))
  const [check, setCheck] = useState<IntentionCheck | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [canSpeak, setCanSpeak] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const stop = useRef<() => void>(() => {})

  useEffect(() => {
    let live = true
    localSpeech().then((ok) => live && setCanSpeak(ok))
    return () => {
      live = false
      stop.current()
    }
  }, [])

  const id = free ? 'reflect-free' : `reflect-${thought?.id ?? 'thought'}`
  const label = free ? 'Write freely' : (thought?.question ?? 'Your reflection')

  function change(next: string) {
    setText(next)
    saveDraft(space, next)
  }

  function speak() {
    if (speaking) {
      stop.current()
      return
    }
    setSpeaking(true)
    stop.current = listen(
      (t) => setText((prev) => {
        const next = prev.trim() ? `${prev.trim()} ${t}` : t
        saveDraft(space, next)
        return next
      }),
      () => setSpeaking(false),
    )
  }

  function save() {
    if (thought?.intention && check) checkIntention(thought.intention, check, today)
    if (!text.trim()) {
      if (check) onSaved()
      return
    }
    const rid = `${today}-${free ? 'free' : period}-${Date.now().toString(36)}`
    keepReflection({
      id: rid,
      date: today,
      period,
      area: thought?.area ?? 'self',
      group: 'learnt',
      source: thought?.source === 'circle' ? 'circle' : thought?.source === 'week' ? 'week' : 'answers',
      about: free ? '' : (thought?.lead ?? ''),
      question: free ? 'Written freely' : (thought?.question ?? ''),
      answer: text,
      ...(free ? { free: true as const } : {}),
      ...(thought && !free ? { why: thought.why } : {}),
      ...(thought?.followsUp ? { followsUp: thought.followsUp } : {}),
      ...(thread ? { thread } : {}),
    })
    setText('')
    saveDraft(space, '')
    setSaved(rid)
    onSaved()
  }

  if (saved) return <AfterSaving id={saved} today={today} onDone={() => setSaved(null)} />

  return (
    <section className={free ? 'reflect-write is-free' : 'reflect-write'} aria-labelledby={`${id}-label`}>
      <div className="reflect-thought">
        <span className="icon-disc is-solid" aria-hidden="true">
          <Icon name={free ? 'reflect' : 'heart'} size={20} />
        </span>
        <div>
          <p className="label">{free ? 'Write freely' : thread ? 'Continue the thread' : 'A thought for you'}</p>
          <h3 id={`${id}-label`} className="reflect-q">
            {free ? 'Whatever is on your mind.' : label}
          </h3>
          <p className="muted">{free ? 'No question, no shape to fill. Just your words.' : thought?.lead}</p>
          {!free && thought && <p className="reflect-why">{thought.why}</p>}
        </div>
        {!free && onAnother && (
          <button type="button" className="icon-button" aria-label="Another question" onClick={onAnother}>
            <Icon name="scan" size={18} />
          </button>
        )}
      </div>

      {thought?.intention && (
        <div className="chips" role="group" aria-label="How did it go?">
          {CHECKS.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={check === c.id} onClick={() => setCheck(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="reflect-editor">
        <textarea id={id} className="field" rows={6} aria-label={label} placeholder="Start writing here…" value={text} onChange={(e) => change(e.target.value)} />
        <div className="reflect-tools">
          {canSpeak && (
            <button type="button" className="text-button" aria-pressed={speaking} onClick={speak}>
              <Icon name="chat" size={18} /> {speaking ? 'Stop' : 'Speak'}
            </button>
          )}
          <span className="muted small reflect-count">{words(text) === 1 ? '1 word' : `${words(text)} words`}</span>
        </div>
      </div>

      <div className="reflect-save">
        <p className="muted small">
          <Icon name="lock" size={14} /> {PRIVACY_LINE}
        </p>
        <button type="button" className="btn" disabled={!text.trim() && !check} onClick={save}>
          Save reflection <Icon name="arrow" size={16} />
        </button>
      </div>
    </section>
  )
}

// After saving: optionally something to try, optionally a thread. Neither
// is needed; "Done" leaves it as it is.
function AfterSaving({ id, today, onDone }: { id: string; today: string; onDone: () => void }) {
  const [intention, setIntention] = useState('')
  const [kept, setKept] = useState(false)
  const [linked, setLinked] = useState('')
  const earlier = reflections().filter((r) => r.id !== id && r.date <= today).slice(0, 8)

  function link(target: string) {
    const r = reflections().find((x) => x.id === id)
    const to = reflections().find((x) => x.id === target)
    if (!r || !to) return
    keepReflection({ ...r, thread: rootOf(to) })
    setLinked(to.question === 'Written freely' ? to.answer.slice(0, 40) : to.question)
  }

  return (
    <section className="reflect-write reflect-after" aria-label="Saved">
      <p role="status" className="reflect-saved">
        <Icon name="check" size={18} /> Saved, on this phone and in your end-to-end backup.
      </p>
      {!kept ? (
        <form
          className="reflect-try"
          onSubmit={(e) => {
            e.preventDefault()
            keepIntention({ id: `${id}-try`, date: today, text: intention, from: id })
            setKept(true)
          }}
        >
          <label className="field-label" htmlFor="reflect-try">
            Something I’d like to try (optional)
          </label>
          <div className="row-gap">
            <input id="reflect-try" className="field grow" maxLength={140} placeholder="Ask for help earlier" value={intention} onChange={(e) => setIntention(e.target.value)} />
            <button type="submit" className="btn small outline" disabled={!intention.trim()}>
              Keep it
            </button>
          </div>
          <p className="muted small">In a week, a gentle check-in asks how it went. No goals and no scores.</p>
        </form>
      ) : (
        <p className="muted small">Kept. I’ll ask how it went in a week.</p>
      )}
      {earlier.length > 0 && !linked && (
        <label className="reflect-link">
          <span className="field-label">Add it to a thread</span>
          <select className="field" defaultValue="" onChange={(e) => e.target.value && link(e.target.value)}>
            <option value="">Not part of a thread</option>
            {earlier.map((r) => (
              <option key={r.id} value={r.id}>
                {dayMonth(r.date)}: {r.answer.slice(0, 50)}
                {r.answer.length > 50 ? '…' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {linked && <p className="muted small">Added to the thread that began with “{linked}”.</p>}
      <button type="button" className="text-button" onClick={onDone}>
        Done
      </button>
    </section>
  )
}
