// My Journey (Edwin, 2026-10-28), progress told in words, never a score:
// what you're exploring now, what you've discovered (the readings you said
// sound like you), what you've tried and how it went (the ones that didn't
// help included), what's changed between your earlier and more recent
// answers, your eight parts of life and a quiet dated timeline. Built only
// from your own answers, steps, check-ins and reflections, on this phone. A
// part of life or a change with nothing behind it says so instead of guessing.
import { useState } from 'react'
import { View } from 'react-native'
import { growthPairs } from '@shared/growth'
import { cardTextOf } from '@shared/insights'
import { checkInFor, checkIns, discoveries, journeyHistory, lifeAreas, noteFor, outcomeLine, type Discovery } from '@shared/growthJourney'
import { reflectSettings } from '@shared/journal'
import { loadMoves } from '@shared/moves'
import { reflections } from '@shared/notebook'
import { loadHistory } from '@shared/profile'
import { AREA_NAMES, dayMonth } from '@shared/reflect'
import { DepthSwitch, useDeeper } from '../ui/Depth'
import { Back, Button, Card, Page, T } from '../ui/kit'
import { AREA_ICON, AREA_TONE, CardHead, Disc } from '../ui/parts'
import { PulseNote, usePagePulse } from '../ui/Pulse'
import { JourneyLine } from './TodayCards'

// Explore deeper shows more of each; Essential the latest few.
const SHOWN = { deeper: { found: 6, tried: 6, changed: 3, timeline: 20 }, essential: { found: 2, tried: 3, changed: 1, timeline: 5 } }

// One discovery, with "Why am I seeing this?": the answer it came from.
function Discovered({ d, pulse }: { d: Discovery; pulse: string | null }) {
  const [open, setOpen] = useState(false)
  const t = cardTextOf(d.questionId)
  return (
    <View style={{ gap: 2 }}>
      <T bold>{d.headline}</T>
      <T v="small" tone="muted">
        {`${dayMonth(d.date)} · ${d.verdict === 'me' ? 'You said: That’s me' : 'You said: Partly'}`}
      </T>
      <PulseNote text={pulse} style={{ marginTop: 4 }} />
      {t && (
        <>
          <Button small kind="text" label={open ? 'Hide why' : 'Why am I seeing this?'} onPress={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }} />
          {open && (
            <T v="small" tone="text2">
              {`From your answer: ${t.prompt} You chose “${t.label}”, and said it ${d.verdict === 'me' ? 'sounds like you' : 'partly sounds like you'}.`}
            </T>
          )}
        </>
      )}
    </View>
  )
}

export function Journey({ today, onBack, onWrite }: { today: string; onBack: () => void; onWrite: (prompt?: string) => void }) {
  const [moves] = useState(loadMoves)
  const [checks] = useState(checkIns)
  const [h] = useState(loadHistory)
  const [written] = useState(reflections)
  const [deeper, setDeeper] = useDeeper('journey')
  // The Human Pulse beside each discovery and step (Edwin, 2026-10-29).
  const pulse = usePagePulse(today)
  const shown = deeper ? SHOWN.deeper : SHOWN.essential
  const newest = [...moves].sort((a, b) => b.date.localeCompare(a.date))
  // The open step: not checked in on yet, or kept for later.
  const active = newest.find((m) => {
    const c = checkInFor(m.questionId, checks)
    return m.status === 'started' && (!c?.tried || !!c.later)
  })
  const tried = newest.filter((m) => m.status !== 'started' || checkInFor(m.questionId, checks)).slice(0, shown.tried)
  const found = discoveries(h)
  // What's changed: your own words come in only if you let your reflections into your Mirrors.
  const changed = growthPairs(h, written, today, undefined, { reflections: reflectSettings().reflectionsInMirror }).slice(0, shown.changed)
  const areas = lifeAreas(moves, h, written, today, checks)
  const timeline = journeyHistory(moves, written, checks, shown.timeline, found)

  return (
    <Page>
      <Back onPress={onBack} />
      <View style={{ gap: 4 }}>
        <T v="display">My journey</T>
        <T tone="text2">Little steps. Meaningful discoveries. What you’ve tried, and what you’re learning about yourself.</T>
      </View>
      <DepthSwitch deep={deeper} onChange={setDeeper} center={false} />

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
            No step open right now. When a card offers something to try, tap “I’ll try it”.
          </T>
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHead icon="leaf" tone="green" title="What you’ve discovered" />
        {found.length === 0 ? (
          <T tone="text2">When a reading sounds like you, tap “That’s me” under it, and it’s kept here.</T>
        ) : (
          found.slice(0, shown.found).map((d) => <Discovered key={d.questionId} d={d} pulse={pulse.answer(d.questionId, d.optionId)} />)
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHead icon="bulb" tone="amber" title="What you’ve tried" />
        {tried.length === 0 ? (
          <T tone="text2">When you try a step and tell me how it went, it shows here, the ones that didn’t help included.</T>
        ) : (
          tried.map((m) => {
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
                {!m.local && <PulseNote text={pulse.step(m.questionId, m.optionId)} style={{ marginTop: 4 }} />}
              </View>
            )
          })
        )}
      </Card>

      <Card style={{ gap: 12 }}>
        <CardHead icon="refresh" tone="blue" title="What’s changed" />
        {changed.length === 0 ? (
          <T tone="text2">Nothing to say yet. Once your answers about the same part of life differ over time, the earlier and the more recent show here side by side.</T>
        ) : (
          changed.map((g) => (
            <View key={`${g.kind}.${g.area}`} style={{ gap: 6 }}>
              <T v="label">{AREA_NAMES[g.area]}</T>
              <T v="small" tone="muted">
                {`Earlier, ${dayMonth(g.earlier.date)}`}
              </T>
              <T tone="text2">{g.kind === 'answers' ? `${g.earlier.asked} You chose “${g.earlier.words}”.` : `“${g.earlier.words}”`}</T>
              <T v="small" tone="muted">
                {`More recently, ${dayMonth(g.recent.date)}`}
              </T>
              <T tone="text2">{g.kind === 'answers' ? `${g.recent.asked} You chose “${g.recent.words}”.` : `“${g.recent.words}”`}</T>
            </View>
          ))
        )}
        <T v="tiny">A different answer isn’t better or worse. It’s a sign of how things have moved.</T>
      </Card>

      {deeper && (
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
      )}

      <Card style={{ gap: 12 }}>
        <CardHead icon="calendar" tone="blue" title="Your timeline" />
        {timeline.length === 0 ? (
          <T tone="text2">Your timeline starts with the first reading you keep or the first step you choose.</T>
        ) : (
          timeline.map((i, n) => (
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
