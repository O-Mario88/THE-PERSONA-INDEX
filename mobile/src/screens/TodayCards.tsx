// The quieter cards on Today: one next step of your own, the Mirror that's
// coming, and today's read. Each draws only from your own days and shows
// nothing rather than something generic.
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { tryAgain } from '@shared/growthJourney'
import { startMove } from '@shared/moves'
import { checkIntention, intentions, reflections, type Intention, type IntentionCheck, type ReflectionArea } from '@shared/notebook'
import { dateOf } from '@shared/locale'
import { loadPrefs } from '@shared/prefs'
import { loadHistory } from '@shared/profile'
import { minutes, todaysRead } from '@shared/reads/reads'
import type { Read } from '@shared/reads/types'
import { AREA_NAMES } from '@shared/reflect'
import { load, loadJSON, saveJSON } from '@shared/storage'
import { mirrorDay, mirrorName } from '@shared/mirrorDay'
import { nextMirror, quietStep, type QuietStep } from '@shared/todayFocus'
import { dismissWelcomeBack, welcomeBack, WELCOME_BACK, WELCOME_BACK_LINE } from '@shared/welcomeBack'
import { lift, radius, useTheme } from '../theme'
import { Button, Card, Chip, feel, RowGroup, RowLink, T } from '../ui/kit'
import { Icon } from '../ui/Icon'
import { Section } from '../ui/Layout'
import { PulseNote, usePagePulse } from '../ui/Pulse'
import { CheckIn } from './CheckIn'
import { countEvent } from '@shared/productCounts'
import { inboxOf } from '@shared/inbox'
import { getOutside, getReflectTogether, getShares } from '@shared/social'
import { useAccount } from '@shared/useAccount'

// One quiet next step: how a step you said you'd try went, else one thing to
// carry from today's answers, else a small idea from your own recent cards.
// Its title says which (Edwin's Today mockup, 2026-10-28).
const STEP_LABEL: Record<QuietStep['kind'], string> = {
  followUp: 'How did it go?',
  checkIn: 'How did it go?',
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
  const source = step.kind === 'idea' ? step : step.kind === 'carry' || step.kind === 'checkIn' ? null : step.move.local ? null : step.move
  // Open on the page under its label, not in a box: Today keeps one strong
  // card, the day's questions, and sections around it (the light-mode
  // review, 2026-10-29).
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <T v="eyebrow">{STEP_LABEL[step.kind]}</T>
      {said ? <T tone="text2">{said}</T> : <StepBody today={today} step={step} onSaid={setSaid} />}
      {source && <PulseNote text={pulse.step(source.questionId, source.optionId)} />}
    </View>
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
  if (step.kind === 'checkIn') return <StepCheckIn intention={step.intention} today={today} onSaid={onSaid} />
  return <CheckIn move={step.move} today={today} onDone={onSaid} />
}

// How a step you wanted to try went (a hard moment's step, makeSense.ts, or
// one from Reflect). The answer is what "Remember what helps me" builds on,
// so it is kept as said: no score, and letting it go is an answer too.
const CHECKS: { check: IntentionCheck; label: string; reply: string }[] = [
  { check: 'helped', label: 'It helped', reply: 'I’ll remember that, and bring it back if something similar happens.' },
  { check: 'some', label: 'A little', reply: 'A little counts. I’ll keep it in mind.' },
  { check: 'not_yet', label: 'Not yet', reply: 'That’s fine. It’s still in your Notebook.' },
  { check: 'let_go', label: 'Let it go', reply: 'Let go. It won’t come back here.' },
]

function StepCheckIn({ intention, today, onSaid }: { intention: Intention; today: string; onSaid: (reply: string) => void }) {
  return (
    <>
      <T v="h3">“{intention.text.replace(/[.!]+$/, '')}”</T>
      <T v="small" tone="muted">{`You said you’d try this on ${dateOf(intention.date, { weekday: 'long' })}.`}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CHECKS.map((c) => (
          <Chip
            key={c.check}
            label={c.label}
            onPress={() => {
              checkIntention(intention.id, c.check, today)
              if (c.check === 'helped' || c.check === 'some') countEvent('step_helped')
              onSaid(c.reply)
            }}
          />
        ))}
      </View>
    </>
  )
}

// From your people (Edwin, 2026-10-29): at most one card on Today, below the
// personal next step, and only when something new arrived from someone you
// trust. It never says who is active, and opening Connect is the only action.
export function PeopleCard({ onConnect }: { onConnect: () => void }) {
  const me = useAccount()
  const [line, setLine] = useState<{ name: string; text: string } | null>(null)
  useEffect(() => {
    if (!me) return
    let live = true
    Promise.all([getShares(), getReflectTogether(), getOutside()]).then(
      ([sh, rt, out]) => {
        const e = inboxOf(sh, rt.items, out).find((x) => x.isNew)
        if (!live || !e) return
        const name = (n: string) => n.split(' ')[0]
        if (e.kind === 'received') setLine({ name: e.share.from.name, text: `${name(e.share.from.name)} shared something with you.` })
        else if (e.kind === 'replies') setLine({ name: e.share.people.find((p) => p.notes.some((n) => !n.mine))?.name ?? '', text: 'Someone replied to what you shared.' })
        else if (e.kind === 'together')
          setLine({ name: e.item.with.name, text: e.item.mine ? `${name(e.item.with.name)} answered your question.` : `${name(e.item.with.name)} invited you to reflect together.` })
        else if (e.kind === 'invite') setLine({ name: e.invite.from.name, text: `${name(e.invite.from.name)} asked you for a note.` })
        else setLine({ name: e.note.from.name, text: `${name(e.note.from.name)} wrote you a note.` })
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [me])
  if (!line) return null
  return (
    <Section title="From your people" icon="heart">
      <RowGroup>
        <RowLink inGroup label={line.text} sub="Only you can see it, on Connect" onPress={onConnect} />
      </RowGroup>
    </Section>
  )
}

// After a break (Edwin's brief, 2026-10-29): "Welcome back. Start with today,
// or pick up what you were exploring." No missed days, nothing to catch up
// on. Said once for each break (welcomeBack.ts).
export function WelcomeBackCard({ today, onStart, onWrite }: { today: string; onStart?: () => void; onWrite: (prompt?: string) => void }) {
  const [w, setW] = useState(() => welcomeBack(today, loadHistory(), reflections(), intentions()))
  if (!w) return null
  const done = () => {
    dismissWelcomeBack(today)
    setW(null)
  }
  const pickUp = w.pickUp
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <T v="h2">{WELCOME_BACK}</T>
        <T tone="text2">{WELCOME_BACK_LINE}</T>
      </View>
      {pickUp && (
        <View style={{ gap: 4 }}>
          <T v="eyebrow">{pickUp.label}</T>
          <T v="quote">{`“${pickUp.text}”`}</T>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Button
          small
          label="Start with today"
          onPress={() => {
            done()
            onStart?.()
          }}
        />
        {pickUp && (
          <Button
            small
            kind="secondary"
            label="Pick it up"
            onPress={() => {
              done()
              onWrite(pickUp.prompt)
            }}
          />
        )}
      </View>
    </Card>
  )
}

// The Mirror that's coming, on the day the person chose: how far away, a dot
// for each day of the week it will show (filled where you answered, nothing
// lost on a missed day), and what your answers lean towards so far. On the
// day itself, a way in.
export function MirrorCard({ today, onWrite, onInsights, onMirror }: { today: string; onWrite: (prompt?: string) => void; onInsights: () => void; onMirror?: () => void }) {
  const p = useTheme()
  const [day] = useState(mirrorDay)
  const [m] = useState(() => nextMirror(today, loadHistory(), day))
  if (!m) return null
  const when = m.days === 1 ? 'tomorrow' : `in ${m.days} days`
  const dots = [...m.answered, ...Array<boolean>(m.ahead).fill(false)]
  const title = m.ready ? `Your ${mirrorName(day)} is ready` : m.first ? `Your first Mirror · ${when}` : `Your ${mirrorName(day)} · ${when}`
  if (m.ready)
    return (
      <Section title={title} icon="mirror">
        <T tone="text2">Last week, set only against your own: what mattered, what kept coming up and what helped.</T>
        <Button small label="Open your Mirror" iconAfter="arrow" onPress={onMirror ?? onInsights} style={{ alignSelf: 'flex-start' }} />
      </Section>
    )
  return (
    <Section title={title} icon="mirror">
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
