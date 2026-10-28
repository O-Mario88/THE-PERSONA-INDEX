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
import { intentions, keepIntention, keptCards } from '@shared/notebook'
import { loadMoves } from '@shared/moves'
import { loadHistory } from '@shared/profile'
import { acrossDays } from '@shared/firstWeek'
import { rateAnswer } from '@shared/rating'
import { splitReveal } from '@shared/reveal'
import { NOT_ME_REPLY, VERDICT_REPLIES } from '@shared/words'
import { radius, useTheme } from '../theme'
import { Button, Card, Chip, Page, T } from '../ui/kit'
import { CardHead } from '../ui/parts'
import { PulseLine } from '../ui/Pulse'
import { HeavyCard, VerdictRow } from './QuestionCard'

const WEEK = 7
const MONTH = 30
const FOR_YOU_MAX = 6

export function Insights({
  today,
  questions,
  pulseCounts,
  onExplore,
  onOpenMirror,
}: {
  today: string
  questions: Question[]
  pulseCounts: PulseCounts | null
  onExplore: (questionId: string) => void
  onOpenMirror?: () => void
}) {
  const [days, setDays] = useState(WEEK)
  const [version, setVersion] = useState(0)
  const cards = useMemo(() => {
    void version
    return forYou(loadHistory(), today, days, questions)
  }, [today, days, questions, version])
  const shown = days === WEEK ? cards.slice(0, FOR_YOU_MAX) : cards
  const fresh = shown.filter((x) => x.date === today)
  const earlier = shown.filter((x) => x.date !== today)
  const [openToday, setOpenToday] = useState(false)
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
      <View style={{ gap: 4 }}>
        <T v="display">Insights</T>
        <T tone="text2">What I'm learning about you, and what seems to help you.</T>
      </View>
      {(answeredAny || onOpenMirror) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {answeredAny && <Chip label="Last 30 days" on={days === MONTH} onPress={() => setDays(days === MONTH ? WEEK : MONTH)} />}
          {onOpenMirror && <Button kind="text" small label="Your Mirrors" iconAfter="arrow" onPress={onOpenMirror} />}
        </View>
      )}
      <AcrossDays today={today} />
      <WhatHelpedYou />
      <T v="h2">For You</T>
      {shown.length === 0 ? (
        <Card>
          <T tone="muted">
            {days === WEEK ? 'Answer a few questions and I’ll show you here what they say about you, one card at a time.' : 'Nothing from the last 30 days yet. As you answer, I’ll add your cards here.'}
          </T>
        </Card>
      ) : (
        <>
          {/* Today's cards were just read in the sitting: folded, so Insights leads with something new. */}
          {fresh.length > 0 && (
            <Button kind="text" label={openToday ? 'Hide today’s cards' : `From today (${fresh.length})`} iconAfter="chevron" onPress={() => setOpenToday(!openToday)} />
          )}
          {[...(openToday ? fresh : []), ...earlier].map((c) => (
            <Card key={c.questionId} style={{ gap: 20 }}>
              <InsightCard card={c} today={today} onRated={() => setVersion((v) => v + 1)} pulseCounts={pulseCounts} onExplore={onExplore} />
            </Card>
          ))}
        </>
      )}
    </Page>
  )
}

function InsightCard({
  card,
  today,
  onRated,
  pulseCounts,
  onExplore,
}: {
  card: ForYouCard
  today: string
  onRated: () => void
  pulseCounts: PulseCounts | null
  onExplore: (questionId: string) => void
}) {
  const p = useTheme()
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
              <T v="h2" style={{ fontSize: 19, lineHeight: 25 }}>
                {reading.headline}
              </T>
              {reading.body ? <T tone="text2">{reading.body}</T> : null}
            </>
          )}
          {/* The shared Human Pulse for this answer, and Connect opened on this exact question. */}
          {pulseCounts && !card.regional && (
            <PulseLine
              line={notAloneFor(pulseCounts.questions, card.questionId, card.optionId)}
              stale={pulseCounts.stale}
              explore="Explore this with others"
              onExplore={() => onExplore(card.questionId)}
            />
          )}
          {card.need && (
            <View style={{ gap: 8 }}>
              <CardHead icon="leaf" title="What this could mean for you" />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ backgroundColor: p.accentWash, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                  <T v="small" tone="accent" bold>
                    {NEED_NAMES[card.need]}
                  </T>
                </View>
              </View>
            </View>
          )}
          {card.otherSide && (
            <View style={{ gap: 8 }}>
              <CardHead icon="pin" tone="rose" title="The other side of it" />
              <T v="small" tone="text2">
                {card.otherSide}
              </T>
            </View>
          )}
          {card.step && <TryThis card={card} today={today} />}
          <RateCard card={card} onRated={onRated} />
          <T v="tiny">Something to think about, never a diagnosis.</T>
        </>
      )}
    </View>
  )
}

function TryThis({ card, today }: { card: ForYouCard; today: string }) {
  const id = `insight-${card.questionId}`
  const [saved, setSaved] = useState(() => intentions().some((i) => i.id === id))
  return (
    <View style={{ gap: 10 }}>
      <CardHead icon="bulb" tone="amber" title="Something you could try" />
      <T>{card.step}</T>
      {saved ? (
        <T v="small" tone="muted">
          Saved as an intention in Reflect.
        </T>
      ) : (
        <Button
          small
          label="Save as an intention"
          onPress={() => {
            keepIntention({ id, date: today, text: card.step ?? '', from: card.questionId })
            setSaved(true)
          }}
        />
      )}
    </View>
  )
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
    </Card>
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
