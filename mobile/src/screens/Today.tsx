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
import { Button, Card, RowLink, T } from '../ui/kit'
import { Avatar, Ring, Tapestry } from '../ui/parts'
import { Icon } from '../ui/Icon'

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })

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

      <HeroCard hero={hero} now={now} onOpen={onOpen} />
    </>
  )
  const tapestry = (
    <Card style={{ gap: 12 }}>
      <T v="label">Season tapestry · day {s.day} of 90</T>
      <Tapestry s={s} cols={rail ? 12 : 18} width={inner} />
    </Card>
  )
  const ritual = (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="h2">Today’s ritual</T>
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
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 20 }}>
          {top}
          {ritual}
          {children}
        </View>
        <View style={{ width: RAIL_W, gap: 20 }}>
          {tapestry}
          {read}
        </View>
      </View>
    )
  }
  return (
    <>
      {top}
      {tapestry}
      {ritual}
      {read}
      {children}
    </>
  )
}

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
        <T v="eyebrow">Today's read · {minutes(read)} min</T>
        <T v="h2" style={{ fontSize: 22, lineHeight: 28 }}>
          {read.title}
        </T>
        <T tone="muted">{read.summary}</T>
        <RowLink label={load(OPENED + read.slug) === date ? 'Read it again' : 'Read it'} onPress={() => onRead(read)} />
      </Card>
    </>
  )
}
