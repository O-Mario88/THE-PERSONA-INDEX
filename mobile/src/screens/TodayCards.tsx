// The quieter cards on Today: one next step of your own, the Mirror that's
// coming, and today's read. Each draws only from your own days and shows
// nothing rather than something generic.
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { tryAgain } from '@shared/growthJourney'
import { startMove } from '@shared/moves'
import type { ReflectionArea } from '@shared/notebook'
import { loadPrefs } from '@shared/prefs'
import { loadHistory } from '@shared/profile'
import { minutes, todaysRead } from '@shared/reads/reads'
import type { Read } from '@shared/reads/types'
import { AREA_NAMES } from '@shared/reflect'
import { load, loadJSON, saveJSON } from '@shared/storage'
import { nextMirror, quietStep, type QuietStep } from '@shared/todayFocus'
import { lift, radius, useTheme } from '../theme'
import { Button, Card, Chip, feel, RowLink, T } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { Section } from '../ui/Layout'
import { PulseNote, usePagePulse } from '../ui/Pulse'
import { CheckIn } from './CheckIn'

// One quiet next step: how a step you said you'd try went, else one thing to
// carry from today's answers, else a small idea from your own recent cards.
// Its title says which (Edwin's Today mockup, 2026-10-28).
const STEP_LABEL: Record<QuietStep['kind'], string> = {
  followUp: 'How did it go?',
  revisit: 'Something that helped before',
  carry: 'One thing worth trying',
  idea: 'One thing worth trying',
}
export function QuietStepCard({ today }: { today: string }) {
  const [step] = useState(() => quietStep(today, loadHistory(), undefined, loadPrefs().style))
  const [said, setSaid] = useState<string | null>(null)
  const pulse = usePagePulse(today)
  if (!step) return null
  // What the people who tried the same step found (the Human Pulse, Edwin 2026-10-29).
  const source = step.kind === 'idea' ? step : step.kind === 'carry' ? null : step.move.local ? null : step.move
  return (
    <Card style={{ gap: 10 }}>
      <T v="eyebrow">{STEP_LABEL[step.kind]}</T>
      {said ? <T tone="text2">{said}</T> : <StepBody today={today} step={step} onSaid={setSaid} />}
      {source && <PulseNote text={pulse.step(source.questionId, source.optionId)} />}
    </Card>
  )
}

function StepBody({ today, step, onSaid }: { today: string; step: QuietStep; onSaid: (reply: string) => void }) {
  if (step.kind === 'carry') {
    return (
      <>
        <T v="h3">{step.text}</T>
        <T v="small" tone="muted">
          From what today’s answers reached for.
        </T>
        <View style={{ flexDirection: 'row' }}>
          <Button small kind="secondary" label="I’ll keep this in mind" onPress={() => onSaid('It’s with you today. Nothing else to do.')} />
        </View>
      </>
    )
  }
  if (step.kind === 'idea') {
    return (
      <>
        <T v="h3">“{step.step}”</T>
        <T v="small" tone="muted">
          From when you chose “{step.from}”.
        </T>
        <View style={{ flexDirection: 'row' }}>
          <Button
            small
            kind="secondary"
            label="I'll try it"
            onPress={() => {
              startMove(today, step.questionId, step.optionId, step.step).catch(() => {})
              onSaid('I’ll ask you how it went.')
            }}
          />
        </View>
      </>
    )
  }
  if (step.kind === 'revisit') {
    return (
      <>
        <T v="h3">{step.line}</T>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            small
            kind="secondary"
            label="I’ll try it again"
            onPress={() => {
              tryAgain(step.move.questionId, today)
              onSaid('I’ll ask you how it went this time.')
            }}
          />
          <Button small kind="text" label="Not now" onPress={() => onSaid('That’s fine. It’s there whenever you want it.')} />
        </View>
      </>
    )
  }
  return <CheckIn move={step.move} today={today} onDone={onSaid} />
}

// The Mirror that's coming: how far away, a dot for each day this week
// (filled where you answered, nothing lost on a missed day), and what your
// answers lean towards so far.
export function MirrorCard({ today, onWrite, onInsights }: { today: string; onWrite: (prompt?: string) => void; onInsights: () => void }) {
  const p = useTheme()
  const [m] = useState(() => nextMirror(today, loadHistory()))
  if (!m) return null
  const when = m.days === 1 ? 'tomorrow' : `in ${m.days} days`
  const dots = [...m.answered, ...Array<boolean>(m.days).fill(false)]
  return (
    <Section title={m.first ? `Your first Mirror · ${when}` : `Your Sunday Mirror · ${when}`} icon="mirror">
      <View accessibilityLabel={`${m.answered.filter(Boolean).length} days answered this week`} style={{ flexDirection: 'row', gap: 6 }}>
        {dots.map((d, i) => (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: d ? p.lime : p.surface3 }} />
        ))}
      </View>
      <T tone="text2">{m.lean ? `So far, your answers lean towards ${m.lean}.` : 'Each day you answer adds to it. A missed day takes nothing away.'}</T>
      {!m.first && <JourneyLine today={today} onWrite={onWrite} />}
      <Button small kind="text" label="See what I’ve noticed" iconAfter="arrow" onPress={onInsights} style={{ alignSelf: 'flex-start' }} />
    </Section>
  )
}

// After the first Mirror: one part of your life to look at this week, so the
// week has a direction of its own. Kept on this phone (pi.journey.v1).
const JOURNEY = 'pi.journey.v1'
const JOURNEY_AREAS: ReflectionArea[] = ['work', 'family', 'social', 'money', 'health', 'self']
type Journey = { area: ReflectionArea; since: string }

export function JourneyLine({ today, onWrite }: { today: string; onWrite: (prompt?: string) => void }) {
  const [journey, setJourney] = useState(() => loadJSON(JOURNEY) as Journey | null)
  const [choosing, setChoosing] = useState(false)
  if (journey && !choosing) {
    const name = AREA_NAMES[journey.area].toLowerCase()
    return (
      <View style={{ gap: 4 }}>
        <T v="small" tone="muted">
          {`This week you’re looking at ${name}. What you write about it can come back in your Mirror.`}
        </T>
        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
          <Button small kind="text" icon="pencil" label={`Write about ${name}`} onPress={() => onWrite(`What’s one thing about ${name} you’d like to see more clearly?`)} />
          <Button small kind="text" label="Change" onPress={() => setChoosing(true)} />
        </View>
      </View>
    )
  }
  if (!choosing) return <Button small kind="text" label="Pick one part of your life to look at this week" onPress={() => setChoosing(true)} />
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {JOURNEY_AREAS.map((a) => (
        <Chip
          key={a}
          label={AREA_NAMES[a]}
          on={journey?.area === a}
          onPress={() => {
            const next = { area: a, since: today }
            saveJSON(JOURNEY, next)
            setJourney(next)
            setChoosing(false)
          }}
        />
      ))}
    </View>
  )
}

const OPENED = 'pi.read.'

// A reading as an editorial tile: a warm square with the book on the left,
// the title beside it.
function ReadTile({ title, label, onPress }: { title: string; label: string; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${title}`}
      onPress={() => {
        feel('tap')
        onPress()
      }}
      style={(s) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: p.surface,
          borderColor: p.line,
          borderWidth: p.dark ? 1 : 0,
          opacity: s.pressed ? 0.85 : 1,
        },
        lift(p),
      ]}
    >
      <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: p.amberWash, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="notebook" size={24} color={p.amberInk} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="label">{label}</T>
        <T v="h3" lines={2}>
          {title}
        </T>
      </View>
      <Icon name="chevron" size={18} color={p.muted} />
    </Pressable>
  )
}

// Today's read: a card in the wide screen's right-hand column, one quiet row
// at the foot of the phone's Today.
export function TodaysRead({ date, themes, intimacy, onRead, compact }: { date: string; themes: string[]; intimacy: boolean; onRead: (r: Read) => void; compact?: boolean }) {
  const [read] = useState(() =>
    todaysRead(
      date,
      themes,
      (slug) => {
        const d = load(OPENED + slug)
        return d !== null && d < date
      },
      intimacy,
    ),
  )
  if (!read) return null
  const again = load(OPENED + read.slug) === date
  if (compact) return <ReadTile title={read.title} label={`Something to read · ${minutes(read)} min`} onPress={() => onRead(read)} />
  return (
    <Card style={{ gap: 10 }}>
      <T v="label">{`Something to read · ${minutes(read)} min`}</T>
      <T v="h3">{read.title}</T>
      <T v="small" tone="muted">
        {read.summary}
      </T>
      <RowLink label={again ? 'Read it again' : 'Read it'} onPress={() => onRead(read)} />
    </Card>
  )
}
