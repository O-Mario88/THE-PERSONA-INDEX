// My notebook, under Reflect: the cards a
// person kept, and what they wrote themselves (three good things, Sunday
// lines, plans and the names they gave their weeks). On this phone only.
import { useState } from 'react'
import { View } from 'react-native'
import { longDate, weekRange } from '@shared/mirrorText'
import { allGoodThings, keptCards, names, plans, removePlan, sentencesBetween, unkeepCard, type KeptCard, type Plan, type Revisit } from '@shared/notebook'
import { themeName } from '@shared/themes'
import { TRAITS } from '@shared/traits'
import { REVISIT_WORDS, VERDICT_WORDS } from '@shared/words'
import { font, useTheme } from '../theme'
import { Button, Chip, T } from '../ui/kit'
import { DownloadButtons } from './BookDownloads'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <T v="small" tone="muted">
      {children}
    </T>
  )
}

export function Notebook({ mild, today }: { mild: boolean; today: string }) {
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
  const groups: [string, KeptCard[]][] = [
    ['This week', shown.filter((c) => c.date >= monday)],
    ['Earlier', shown.filter((c) => c.date < monday)],
  ]

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <T v="label" tone="muted">
          On this phone only, until you remove it
        </T>
        <T v="title">Notebook</T>
      </View>

      {empty && (
        <T tone="text2">
          Nothing here yet. Tap <T bold>Keep this</T> under any card and it lands here, with the day, your answer and what it said.
        </T>
      )}

      {kinds.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {kinds.map(([k, label, n]) => (
            <Chip key={k} label={`${label} · ${n}`} on={kind === k} onPress={() => setPick(k)} />
          ))}
        </View>
      )}

      {show('cards') &&
        groups.map(
          ([label, list]) =>
            list.length > 0 && (
              <View key={label} style={{ gap: 12 }}>
                <T v="eyebrow" tone="muted">
                  {label}
                </T>
                {list.map((c) => (
                  <CardEntry key={c.questionId} card={c} onRemove={refresh} />
                ))}
              </View>
            ),
        )}
      {show('cards') && hidden > 0 && <Muted>{plural(hidden, 'private card')} hidden while "Keep it mild" is on.</Muted>}

      {show('words') && lines.length > 0 && (
        <View style={{ gap: 12 }}>
          <T v="eyebrow" tone="muted">
            What you learned, week by week
          </T>
          {lines.map((s) => (
            <View key={s.week} style={{ gap: 4 }}>
              <Muted>{weekRange(s.week)}</Muted>
              <T>{s.text}</T>
              <Revisits revisits={s.revisits} />
            </View>
          ))}
        </View>
      )}

      {show('words') && good.length > 0 && (
        <View style={{ gap: 12 }}>
          <T v="eyebrow" tone="muted">
            Three good things
          </T>
          {good.map((g) => (
            <View key={g.date} style={{ gap: 4 }}>
              <Muted>{longDate(g.date)}</Muted>
              {g.lines.map((l, i) => (
                <T key={i}>• {l}</T>
              ))}
            </View>
          ))}
        </View>
      )}

      {show('steps') && planList.length > 0 && (
        <View style={{ gap: 12 }}>
          <T v="eyebrow" tone="muted">
            Your plans
          </T>
          {planList.map((x) => (
            <PlanEntry key={x.id} plan={x} onRemove={refresh} />
          ))}
        </View>
      )}

      {show('mirrors') && named.length > 0 && (
        <View style={{ gap: 12 }}>
          <T v="eyebrow" tone="muted">
            The names you gave your weeks
          </T>
          {named.map((n) => (
            <View key={n.week} style={{ gap: 2 }}>
              <Muted>{weekRange(n.week)} · Sunday Mirror</Muted>
              <T v="h3">{n.name}</T>
              <Muted>I suggested {n.suggested}.</Muted>
            </View>
          ))}
        </View>
      )}
      {!empty && <DownloadButtons today={today} mild={mild} />}
      <Muted>For self-reflection, not a diagnosis.</Muted>
    </View>
  )
}

function CardEntry({ card: c, onRemove }: { card: KeptCard; onRemove: () => void }) {
  const p = useTheme()
  const [open, setOpen] = useState(!c.private)
  const [asking, setAsking] = useState(false)
  const [more, setMore] = useState(false)
  return (
    <View
      accessibilityLabel={c.prompt}
      style={{ borderTopColor: p.line, borderTopWidth: 1, paddingTop: 16, gap: 8 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <T v="tiny" tone="accent" style={{ fontFamily: font.heavy, letterSpacing: 1.7, textTransform: 'uppercase' }}>
          {c.theme ? themeName(c.theme) : 'Today'}
        </T>
        <Muted>
          {shortDay(c.date)}
          {c.private ? ' · private' : ''}
        </Muted>
      </View>
      {open ? <T v="h3">{c.headline}</T> : <T tone="text2">{c.prompt}</T>}
      {!open ? (
        <Button kind="text" small label="Show this private card" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      ) : !more ? (
        <Button kind="text" small label="The question and your answer" onPress={() => setMore(true)} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <>
          <T tone="text2">{c.prompt}</T>
          {c.words ? (
            <T>
              In your words: “{c.words}”<T tone="muted"> · closest to {c.answer}</T>
            </T>
          ) : (
            <T>You chose: {c.answer}</T>
          )}
          {c.body ? <T>{c.body}</T> : null}
          {c.otherSide ? (
            <T>
              <T bold>The other side</T> {c.otherSide}
            </T>
          ) : null}
          {c.step ? <Muted>Small step: {c.step}</Muted> : null}
          {c.verdict ? <T v="small" bold>{VERDICT_WORDS[c.verdict]}</T> : null}
          <Revisits revisits={c.revisits} />
        </>
      )}
      {(more || !open) &&
        (asking ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Chip
              label="Yes, remove it"
              onPress={() => {
                unkeepCard(c.questionId)
                onRemove()
              }}
            />
            <Button kind="text" small label="Keep it" onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button kind="text" small label="Remove" onPress={() => setAsking(true)} style={{ alignSelf: 'flex-start' }} />
        ))}
    </View>
  )
}

function Revisits({ revisits = [] }: { revisits?: Revisit[] }) {
  return (
    <>
      {revisits.map((r) => (
        <T key={r.date} v="small" bold>
          {longDate(r.date)}: {REVISIT_WORDS[r.verdict]}
          {r.note ? <T v="small"> · What's different now: “{r.note}”</T> : null}
        </T>
      ))}
    </>
  )
}

function PlanEntry({ plan: x, onRemove }: { plan: Plan; onRemove: () => void }) {
  const did = x.checks.filter((c) => c.status === 'did').length
  const notYet = x.checks.filter((c) => c.status === 'not_yet').length
  const side = TRAITS[x.trait] ? (x.high ? TRAITS[x.trait].high : TRAITS[x.trait].low) : null
  const record = did + notYet === 0 ? 'Not checked yet.' : `Did it ${plural(did, 'time')}, not yet ${plural(notYet, 'time')}.`
  return (
    <View style={{ gap: 4 }} accessibilityLabel="Plan">
      <Muted>
        {longDate(x.made)}
        {side ? ` · ${side.lean}` : ''}
        {x.closed ? ' · finished' : " · what you're working on"}
      </Muted>
      <T>
        When {x.when}, I will {x.will}.
      </T>
      <Muted>{record}</Muted>
      <Button
        kind="text"
        small
        label="Remove"
        onPress={() => {
          removePlan(x.id)
          onRemove()
        }}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  )
}
