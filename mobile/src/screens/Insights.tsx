// Insights: understand yourself, find what
// helps. For You is the person's own answers, worked out on this device;
// each card carries the shared Human Pulse line (humanPulse.ts) once it is on,
// with Connect a tap away; Saved holds the cards they kept. No made-up
// rows, no scores.
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { recalledVerdict, type Question, type Verdict } from '@shared/api'
import { evidenceLabel, forYou, notAloneFor, type ForYouCard } from '@shared/insights'
import type { PulseCounts } from '@shared/humanPulse'
import { NEED_NAMES } from '@shared/needs'
import { intentions, keepCard, keepIntention, keptCard, keptCards, unkeepCard } from '@shared/notebook'
import { loadMoves, startMove } from '@shared/moves'
import { loadHistory } from '@shared/profile'
import { acrossDays, acrossDaysWhy } from '@shared/firstWeek'
import { whenWas } from '@shared/continuity'
import { rateAnswer } from '@shared/rating'
import { splitReveal } from '@shared/reveal'
import { NOT_ME_REPLY, VERDICT_REPLIES } from '@shared/words'
import { radius, useTheme } from '../theme'
import { Button, Card, Page, PageHeader, Segmented, T } from '../ui/kit'
import { Tile, TileRow } from '../ui/Layout'
import { CardHead } from '../ui/parts'
import { PulseLine, PulseNote, usePagePulse } from '../ui/Pulse'
import { loadPrefs } from '@shared/prefs'
import { DepthSwitch, useDeeper } from '../ui/Depth'
import { HeavyCard, Rate, VerdictRow } from './QuestionCard'

const WEEK = 7
const MONTH = 30
const FOR_YOU_MAX = 6

export function Insights({
  today,
  questions,
  pulseCounts,
  onExplore,
  onOpenMirror,
  onOpenJourney,
}: {
  today: string
  questions: Question[]
  pulseCounts: PulseCounts | null
  onExplore: (questionId: string) => void
  onOpenMirror?: () => void
  onOpenJourney: () => void
}) {
  const p = useTheme()
  const [days, setDays] = useState(WEEK)
  const [version, setVersion] = useState(0)
  // Essential or Explore deeper (shared depth.ts), and small practical ideas first for those who asked (My Reflection Style).
  const [deeper, setDeeper] = useDeeper('insights')
  const [practical] = useState(() => loadPrefs().style === 'practical')
  const cards = useMemo(() => {
    void version
    return forYou(loadHistory(), today, days, questions)
  }, [today, days, questions, version])
  const shown = days === WEEK ? cards.slice(0, FOR_YOU_MAX) : cards
  const fresh = shown.filter((x) => x.date === today)
  const earlier = shown.filter((x) => x.date !== today)
  const saved = keptCards().filter((c) => !c.private)
  const answeredAny = loadHistory().answers.length > 0
  return (
    <Page
      aside={
        saved.length > 0 ? (
          <>
            {saved.length > 0 && (
              <>
                <Card style={{ gap: 10 }}>
                  <CardHead icon="bookmark" tone="purple" v="h2" title="What you've kept" />
                  {saved.slice(0, 3).map((c) => (
                    <T key={c.questionId}>• {c.headline}</T>
                  ))}
                </Card>
              </>
            )}
          </>
        ) : undefined
      }
    >
      <PageHeader title="Insights" line="What I'm learning about you, and what seems to help you." />
      {answeredAny && (
        <Segmented
          label="How far back"
          value={days === MONTH ? 'month' : 'week'}
          onChange={(v) => setDays(v === 'month' ? MONTH : WEEK)}
          options={[
            { value: 'week', label: 'This week' },
            { value: 'month', label: 'Last 30 days' },
          ]}
        />
      )}
      <TileRow>
        <Tile icon="leaf" tone="green" title="My journey" sub="What you’ve tried and discovered" onPress={onOpenJourney} />
        {onOpenMirror && <Tile icon="mirror" tone="purple" title="Your Mirrors" sub="Your weeks, looked back on" onPress={onOpenMirror} />}
      </TileRow>
      {shown.length > 0 && <DepthSwitch deep={deeper} onChange={setDeeper} center={false} />}
      <AcrossDays today={today} />
      <WhatHelpedYou />
      <T v="h2">For You</T>
      {shown.length === 0 ? (
        <Card>
          <T tone="muted">
            {days === WEEK
              ? 'Answer a few questions and I’ll show you here what they say about you, one card at a time.'
              : 'Nothing from the last 30 days yet. As you answer, I’ll add your cards here.'}
          </T>
        </Card>
      ) : (
        <>
          {/* Nothing on Insights is folded away (Edwin, 2026-10-28): today's cards first, then earlier ones.
              The newest leads, larger, with a warm edge; the rest follow under their own heading. */}
          {[...fresh, ...earlier].map((c, i) => (
            <Card key={c.questionId} style={[{ gap: 20 }, i === 0 && { borderTopWidth: 4, borderTopColor: p.brandLime }]}>
              <InsightCard
                lead={i === 0}
                card={c}
                question={questions.find((q) => q.id === c.questionId)}
                deeper={deeper}
                practical={practical}
                today={today}
                onRated={() => setVersion((v) => v + 1)}
                pulseCounts={pulseCounts}
                onExplore={onExplore}
              />
            </Card>
          ))}
        </>
      )}
    </Page>
  )
}

function InsightCard({
  lead = false,
  card,
  question,
  deeper,
  practical,
  today,
  onRated,
  pulseCounts,
  onExplore,
}: {
  lead?: boolean // the newest insight, which leads the page: a larger headline
  card: ForYouCard
  question?: Question
  deeper: boolean // Explore deeper: the Human Pulse, what it reached for, the other side, what helped others, keeping it
  practical: boolean // small practical ideas first: the step right after the reading
  today: string
  onRated: () => void
  pulseCounts: PulseCounts | null
  onExplore: (questionId: string) => void
}) {
  const p = useTheme()
  const pulse = usePagePulse(today)
  const reading = card.reveal ? splitReveal(card.reveal) : null
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <CardHead icon="leaf" title={evidenceLabel(card.evidence, card.date, today)} />
        <T v="small" tone="muted">
          {card.prompt} You chose “{card.label}”.
        </T>
      </View>
      {card.heavy ? (
        <HeavyCard />
      ) : (
        <>
          {reading && (
            <>
              <T v={lead ? 'title' : 'h2'}>{reading.headline}</T>
              {reading.body ? <T tone="text2">{reading.body}</T> : null}
            </>
          )}
          {/* The shared Human Pulse for this answer on every card (Edwin, 2026-10-29): the short line in
              Essential, the full one with Connect a tap away in Explore deeper. */}
          {!deeper && !card.regional && <PulseNote text={pulse.answer(card.questionId, card.optionId)} />}
          {practical && card.step && <TryThis card={card} today={today} pulse={card.regional ? null : pulse.step(card.questionId, card.optionId)} />}
          {deeper && pulseCounts && !card.regional && (
            <PulseLine line={notAloneFor(pulseCounts.questions, card.questionId, card.optionId)} stale={pulseCounts.stale} onExplore={() => onExplore(card.questionId)} />
          )}
          {deeper && card.need && (
            <View style={{ gap: 6 }}>
              <T v="label">What you were reaching for</T>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ backgroundColor: p.accentWash, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <T v="small" tone="accent" bold>
                    {NEED_NAMES[card.need]}
                  </T>
                </View>
              </View>
            </View>
          )}
          {deeper && card.otherSide && (
            <View style={{ gap: 6, borderLeftWidth: 3, borderLeftColor: p.rose, paddingLeft: 12 }}>
              <T v="label" style={{ color: p.rose }}>
                The other side of it
              </T>
              <T v="small" tone="text2">
                {card.otherSide}
              </T>
            </View>
          )}
          {!practical && card.step && <TryThis card={card} today={today} pulse={card.regional ? null : pulse.step(card.questionId, card.optionId)} />}
          {deeper && <KeepCard card={card} />}
          <CardFit card={card} question={question} onRated={onRated} />
          <T v="tiny">Something to think about, never a diagnosis.</T>
        </>
      )}
    </View>
  )
}

// TryThis offers the card's small step as the one you're trying, so Today
// can ask how it went and My Journey and the Mirror can remember it (one
// system for every step, Edwin, 2026-10-28), or keeps it for later in Reflect.
function TryThis({ card, today, pulse }: { card: ForYouCard; today: string; pulse: string | null }) {
  const id = `insight-${card.questionId}`
  const step = card.step ?? ''
  const [state, setState] = useState<'open' | 'trying' | 'later'>(() =>
    loadMoves().some((m) => m.questionId === card.questionId) ? 'trying' : intentions().some((i) => i.id === id) ? 'later' : 'open',
  )
  return (
    <View style={{ gap: 10 }}>
      <CardHead icon="bulb" tone="amber" title="Something you could try" />
      <T>{step}</T>
      {pulse && (
        <View style={{ gap: 2 }}>
          <PulseNote text={pulse} />
          <T v="tiny">Only from people who chose to report back. Not a promise it will work for you.</T>
        </View>
      )}
      {state === 'trying' ? (
        <T v="small" tone="muted">
          You’re trying this. I’ll ask you how it went on Today.
        </T>
      ) : state === 'later' ? (
        <T v="small" tone="muted">
          Saved for later in Reflect.
        </T>
      ) : (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            small
            label="I'll try it"
            onPress={() => {
              startMove(today, card.questionId, card.optionId, step, Date.now(), false, !!card.regional).catch(() => {})
              setState('trying')
            }}
          />
          <Button
            small
            kind="text"
            label="Save for later"
            onPress={() => {
              keepIntention({ id, date: today, text: step, from: card.questionId })
              setState('later')
            }}
          />
        </View>
      )}
    </View>
  )
}

// Keep a card in your notebook. It lives here now, so the questions read as
// one conversation (Edwin's brief, 2026-10-28).
function KeepCard({ card }: { card: ForYouCard }) {
  const [kept, setKept] = useState(() => !!keptCard(card.questionId))
  if (!card.reveal) return null
  const { headline, body } = splitReveal(card.reveal)
  if (kept)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <T v="small" tone="leaf" bold>
          Kept in your notebook, on this phone only.
        </T>
        <Button
          small
          kind="text"
          label="Undo"
          onPress={() => {
            unkeepCard(card.questionId)
            setKept(false)
          }}
        />
      </View>
    )
  return (
    <Button
      small
      kind="text"
      icon="bookmark"
      label="Keep in Notebook"
      style={{ alignSelf: 'flex-start' }}
      onPress={() => {
        keepCard({
          date: card.date,
          questionId: card.questionId,
          theme: card.theme ?? '',
          prompt: card.prompt,
          answer: card.label,
          headline,
          ...(body ? { body } : {}),
          ...(card.otherSide ? { otherSide: card.otherSide } : {}),
          ...(card.step ? { step: card.step } : {}),
          ...(card.verdict ? { verdict: card.verdict } : {}),
        })
        setKept(true)
      }}
    />
  )
}

// "Does this sound like you?" For today's cards, the whole of it, with
// "What's closer to you?" after Not me; for earlier ones, the three taps.
function CardFit({ card, question, onRated }: { card: ForYouCard; question?: Question; onRated: () => void }) {
  const option = question?.options.find((o) => o.id === card.optionId)
  if (question && option) return <Rate question={question} option={option} date={card.date} wordsDays={loadPrefs().wordsDays} />
  return <RateCard card={card} onRated={onRated} />
}

function RateCard({ card, onRated }: { card: ForYouCard; onRated: () => void }) {
  const [verdict, setVerdict] = useState<Verdict | 'rated' | null>(() => card.verdict ?? recalledVerdict(card.questionId))
  if (verdict) return <T tone="muted">{verdict === 'not_me' ? NOT_ME_REPLY : VERDICT_REPLIES[verdict]}</T>
  return (
    <View style={{ gap: 10 }}>
      <T v="h3">Does this sound like you?</T>
      <VerdictRow
        onTap={(v) => {
          rateAnswer({ id: card.questionId, ...(card.regional ? { local: true as const } : {}) }, card.optionId, v)
          setVerdict(v)
          if (v === 'not_me') setTimeout(onRated, 1500)
        }}
      />
    </View>
  )
}

// What keeps coming up across all the days you've answered, the thing a
// single sitting can't show you (shared firstWeek.ts acrossDays).
function AcrossDays({ today }: { today: string }) {
  const { days, lean } = acrossDays(today)
  if (days === 0) return null
  return (
    <Card style={{ gap: 8 }}>
      <CardHead icon="insights" tone="blue" v="h2" title={lean ? 'What keeps coming up' : 'Building a picture of you'} />
      <T tone="text2">
        {lean
          ? `Across your ${days} days of answers, you keep leaning towards ${lean}. I'll keep watching whether it holds.`
          : 'Come back tomorrow and I can start showing you what links your answers across days, not just one sitting.'}
      </T>
      {lean && <WhyAcross today={today} days={days} />}
    </Card>
  )
}

// "Why am I seeing this?" (Edwin's brief, 2026-10-28): the answers behind
// it, when you gave them, and how sure it is (shared firstWeek.ts).
function WhyAcross({ today, days }: { today: string; days: number }) {
  const [open, setOpen] = useState(false)
  const [why] = useState(() => acrossDaysWhy(today))
  if (why.length === 0) return null
  return (
    <View style={{ gap: 8 }}>
      <Button small kind="text" label={open ? 'Hide why' : 'Why am I seeing this?'} onPress={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }} />
      {open && (
        <>
          {why.map((w) => (
            <View key={`${w.date}-${w.asked}`} style={{ gap: 2 }}>
              <T v="tiny">{w.date === today ? 'Today' : whenWas(w.date, today)}</T>
              <T v="small" tone="text2">
                {`${w.asked} You chose “${w.said}”.`}
              </T>
            </View>
          ))}
          <T v="tiny">{days < 7 ? 'A few days is still early, so this can change as you answer more.' : 'It rests on these answers, and it changes when your answers do.'}</T>
        </>
      )}
    </View>
  )
}

// What has helped you: the steps you tried and said helped, newest first, so
// Insights grows with what you learn, not just what you answered.
function WhatHelpedYou() {
  const helped = loadMoves()
    .filter((m) => m.status === 'helped')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
  if (helped.length === 0) return null
  return (
    <Card style={{ gap: 8 }}>
      <CardHead icon="leaf" tone="green" v="h2" title="What has helped you" />
      {helped.map((m) => (
        <T key={m.questionId} tone="text2">
          • {m.step}
        </T>
      ))}
    </Card>
  )
}
