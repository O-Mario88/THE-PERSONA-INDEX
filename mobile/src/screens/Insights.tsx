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
import { loadHistory } from '@shared/profile'
import { count } from '@shared/pulse'
import { rateAnswer } from '@shared/rating'
import { splitReveal } from '@shared/reveal'
import { NOT_ME_REPLY, VERDICT_REPLIES } from '@shared/words'
import { radius, useTheme } from '../theme'
import { Button, Card, Chip, Page, T, Tinted } from '../ui/kit'
import { Disc } from '../ui/parts'
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
  const saved = keptCards().filter((c) => !c.private)
  const counted = cards.some((c) => !c.heavy && !c.regional)
  const answeredAny = loadHistory().answers.length > 0
  return (
    <Page>
      <View style={{ gap: 4 }}>
        <T v="display">Insights</T>
        <T tone="text2">Understand yourself. Find what helps.</T>
      </View>
      {(answeredAny || onOpenMirror) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {answeredAny && <Chip label="Last 30 days" on={days === MONTH} onPress={() => setDays(days === MONTH ? WEEK : MONTH)} />}
          {onOpenMirror && <Button kind="text" small label="Your Mirrors" iconAfter="arrow" onPress={onOpenMirror} />}
        </View>
      )}
      <T v="h2">For You</T>
      {shown.length === 0 ? (
        <Card>
          <T tone="muted">
            {days === WEEK ? 'Answer a few questions and what they may say about you shows here, card by card.' : 'Nothing from the last 30 days yet. Your cards show here as you answer.'}
          </T>
        </Card>
      ) : (
        shown.map((c) => (
          <Card key={c.questionId} style={{ gap: 20 }}>
            <InsightCard card={c} today={today} onRated={() => setVersion((v) => v + 1)} onOpenReflect={onOpenReflect} onOpenMirror={onOpenMirror} />
          </Card>
        ))
      )}
      {counted && (
        <Card>
          <NotAlone today={today} cards={cards} pulse={pulse} onOpenSettings={onOpenSettings} />
        </Card>
      )}
      {saved.length > 0 && (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Disc icon="bookmark" tone="purple" size={40} />
              <T v="h2">Saved insights</T>
            </View>
            {saved.slice(0, 3).map((c) => (
              <T key={c.questionId}>• {c.headline}</T>
            ))}
          </Card>
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
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Disc icon="leaf" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{evidenceLabel(card.evidence, card.date, today)}</T>
          <T v="small" tone="muted">
            {card.prompt} You chose “{card.label}”.
          </T>
        </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Disc icon="leaf" size={32} />
                <T v="h3">What may matter here</T>
              </View>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Disc icon="pin" tone="rose" size={32} />
                <T v="h3">The Other Side</T>
              </View>
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
          <T v="tiny">For self-reflection, not a diagnosis.</T>
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
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Disc icon="bulb" tone="amber" size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">Something you could try</T>
          <T v="small">{card.step}</T>
        </View>
      </View>
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Disc icon="people" tone="blue" size={40} />
        <T v="h2">You’re Not Alone</T>
      </View>
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
