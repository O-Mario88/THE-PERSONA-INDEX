// Insights: understand yourself, find what
// helps. For You is the person's own answers, worked out on this device;
// You're Not Alone shows the server's real counts, only to someone who
// turned the Human Pulse on; Saved holds the cards they kept. No made-up
// rows, no scores.
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { recalledVerdict, type Question, type Verdict } from '@shared/api'
import { evidenceLabel, forYou, getNotAlone, notAloneFor, type ForYouCard, type NotAloneQuestion } from '@shared/insights'
import { NEED_NAMES } from '@shared/needs'
import { intentions, keepIntention, keptCards } from '@shared/notebook'
import { loadMoves } from '@shared/moves'
import { loadHistory } from '@shared/profile'
import { acrossDays } from '@shared/firstWeek'
import { count } from '@shared/pulse'
import { rateAnswer } from '@shared/rating'
import { splitReveal } from '@shared/reveal'
import { NOT_ME_REPLY, VERDICT_REPLIES } from '@shared/words'
import { radius, useTheme } from '../theme'
import { Button, Card, Chip, Page, T, Tinted } from '../ui/kit'
import { CardHead } from '../ui/parts'
import { HeavyCard, VerdictRow } from './QuestionCard'

const WEEK = 7
const MONTH = 30
const FOR_YOU_MAX = 6

export function Insights({
  today,
  questions,
  pulse,
  onOpenReflect,
  onOpenSettings,
  onOpenMirror,
}: {
  today: string
  questions: Question[]
  pulse: boolean
  onOpenReflect: () => void
  onOpenSettings: () => void
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
  const counted = cards.some((c) => !c.heavy && !c.regional)
  const answeredAny = loadHistory().answers.length > 0
  return (
    <Page
      aside={
        counted || saved.length > 0 ? (
        <>
          {counted && (
            <Card>
              <NotAlone today={today} cards={cards} pulse={pulse} onOpenSettings={onOpenSettings} />
            </Card>
          )}
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
              <InsightCard card={c} today={today} onRated={() => setVersion((v) => v + 1)} onOpenReflect={onOpenReflect} onOpenMirror={onOpenMirror} />
            </Card>
          ))}
        </>
      )}
    </Page>
  )
}

function InsightCard({ card, today, onRated, onOpenReflect, onOpenMirror }: { card: ForYouCard; today: string; onRated: () => void; onOpenReflect: () => void; onOpenMirror?: () => void }) {
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
              <T v="h2" style={{ fontSize: 22, lineHeight: 28 }}>
                {reading.headline}
              </T>
              {reading.body ? <T tone="text2">{reading.body}</T> : null}
            </>
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
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Reflect on this" onPress={onOpenReflect} />
            {onOpenMirror && <Chip label="Weekly Mirror" onPress={onOpenMirror} />}
          </View>
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
    <Tinted tone="blue">
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
    </Tinted>
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

function NotAlone({ today, cards, pulse, onOpenSettings }: { today: string; cards: ForYouCard[]; pulse: boolean; onOpenSettings: () => void }) {
  const [counts, setCounts] = useState<NotAloneQuestion[] | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!pulse) return
    let live = true
    getNotAlone(today).then((c) => {
      if (!live) return
      setCounts(c)
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [today, pulse])
  const counted = cards.filter((c) => !c.heavy && !c.regional)
  return (
    <View style={{ gap: 10 }}>
      <CardHead icon="people" tone="blue" v="h2" title="You're not alone in this" />
      {!pulse ? (
        <>
          <T v="small" tone="muted">
            With the Human Pulse on, this shows the count of people who chose the same response as you. Off unless you turn it on.
          </T>
          <Button kind="text" label="Human Pulse in You" onPress={onOpenSettings} />
        </>
      ) : !loaded ? (
        <T v="small" tone="muted">
          Getting the counts…
        </T>
      ) : !counts ? (
        <T v="small" tone="muted">
          The counts can’t be reached just now.
        </T>
      ) : (
        counted.map((c) => {
          const line = notAloneFor(counts, c.questionId, c.optionId)
          return (
            <View key={c.questionId} style={{ gap: 2 }}>
              <T v="small" tone="muted">
                {c.prompt}
              </T>
              <T bold>
                {!line || line.kind === 'forming'
                  ? 'The picture is still forming.'
                  : line.kind === 'few'
                    ? 'A few people chose the same response.'
                    : `${count(line.same)} of ${count(line.total)} people chose the same response.`}
              </T>
            </View>
          )
        })
      )}
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
