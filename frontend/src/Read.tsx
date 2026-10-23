import { useContext, useEffect, useState } from 'react'
import { Helpline } from './Helpline'
import { OpenRead, useReads } from './readContext'
import type { Read } from './reads/types'
import { load, save } from './storage'
import { themeVars } from './themes'

// Reads in the app (Phase 3 of the review of 2026-10-15): one short read
// offered each day, about one of the day's life areas, and a read under
// each leaning in the mirror. The reads load after the app has opened, so
// they never slow the questions down. No ads here: the app shows none.

// A read opened on a day stays today's read for the rest of that day, and is
// not offered again on another.
const OPENED = 'pi.read.'
const openedBefore = (slug: string, date: string) => {
  const d = load(OPENED + slug)
  return d !== null && d < date
}

export function ReadScreen({
  read,
  date,
  intimacy,
  onBack,
}: {
  read: Read
  date: string
  intimacy: boolean
  onBack: () => void
}) {
  const reads = useReads()
  const open = useContext(OpenRead)
  useEffect(() => {
    if (load(OPENED + read.slug) === null) save(OPENED + read.slug, date)
  }, [read.slug, date])
  const more = reads ? reads.related(read, 2).filter((r) => intimacy || !reads.appOnly(r)) : []

  return (
    <article className="screen read" aria-labelledby="read-title" style={read.kind === 'theme' ? themeVars(read.key) : undefined}>
      <button type="button" className="text-button back" onClick={onBack}>
        ← Back
      </button>
      {reads && (
        <p className="read-topic">
          {reads.topicOf(read)} · {reads.minutes(read)} min read
        </p>
      )}
      <h2 id="read-title" className="done-title">
        {read.title}
      </h2>
      <p className="read-summary">{read.summary}</p>
      <div className="read-body">
        {read.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <aside className="read-try" aria-label="Something to try">
        <p className="eyebrow">Something to try</p>
        <p>{read.try}</p>
      </aside>
      {reads?.heavy(read) && <Helpline />}
      {open && more.length > 0 && (
        <nav className="read-more" aria-labelledby="read-more">
          <h3 id="read-more" className="eyebrow">
            More to read
          </h3>
          <ul>
            {more.map((r) => (
              <li key={r.slug}>
                <button type="button" className="text-button" onClick={() => open(r)}>
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </article>
  )
}

// The day's read, offered beside the questions.
export function TodaysRead({ date, themes, intimacy }: { date: string; themes: string[]; intimacy: boolean }) {
  const reads = useReads()
  const open = useContext(OpenRead)
  const key = themes.join(',')
  const [pick, setPick] = useState<{ for: string; read: Read | null } | null>(null)
  const want = `${date}|${key}|${intimacy}`
  if (reads && pick?.for !== want) {
    setPick({ for: want, read: reads.todaysRead(date, themes, (s) => openedBefore(s, date), intimacy) })
  }
  const read = pick?.read
  if (!reads || !read || !open) return null
  return (
    <section className="notice read-offer" aria-labelledby="read-offer-title" style={read.kind === 'theme' ? themeVars(read.key) : undefined}>
      <p className="eyebrow">Today's read · {reads.minutes(read)} min</p>
      <h3 id="read-offer-title" className="read-offer-title">
        {read.title}
      </h3>
      <p className="muted">{read.summary}</p>
      <button type="button" className="option" onClick={() => open(read)}>
        {load(OPENED + read.slug) === date ? 'Read it again' : 'Read it'}
      </button>
    </section>
  )
}

// A read on one side of a trait, under a leaning in the mirror.
export function ReadLink({ side }: { side: string }) {
  const reads = useReads()
  const open = useContext(OpenRead)
  const read = reads?.readFor('trait', side)
  if (!read || !open) return null
  return (
    <button type="button" className="m-link read-link" onClick={() => open(read)}>
      A read on this: {read.title}
    </button>
  )
}
