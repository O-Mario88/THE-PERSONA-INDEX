// Today, focused (Edwin, 2026-10-28): your greeting and a line from your own
// days, one card that remembers what you said and opens today's questions,
// one quiet next step, a way in when something happens, and the Mirror
// that's coming. Nothing here counts, badges or asks for more.
import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import type { Window } from '@shared/day'
import { greeting, type Hero } from '@shared/homeHero'
import { tr } from '@shared/i18n'
import type { Read } from '@shared/reads/types'
import type { JourneyNote, Memory } from '@shared/todayFocus'
import { radius, RAIL_W, useTheme, WIDE, typeScale } from '../theme'
import { Button, Card, Chip, T } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { Section, Spotlight } from '../ui/Layout'
import { PulseNote, usePagePulse } from '../ui/Pulse'
import { Logo } from '../ui/Logo'
import { Icon } from '../ui/Icon'
import { KeepMoment } from './KeepMoment'
import { HeavyCard } from './QuestionCard'
import { MirrorCard, QuietStepCard, TodaysRead } from './TodayCards'
import { STARTS, type SenseStart } from '@shared/makeSense'

interface TodayProps {
  date: string
  window: Window
  name?: string | null
  note?: string | null // a line from your own days, under the greeting
  hero: Hero
  memory: Memory | null
  journey: JourneyNote | null // "From your journey", when a step of yours from the past week has something to say
  link: string | null // how today's questions tie to the memory, when they do
  tomorrow: string | null
  onOpen: () => void
  onAccount: () => void
  themes: string[]
  intimacy: boolean
  onRead: (r: Read) => void
  rail?: boolean // a right-hand column beside the feed, on a very wide screen
  onWrite: (prompt?: string, followsUp?: string) => void
  onInsights: () => void
  onMirror?: () => void
  onSense: (start: SenseStart) => void // help making sense of something (MakeSense.tsx)
  children?: ReactNode
}

export function Today({
  date,
  window: w,
  name,
  note,
  hero,
  memory,
  journey,
  link,
  tomorrow,
  onOpen,
  onAccount,
  themes,
  intimacy,
  onRead,
  rail,
  onWrite,
  onInsights,
  onMirror,
  onSense,
  children,
}: TodayProps) {
  const { width } = useWindowDimensions()
  const header = (
    <View style={styles.header}>
      <Wash />
      <View style={styles.headerTop}>
        {/* Beside the sidebar the brand is already on screen. */}
        {width >= WIDE ? <View /> : <Logo size={30} />}
        <Pressable accessibilityRole="button" accessibilityLabel={tr('You and settings')} onPress={onAccount} hitSlop={8}>
          <Avatar name={name || 'You'} size={36} />
        </Pressable>
      </View>
      <View style={{ gap: 8, paddingTop: 28 }}>
        <T v="display">{greeting(w, name)}</T>
        <T tone="text2">{note ?? 'A little more clarity, one day at a time.'}</T>
      </View>
    </View>
  )
  const main = <MainCard today={date} hero={hero} memory={memory} journey={journey} link={link} tomorrow={tomorrow} onOpen={onOpen} onWrite={onWrite} />
  const step = <QuietStepCard today={date} />
  const moment = <NeedAMoment today={date} onWrite={onWrite} onSense={onSense} />
  const mirror = <MirrorCard today={date} onWrite={onWrite} onInsights={onInsights} onMirror={onMirror} />
  if (rail) {
    return (
      <View style={{ gap: 20 }}>
        {header}
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 20 }}>
            {main}
            {step}
            {moment}
            {children}
          </View>
          <View style={{ width: RAIL_W, gap: 20 }}>
            {mirror}
            <TodaysRead date={date} themes={themes} intimacy={intimacy} onRead={onRead} />
          </View>
        </View>
      </View>
    )
  }
  return (
    <>
      {header}
      {main}
      {step}
      {moment}
      {mirror}
      <TodaysRead compact date={date} themes={themes} intimacy={intimacy} onRead={onRead} />
      {children}
    </>
  )
}

// A soft cream-to-midnight wash behind the greeting, with a low sun and two
// hills: the feeling of a morning without a photo. Midnight and marigold
// come from the palette, so it turns with dark mode.
function Wash() {
  const p = useTheme()
  // Measured, because a percentage size doesn't fill the box on iPhone.
  const [size, setSize] = useState({ w: 0, h: 0 })
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="todaySky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.dark ? p.accentWash : p.amberWash} />
              <Stop offset="1" stopColor={p.surface} />
            </LinearGradient>
            <RadialGradient id="todaySun" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={p.brandLime} stopOpacity={p.dark ? 0.3 : 0.5} />
              <Stop offset="1" stopColor={p.brandLime} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="400" height="200" fill="url(#todaySky)" />
          <Circle cx="330" cy="58" r="96" fill="url(#todaySun)" />
          <Path d="M0 158 C 80 122, 160 152, 240 132 S 360 112, 400 126 L400 200 L0 200 Z" fill={p.brandLime} opacity={p.dark ? 0.06 : 0.1} />
          <Path d="M0 182 C 100 152, 200 176, 300 162 S 380 152, 400 160 L400 200 L0 200 Z" fill={p.brandLime} opacity={p.dark ? 0.09 : 0.14} />
        </Svg>
      )}
    </View>
  )
}

// The one card that matters: from your journey (what you've been exploring
// and what you said about it), else what you said last time (kept behind a
// tap, so nobody glancing at your phone reads it), then today's questions,
// shown by the first one waiting.
function MainCard({
  today,
  hero,
  memory,
  journey,
  link,
  tomorrow,
  onOpen,
  onWrite,
}: {
  today: string
  hero: Hero
  memory: Memory | null
  journey: JourneyNote | null
  link: string | null
  tomorrow: string | null
  onOpen: () => void
  onWrite: (prompt?: string, followsUp?: string) => void
}) {
  // Smaller on a narrow phone, so the title sits on one line.
  const narrow = useWindowDimensions().width < 400
  return (
    <View style={{ gap: 20 }}>
      {journey ? <JourneyRow lines={journey.lines} /> : memory && <MemoryRow memory={memory} today={today} onWrite={onWrite} />}
      {/* Today's sitting: the one bold surface on the page (review, 2026-10-28). */}
      <Spotlight>
        <View style={{ gap: 6 }}>
          <T v="label" tone="onNavy2">
            {hero.eyebrow}
          </T>
          <T v={narrow ? 'h2' : 'title'} tone="onNavy">
            {hero.title}
          </T>
          <T tone="onNavy2">{journey ? hero.sub : (link ?? hero.sub)}</T>
          {tomorrow ? (
            <T v="small" tone="onNavy2">
              {tomorrow}
            </T>
          ) : null}
        </View>
        {hero.action && <Button wide kind="warm" label={hero.action} iconAfter="chevron" onPress={onOpen} />}
      </Spotlight>
    </View>
  )
}

// From your journey (shared todayFocus.ts journeyNote): only your own steps,
// what you said about them, and whether today comes back to them.
function JourneyRow({ lines }: { lines: string[] }) {
  const [first, ...rest] = lines
  return (
    <View style={{ gap: 6 }}>
      <T v="eyebrow">From your journey</T>
      <T v="h3">{first}</T>
      {rest.map((line) => (
        <T key={line} tone="text2">
          {line}
        </T>
      ))}
    </View>
  )
}

function MemoryRow({ memory, today, onWrite }: { memory: Memory; today: string; onWrite: (prompt?: string, followsUp?: string) => void }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  const pulse = usePagePulse(today)
  const label = tr(memory.kind === 'writing' ? 'Your last reflection' : 'Your last answers')
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${tr(memory.when)}. ${tr(open ? 'Hide it' : 'Tap to read')}`}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 40,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: p.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={open ? 'bookmark' : 'lock'} size={16} color={p.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label" tone="text2">
            {label}
          </T>
          <T v="tiny" lines={1}>
            {memory.when}
          </T>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: radius.sm,
            backgroundColor: p.accentWash,
          }}
        >
          <T v="small" tone="accent" bold>
            {open ? 'Hide it' : 'Tap to read'}
          </T>
        </View>
      </Pressable>
      {open &&
        (memory.kind === 'writing' ? (
          <T v="quote" lines={5} style={typeScale.sub}>
            “{memory.text}”
          </T>
        ) : (
          <View style={{ gap: 4 }}>
            <T v="h3">You chose “{memory.label}”.</T>
            <T tone="text2">I noticed: {memory.noticed}</T>
            <PulseNote text={pulse.answer(memory.questionId, memory.optionId)} style={{ marginTop: 4 }} />
          </View>
        ))}
      {/* Remembering leads somewhere: carry on from it in Reflect. */}
      {open && (
        <Button
          small
          kind="text"
          icon="pencil"
          label={memory.kind === 'writing' ? 'Write more about this' : 'Reflect on this'}
          onPress={() =>
            memory.kind === 'writing'
              ? onWrite('Looking back at what you wrote, what’s changed since then, or what would you add?', memory.id)
              : onWrite(`You chose “${memory.label}”. What do you make of it now?`)
          }
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  )
}

// The real-life moment: open the app because something happened, not
// because it's time. Each way in opens one fitting question in Reflect;
// heavy goes to people and a helpline first.
const GOOD = { label: 'Something good happened', prompt: 'What happened? Tell me about it, so you can come back to it.' }

function NeedAMoment({ today, onWrite, onSense }: { today: string; onWrite: (prompt?: string) => void; onSense: (start: SenseStart) => void }) {
  const [heavy, setHeavy] = useState(false)
  const [keeping, setKeeping] = useState(false)
  const [more, setMore] = useState(false)
  const start = (id: SenseStart) => STARTS.find((x) => x.id === id) ?? STARTS[0]
  return (
    <Section title="Need a moment?" icon="heart">
      {/* Heavy first, then the ways into making sense of something (Edwin's
          brief, 2026-10-29), the rest behind More, wrapped, never cut off. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="Something feels heavy" on={heavy} onPress={() => setHeavy(!heavy)} />
        {(['overthinking', 'conversation', 'yes'] as SenseStart[]).map((id) => (
          <Chip key={id} label={start(id).short} onPress={() => onSense(id)} />
        ))}
        {more ? (
          <>
            <Chip label={start('week').short} onPress={() => onSense('week')} />
            <Chip label="Keep a moment" on={keeping} onPress={() => setKeeping(!keeping)} />
            <Chip label={GOOD.label} onPress={() => onWrite(GOOD.prompt)} />
            <Chip label="Just write" onPress={() => onWrite()} />
          </>
        ) : (
          <Chip label="More" icon="chevron" onPress={() => setMore(true)} />
        )}
      </View>
      {(keeping || heavy) && (
        <Card style={{ gap: 10 }}>
          {keeping && <KeepMoment today={today} />}
          {heavy && (
            <>
              <HeavyCard />
              <Button
                small
                kind="secondary"
                icon="pencil"
                label="Write it down, just for me"
                onPress={() => onWrite('What’s weighing on you right now? You can write as much or as little as you like.')}
              />
            </>
          )}
        </Card>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  header: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    padding: 20,
    paddingBottom: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
})
