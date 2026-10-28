// My Journey (Edwin, 2026-10-28): what you're exploring now, what you've
// learned from the steps you tried (the ones that didn't help included), your
// eight parts of life and your history. Built only from your own steps,
// check-ins and reflections, on this phone. Nothing is scored, and a part of
// life you haven't explored says so instead of guessing.
import { useState } from 'react'
import { View } from 'react-native'
import { checkInFor, checkIns, journeyHistory, lifeAreas, noteFor, outcomeLine } from '@shared/growthJourney'
import { loadMoves } from '@shared/moves'
import { reflections } from '@shared/notebook'
import { loadHistory } from '@shared/profile'
import { AREA_NAMES, dayMonth } from '@shared/reflect'
import { Back, Card, Page, T } from '../ui/kit'
import { AREA_ICON, AREA_TONE, CardHead, Disc } from '../ui/parts'
import { JourneyLine } from './TodayCards'

const LEARNED_SHOWN = 6
const HISTORY_SHOWN = 20

export function Journey({ today, onBack, onWrite }: { today: string; onBack: () => void; onWrite: (prompt?: string) => void }) {
  const [moves] = useState(loadMoves)
  const [checks] = useState(checkIns)
  const [h] = useState(loadHistory)
  const [written] = useState(reflections)
  const newest = [...moves].sort((a, b) => b.date.localeCompare(a.date))
  // The open step: not checked in on yet, or kept for later.
  const active = newest.find((m) => {
    const c = checkInFor(m.questionId, checks)
    return m.status === 'started' && (!c?.tried || !!c.later)
  })
  const learned = newest.filter((m) => m.status !== 'started' || checkInFor(m.questionId, checks)).slice(0, LEARNED_SHOWN)
  const areas = lifeAreas(moves, h, written, today, checks)
  const history = journeyHistory(moves, written, checks, HISTORY_SHOWN)

  return (
    <Page>
      <Back onPress={onBack} />
      <View style={{ gap: 4 }}>
        <T v="display">My journey</T>
        <T tone="text2">Little steps. Meaningful discoveries. What you’ve tried, and what you’re learning about yourself.</T>
      </View>

      <Card style={{ gap: 10 }}>
        <CardHead icon="pin" tone="amber" title="Your current focus" />
        <JourneyLine today={today} onWrite={onWrite} />
        {active ? (
          <View style={{ gap: 2 }}>
            <T v="label">Your next step</T>
            <T bold>“{active.step}”</T>
            <T v="small" tone="muted">
              I’ll ask you how it went on Today.
            </T>
          </View>
        ) : (
          <T v="small" tone="muted">
            No step open right now. Tap “I’ll try it” under any insight to choose one.
          </T>
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHead icon="bulb" tone="amber" title="What you’ve been learning" />
        {learned.length === 0 ? (
          <T tone="text2">When you try a step and tell me how it went, it shows here, the ones that didn’t help included.</T>
        ) : (
          learned.map((m) => {
            const note = noteFor(m.questionId)
            return (
              <View key={m.questionId} style={{ gap: 2 }}>
                <T bold>“{m.step}”</T>
                <T v="small" tone="text2">
                  {outcomeLine(checkInFor(m.questionId, checks), m.status)}
                </T>
                {note ? (
                  <T v="small" tone="muted">
                    {`Your note: ${note}`}
                  </T>
                ) : null}
              </View>
            )
          })
        )}
      </Card>

      <Card style={{ gap: 14 }}>
        <CardHead icon="leaf" title="Your life areas" />
        {areas.map((a) => (
          <View key={a.area} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Disc icon={AREA_ICON[a.area]} tone={AREA_TONE[a.area]} size={28} />
            <View style={{ flex: 1, gap: 2, paddingTop: 3 }}>
              <T v="h3" style={{ fontSize: 15, lineHeight: 19 }}>
                {AREA_NAMES[a.area]}
              </T>
              <T v="small" tone={a.line ? 'text2' : 'muted'}>
                {a.line ?? 'Not explored yet.'}
              </T>
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHead icon="calendar" tone="blue" title="Your history" />
        {history.length === 0 ? (
          <T tone="text2">Your history starts with the first step you choose.</T>
        ) : (
          history.map((i, n) => (
            <View key={`${i.date}-${n}`} style={{ gap: 2 }}>
              <T v="tiny">{dayMonth(i.date)}</T>
              <T bold>{i.title}</T>
              {i.detail ? (
                <T v="small" tone="text2">
                  {i.detail}
                </T>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </Page>
  )
}
