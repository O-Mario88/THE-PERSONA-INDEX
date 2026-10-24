import { useState } from 'react'
import { DownloadButtons } from './Book'
import { longDate, weekRange } from './mirrorText'
import {
  allGoodThings,
  keptCards,
  names,
  plans,
  removePlan,
  sentencesBetween,
  unkeepCard,
  type KeptCard,
  type Plan,
  type Revisit,
} from './notebook'
import { themeName, themeVars } from './themes'
import { TRAITS } from './traits'
import { REVISIT_WORDS, VERDICT_WORDS } from './words'

// My notebook (the review of 2026-10-15, "Yours to keep"): the cards a
// person kept, grouped by life area, and what they wrote themselves: three
// good things, their Sunday sentences, their plans and the names they gave
// their weeks. All of it lives on this phone only; no ads ever sit here.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// The Monday of the week holding this date.
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export function NotebookScreen({ mild, today }: { mild: boolean; today: string }) {
  // Reading the notebook happens on every render; a removal asks for one.
  const [, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const cards = keptCards()
  const hidden = mild ? cards.filter((c) => c.private).length : 0
  const shown = mild ? cards.filter((c) => !c.private) : cards
  const good = allGoodThings()
  const lines = sentencesBetween('0000-01-01', '9999-12-31').reverse()
  const planList = plans()
  const named = names()
  const empty = cards.length + good.length + lines.length + planList.length + named.length === 0

  const kinds = (
    [
      ['cards', 'Kept cards', shown.length + hidden],
      ['steps', 'Steps', planList.length],
      ['mirrors', 'Mirrors', named.length],
      ['words', 'Your words', lines.length + good.length],
    ] as const
  ).filter(([, , n]) => n > 0)
  const [pick, setPick] = useState<string | null>(null)
  const kind = kinds.some(([k]) => k === pick) ? pick : (kinds[0]?.[0] ?? null)
  const show = (k: string) => kinds.length <= 1 || kind === k
  const monday = mondayOf(today)
  const thisWeek = shown.filter((c) => c.date >= monday)
  const earlier = shown.filter((c) => c.date < monday)

  return (
    <section className="screen notebook" aria-labelledby="notebook-title">
      <header className="nb-head">
        <p className="label">On this phone only, until you remove it</p>
        <h2 id="notebook-title" className="display">
          Notebook
        </h2>
      </header>

      {empty && (
        <div className="notice">
          <p>
            Nothing here yet. Tap <strong>Keep this</strong> under any card and it lands here, with the day, your answer and
            what it said.
          </p>
        </div>
      )}

      {kinds.length > 1 && (
        <div className="nb-tabs" role="group" aria-label="Show">
          {kinds.map(([k, label, n]) => (
            <button key={k} type="button" className="nb-tab" aria-pressed={kind === k} onClick={() => setPick(k)}>
              {label} · {n}
            </button>
          ))}
        </div>
      )}

      {show('cards') && shown.length > 0 && (
        <section className="nb-section" aria-labelledby="nb-cards">
          <h3 id="nb-cards" className="sr-only">
            Cards you kept · {shown.length}
          </h3>
          {[
            ['This week', thisWeek],
            ['Earlier', earlier],
          ].map(
            ([label, list]) =>
              (list as KeptCard[]).length > 0 && (
                <div key={label as string} className="nb-area" role="group" aria-label={label as string}>
                  <p className="nb-area-name">{label as string}</p>
                  <ul className="nb-list">
                    {(list as KeptCard[]).map((c) => (
                      <li key={c.questionId}>
                        <CardEntry card={c} onRemove={refresh} />
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </section>
      )}
      {show('cards') && hidden > 0 && (
        <p className="muted">
          {plural(hidden, 'private card')} hidden while "Keep it mild" is on.
        </p>
      )}

      {show('words') && lines.length > 0 && (
        <section className="nb-section" aria-labelledby="nb-sentences">
          <h3 id="nb-sentences" className="eyebrow">
            What you learned, week by week
          </h3>
          <ul className="nb-list">
            {lines.map((s) => (
              <li key={s.week} className="nb-entry">
                <p className="nb-meta">{weekRange(s.week)}</p>
                <p className="nb-line">{s.text}</p>
                <Revisits revisits={s.revisits} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {show('words') && good.length > 0 && (
        <section className="nb-section" aria-labelledby="nb-good">
          <h3 id="nb-good" className="eyebrow">
            Three good things
          </h3>
          <ul className="nb-list">
            {good.map((g) => (
              <li key={g.date} className="nb-entry">
                <p className="nb-meta">{longDate(g.date)}</p>
                <ul className="nb-good">
                  {g.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {show('steps') && planList.length > 0 && (
        <section className="nb-section" aria-labelledby="nb-plans">
          <h3 id="nb-plans" className="eyebrow">
            Your plans
          </h3>
          <ul className="nb-list">
            {planList.map((p) => (
              <li key={p.id}>
                <PlanEntry plan={p} onRemove={refresh} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {show('mirrors') && named.length > 0 && (
        <section className="nb-section" aria-labelledby="nb-names">
          <h3 id="nb-names" className="eyebrow">
            The names you gave your weeks
          </h3>
          <ul className="nb-list">
            {named.map((n) => (
              <li key={n.week} className="nb-entry nb-mirror">
                <p className="nb-meta">{weekRange(n.week)} · Sunday Mirror</p>
                <p className="nb-line">{n.name}</p>
                <p className="muted">I suggested {n.suggested}.</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!empty && <DownloadButtons today={today} mild={mild} />}
      <p className="insight-note">For self-reflection, not a diagnosis.</p>
    </section>
  )
}

function CardEntry({ card: c, onRemove }: { card: KeptCard; onRemove: () => void }) {
  const [open, setOpen] = useState(!c.private)
  const [asking, setAsking] = useState(false)
  const [more, setMore] = useState(false)
  return (
    <article className="nb-entry nb-card" style={themeVars(c.theme)} aria-label={c.prompt}>
      <p className="nb-meta row-between">
        <span className="nb-card-area">{c.theme ? themeName(c.theme) : 'Today'}</span>
        <span>
          {shortDay(c.date)}
          {c.private && ' · private'}
        </span>
      </p>
      {open && <p className="nb-headline">{c.headline}</p>}
      {!open && <p className="nb-prompt">{c.prompt}</p>}
      {!open ? (
        <button type="button" className="text-button nb-show" onClick={() => setOpen(true)}>
          Show this private card
        </button>
      ) : !more ? (
        <button type="button" className="text-button nb-show" aria-expanded={false} onClick={() => setMore(true)}>
          The question and your answer
        </button>
      ) : (
        <>
          <p className="nb-prompt">{c.prompt}</p>
          {c.words ? (
            <p className="nb-answer">
              In your words: “{c.words}”<span className="muted"> · closest to {c.answer}</span>
            </p>
          ) : (
            <p className="nb-answer">You chose: {c.answer}</p>
          )}
          {c.body && <p>{c.body}</p>}
          {c.otherSide && (
            <p className="nb-other">
              <span className="eyebrow">The other side</span> {c.otherSide}
            </p>
          )}
          {c.step && <p className="muted">Small step: {c.step}</p>}
          {c.verdict && <p className="nb-verdict">{VERDICT_WORDS[c.verdict]}</p>}
          <Revisits revisits={c.revisits} />
        </>
      )}
      {(more || !open) && asking ? (
        <div className="confirm">
          <button
            type="button"
            className="chip"
            onClick={() => {
              unkeepCard(c.questionId)
              onRemove()
            }}
          >
            Yes, remove it
          </button>
          <button type="button" className="text-button" onClick={() => setAsking(false)}>
            Keep it
          </button>
        </div>
      ) : (
        (more || !open) && (
          <button type="button" className="text-button nb-remove" onClick={() => setAsking(true)}>
            Remove
          </button>
        )
      )}
    </article>
  )
}

// What the person said when Sunday brought an entry back: "Is that still
// true?", and what is different now, when they wrote it.
function Revisits({ revisits = [] }: { revisits?: Revisit[] }) {
  return revisits.map((r) => (
    <p key={r.date} className="nb-verdict">
      {longDate(r.date)}: {REVISIT_WORDS[r.verdict]}
      {r.note && <span className="nb-note"> · What's different now: “{r.note}”</span>}
    </p>
  ))
}

function PlanEntry({ plan: p, onRemove }: { plan: Plan; onRemove: () => void }) {
  const did = p.checks.filter((c) => c.status === 'did').length
  const notYet = p.checks.filter((c) => c.status === 'not_yet').length
  const side = TRAITS[p.trait] ? (p.high ? TRAITS[p.trait].high : TRAITS[p.trait].low) : null
  const record =
    did + notYet === 0 ? 'Not checked yet.' : `Did it ${plural(did, 'time')}, not yet ${plural(notYet, 'time')}.`
  return (
    <article className="nb-entry" aria-label="Plan">
      <p className="nb-meta">
        {longDate(p.made)}
        {side && ` · ${side.lean}`}
        {p.closed ? ' · finished' : " · what you're working on"}
      </p>
      <p className="nb-line">
        When {p.when}, I will {p.will}.
      </p>
      <p className="muted">{record}</p>
      <button
        type="button"
        className="text-button nb-remove"
        onClick={() => {
          removePlan(p.id)
          onRemove()
        }}
      >
        Remove
      </button>
    </article>
  )
}
