// Today: the greeting and the day's ring, one card
// for what is open now, the season tapestry, the day's five windows, and
// today's read. Nothing here asks for anything.
import { useState, type ReactNode } from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { clock, left, MORNING_CLOSES, useNow, WINDOW_INFO, WINDOWS, type OpenWindow, type Window } from '@shared/day'
import { greeting, type Hero, type Progress } from '@shared/homeHero'
import { load } from '@shared/storage'
import { season } from '@shared/tapestry'
import { windowsDone } from '@shared/windows'
import { minutes, todaysRead } from '@shared/reads/reads'
import type { Read } from '@shared/reads/types'
import { font, gutter, lift, radius, RAIL_W, useTheme, WIDE } from '../theme'
import { Button, Card, Chip, RowLink, T } from '../ui/kit'
import { HeavyCard } from './QuestionCard'
import { Avatar, Ring, Tapestry } from '../ui/parts'
import { Icon } from '../ui/Icon'
import { locale } from '@shared/locale'

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'long', timeZone: 'UTC' })

export function Today({
  date,
  window: w,
  name,
  note,
  hero,
  onOpen,
  onAccount,
  morning,
  evening,
  themes,
  intimacy,
  onRead,
  rail,
  onWrite,
  onMoment,
  children,
}: {
  date: string
  window: Window
  name?: string | null
  note?: string | null
  hero: Hero
  onOpen: () => void
  onAccount: () => void
  morning: Progress
  evening: Progress | null
  themes: string[]
  intimacy: boolean
  onRead: (r: Read) => void
  rail?: boolean // a right-hand column beside the feed, on a very wide screen
  onWrite: () => void
  onMoment: (prompt: string) => void
  children?: ReactNode
}) {
  const { width } = useWindowDimensions()
  const now = useNow()
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const items = dayItems(date, w, morning, evening, nowMin)
  const doneCount = items.filter((i) => i.state === 'done').length
  const s = season(date)
  // The tapestry's width inside its card (the card's padding and hairline).
  const inner = (rail ? RAIL_W : Math.min(width, 640) - gutter * 2) - 42
  const top = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Beside the sidebar the brand is already on screen. */}
        <T v="label" tone="text">
          {width >= WIDE ? '' : 'The Persona Index'}
        </T>
        <Pressable accessibilityRole="button" accessibilityLabel="You and settings" onPress={onAccount} hitSlop={8}>
          <Avatar name={name || 'You'} size={36} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 8 }}>
          <T v="label">
            {weekdayOf(date)} · {clock(nowMin)}
          </T>
          <T v="display" style={{ fontSize: 36, lineHeight: 40 }}>
            {greeting(w, name)}
          </T>
          {note ? <T tone="text2">{note}</T> : null}
        </View>
        <Ring part={doneCount / items.length} label={`${doneCount} of ${items.length} windows done today`} big={String(doneCount)} small={`of ${items.length} today`} size={92} />
      </View>
    </>
  )
  // The first cards. On a very wide screen they start level with the
  // right-hand column, under the greeting that spans both.
  const lead = (
    <>
      <HeroCard hero={hero} now={now} onOpen={onOpen} />
      <Composer name={name} window={w} onWrite={onWrite} onMoment={onMoment} />
    </>
  )
  const tapestry = (
    <Card style={{ gap: 12 }}>
      <T v="label">Your season · day {s.day} of 90</T>
      <Tapestry s={s} cols={rail ? 12 : 18} width={inner} />
    </Card>
  )
  const ritual = (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">Your day so far</T>
        <T v="small" tone="muted">
          {doneCount} of {items.length} complete
        </T>
      </View>
      <DayLine items={items} />
    </Card>
  )
  const read = <TodaysRead date={date} themes={themes} intimacy={intimacy} onRead={onRead} />
  if (rail) {
    return (
      <View style={{ gap: 20 }}>
        {top}
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 20 }}>
            {lead}
            {ritual}
            {children}
          </View>
          <View style={{ width: RAIL_W, gap: 20 }}>
            {tapestry}
            {read}
          </View>
        </View>
      </View>
    )
  }
  return (
    <>
      {top}
      {lead}
      {tapestry}
      {ritual}
      {read}
      {children}
    </>
  )
}

// A blank page, always one tap away, the way Facebook asks what's on your
// mind. The words follow the hour, and nothing written here leaves the phone.
const COMPOSER: Record<Window, string> = {
  morning: "What's on your mind",
  midday: "What's on your mind",
  afternoon: "What's on your mind",
  evening: 'How was today',
  night: 'Anything you want to put down before sleep',
  rest: 'Still up',
}

function Composer({ name, window: w, onWrite, onMoment }: { name?: string | null; window: Window; onWrite: () => void; onMoment: (prompt: string) => void }) {
  const p = useTheme()
  const [open, setOpen] = useState(false)
  const [heavy, setHeavy] = useState(false)
  const ask = `${COMPOSER[w]}${name ? `, ${name}` : ''}?`
  return (
    <>
    <Card pad={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar name={name || 'You'} size={40} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ask}
        accessibilityHint="Opens a blank page in Reflect. Only you can read it."
        onPress={() => setOpen(!open)}
        style={(s) => ({
          flex: 1,
          minHeight: 44,
          justifyContent: 'center',
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          backgroundColor: (s as { hovered?: boolean }).hovered ? p.surface3 : p.surface2,
        })}
      >
        <T tone="muted">{ask}</T>
      </Pressable>
    </Card>
    {open && (
      <Card style={{ gap: 10 }}>
        <T v="h3">What's going on?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Something feels heavy" onPress={() => setHeavy(true)} />
          {MOMENTS.map((m) => (
            <Chip key={m.label} label={m.label} onPress={() => onMoment(m.prompt)} />
          ))}
          <Chip label="Just write" onPress={onWrite} />
        </View>
        {heavy && (
          <>
            <HeavyCard />
            <Button small kind="ghost" icon="pencil" label="Write it down, just for me" onPress={() => onMoment('What’s weighing on you right now? You can write as much or as little as you like.')} />
          </>
        )}
      </Card>
    )}
    </>
  )
}

// The real-life moment: open the app because something happened, not
// because it's time. Each opens one fitting question in Reflect; heavy goes
// to people and a helpline first.
const MOMENTS = [
  { label: 'I need clarity', prompt: 'What are you trying to decide, and what matters most to you in it?' },
  { label: 'A difficult conversation', prompt: 'Who is the conversation with, and what do you most want them to understand?' },
  { label: 'Something good happened', prompt: 'What happened? Tell me about it, so you can come back to it.' },
]

function HeroCard({ hero, now, onOpen }: { hero: Hero; now: number; onOpen: () => void }) {
  const p = useTheme()
  let ring: ReactNode = null
  if (hero.closes && hero.opened) {
    const l = left(hero.closes - now)
    const part = (hero.closes - now) / (hero.closes - hero.opened)
    ring = <Ring part={part} label={`${l.text} left`} big={l.hours > 0 ? `${l.hours}h` : `${l.minutes}m`} small={l.hours > 0 ? `${l.minutes}m` : undefined} size={60} />
  }
  return (
    <View style={[{ backgroundColor: p.surface, borderColor: p.line, borderWidth: 1, borderRadius: radius.lg, padding: 20, gap: 16 }, lift(p)]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <T v="eyebrow">{hero.eyebrow}</T>
          <T v="h2" style={{ fontSize: 22, lineHeight: 27 }}>
            {hero.title}
          </T>
          <T tone="text2">{hero.sub}</T>
        </View>
        {ring}
      </View>
      {hero.action && <Button wide label={hero.action} iconAfter="chevron" onPress={onOpen} />}
    </View>
  )
}

type DayItem = { k: OpenWindow; name: string; state: 'done' | 'now' | 'open' | 'missed' | 'later'; sub: string }

function dayItems(date: string, w: Window, morning: Progress, evening: Progress | null, nowMin: number): DayItem[] {
  const done = windowsDone(date)
  return WINDOWS.map((k) => {
    const info = WINDOW_INFO[k]
    const isDone = k === 'morning' ? morning === 'done' : k === 'evening' ? evening === 'done' : done[k] !== undefined
    const isNow = k === w
    const stillOpen =
      (k === 'morning' && morning !== 'done' && nowMin >= info.opens && nowMin < MORNING_CLOSES) ||
      (k === 'evening' && evening !== null && evening !== 'done' && nowMin >= info.opens)
    const past = nowMin >= info.closes
    const state = isDone ? 'done' : isNow ? 'now' : stillOpen ? 'open' : past ? 'missed' : 'later'
    const at = done[k]
    const sub =
      state === 'done' ? (at !== undefined ? `done · ${clock(at)}` : 'done') : state === 'now' ? 'now' : state === 'open' ? 'still open' : state === 'missed' ? 'closed' : clock(info.opens)
    return { k, name: info.short, state, sub }
  })
}

// "Today's ritual": the five windows as one stepper.
function DayLine({ items }: { items: DayItem[] }) {
  const p = useTheme()
  return (
    <View accessibilityLabel="Your day" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', left: '10%', right: '10%', top: 15, height: 2, backgroundColor: p.line }} />
      {items.map((i) => {
        const done = i.state === 'done'
        const now = i.state === 'now'
        return (
          <View key={i.k} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: done || now ? p.lime : p.lineStrong,
                backgroundColor: p.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {done && <Icon name="check" size={16} color={p.lime} width={2.4} />}
            </View>
            <T v="small" style={{ fontFamily: done || now ? font.bold : font.medium, color: done || now ? p.text : p.muted }}>
              {i.name}
            </T>
            <T v="tiny">{i.sub}</T>
          </View>
        )
      })}
    </View>
  )
}

const OPENED = 'pi.read.'

function TodaysRead({ date, themes, intimacy, onRead }: { date: string; themes: string[]; intimacy: boolean; onRead: (r: Read) => void }) {
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
  return (
    <>
      <Card style={{ gap: 10 }}>
        <T v="eyebrow">Something for you to read · {minutes(read)} min</T>
        <T v="h2" style={{ fontSize: 22, lineHeight: 28 }}>
          {read.title}
        </T>
        <T tone="muted">{read.summary}</T>
        <RowLink label={load(OPENED + read.slug) === date ? 'Read it again' : 'Read it'} onPress={() => onRead(read)} />
      </Card>
    </>
  )
}
