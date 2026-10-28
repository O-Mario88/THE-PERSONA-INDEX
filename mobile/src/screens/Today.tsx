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
import type { Memory } from '@shared/todayFocus'
import { radius, RAIL_W, useTheme, WIDE } from '../theme'
import { Button, Card, Chip, Hairline, T } from '../ui/kit'
import { Avatar } from '../ui/parts'
import { Icon } from '../ui/Icon'
import { HeavyCard } from './QuestionCard'
import { MirrorCard, QuietStepCard, TodaysRead } from './TodayCards'

interface TodayProps {
  date: string
  window: Window
  name?: string | null
  note?: string | null // a line from your own days, under the greeting
  hero: Hero
  memory: Memory | null
  link: string | null // how today's questions tie to the memory, when they do
  tomorrow: string | null
  onOpen: () => void
  onAccount: () => void
  themes: string[]
  intimacy: boolean
  onRead: (r: Read) => void
  rail?: boolean // a right-hand column beside the feed, on a very wide screen
  onWrite: (prompt?: string) => void
  children?: ReactNode
}

export function Today({ date, window: w, name, note, hero, memory, link, tomorrow, onOpen, onAccount, themes, intimacy, onRead, rail, onWrite, children }: TodayProps) {
  const { width } = useWindowDimensions()
  const header = (
    <View style={styles.header}>
      <Wash />
      <View style={styles.headerTop}>
        {/* Beside the sidebar the brand is already on screen. */}
        <T v="label" tone="text">
          {width >= WIDE ? '' : 'The Persona Index'}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('You and settings')} onPress={onAccount} hitSlop={8}>
          <Avatar name={name || 'You'} size={36} />
        </Pressable>
      </View>
      <View style={{ gap: 8, paddingTop: 28 }}>
        <T v="display" style={width < 400 ? { fontSize: 29, lineHeight: 34 } : { fontSize: 34, lineHeight: 40 }}>
          {greeting(w, name)}
        </T>
        {note ? <T tone="text2">{note}</T> : null}
      </View>
    </View>
  )
  const main = <MainCard hero={hero} memory={memory} link={link} tomorrow={tomorrow} onOpen={onOpen} />
  const step = <QuietStepCard today={date} />
  const moment = <NeedAMoment onWrite={onWrite} />
  const mirror = <MirrorCard today={date} onWrite={onWrite} />
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
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
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
      <Path d="M0 158 C 80 122, 160 152, 240 132 S 360 112, 400 126 L400 200 L0 200 Z" fill={p.lime} opacity={0.03} />
      <Path d="M0 182 C 100 152, 200 176, 300 162 S 380 152, 400 160 L400 200 L0 200 Z" fill={p.lime} opacity={0.045} />
    </Svg>
  )
}

// The one card that matters: what you said last time (kept behind a tap, so
// nobody glancing at your phone reads it), and today's questions tied to it.
function MainCard({ hero, memory, link, tomorrow, onOpen }: { hero: Hero; memory: Memory | null; link: string | null; tomorrow: string | null; onOpen: () => void }) {
  return (
    <Card style={{ gap: 16 }}>
      {memory && (
        <>
          <MemoryRow memory={memory} />
          <Hairline />
        </>
      )}
      <View style={{ gap: 6 }}>
        <T v="label">{hero.eyebrow}</T>
        <T v="h2" style={{ fontSize: 22, lineHeight: 27 }}>
          {hero.title}
        </T>
        <T tone="text2">{link ?? hero.sub}</T>
        {tomorrow ? (
          <T v="small" tone="muted">
            {tomorrow}
          </T>
        ) : null}
      </View>
      {hero.action && <Button wide label={hero.action} iconAfter="chevron" onPress={onOpen} />}
    </Card>
  )
}

function MemoryRow({ memory }: { memory: Memory }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  const label = tr(memory.kind === 'writing' ? 'From your last reflection' : 'From your last answers')
  return (
    <View style={{ gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${tr(memory.when)}. ${tr(open ? 'Hide it' : 'Tap to read')}`}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}
      >
        <Icon name={open ? 'bookmark' : 'lock'} size={16} color={p.muted} />
        <T v="label" style={{ flex: 1 }}>
          {`${label} · ${tr(memory.when)}`}
        </T>
        <T v="small" tone="accent" bold>
          {open ? 'Hide it' : 'Tap to read'}
        </T>
      </Pressable>
      {open &&
        (memory.kind === 'writing' ? (
          <T v="quote" lines={5} style={{ fontSize: 19, lineHeight: 25 }}>
            “{memory.text}”
          </T>
        ) : (
          <View style={{ gap: 4 }}>
            <T v="h3">You chose “{memory.label}”.</T>
            <T tone="text2">I noticed: {memory.noticed}</T>
          </View>
        ))}
    </View>
  )
}

// The real-life moment: open the app because something happened, not
// because it's time. Each way in opens one fitting question in Reflect;
// heavy goes to people and a helpline first.
const MOMENTS = [
  { label: 'I need clarity', prompt: 'What are you trying to decide, and what matters most to you in it?' },
  { label: 'A difficult conversation', prompt: 'Who is the conversation with, and what do you most want them to understand?' },
  { label: 'Something good happened', prompt: 'What happened? Tell me about it, so you can come back to it.' },
]

function NeedAMoment({ onWrite }: { onWrite: (prompt?: string) => void }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  const [heavy, setHeavy] = useState(false)
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 4 }}
      >
        <Icon name="heart" size={18} color={p.accentInk} />
        <T tone="accent" bold>
          Need a moment?
        </T>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={p.accentInk} />
        </View>
      </Pressable>
      {open && (
        <Card style={{ gap: 10 }}>
          <T v="h3">What's going on?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="Something feels heavy" on={heavy} onPress={() => setHeavy(true)} />
            {MOMENTS.map((m) => (
              <Chip key={m.label} label={m.label} onPress={() => onWrite(m.prompt)} />
            ))}
            <Chip label="Just write" onPress={() => onWrite()} />
          </View>
          {heavy && (
            <>
              <HeavyCard />
              <Button small kind="ghost" icon="pencil" label="Write it down, just for me" onPress={() => onWrite('What’s weighing on you right now? You can write as much or as little as you like.')} />
            </>
          )}
        </Card>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { borderRadius: radius.lg, overflow: 'hidden', padding: 20, paddingBottom: 28 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
})
