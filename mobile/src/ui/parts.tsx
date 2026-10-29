// Discs, initials, rings and this week's tiles.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Text } from './textScale'
import Svg, { Circle } from 'react-native-svg'
import { tintFor } from '@shared/avatarTint'
import { NEED_TINTS } from '@shared/needs'
import type { Tile } from '@shared/tapestry'
import { locale } from '@shared/locale'
import { font, useTheme } from '../theme'
import { Icon, type IconName } from './Icon'
import { T } from './kit'
import { THEMES } from '@shared/themes'
import type { ReflectionArea } from '@shared/notebook'

export type Tone = 'green' | 'blue' | 'purple' | 'rose' | 'amber'

// A soft coloured disc behind a line icon.
export function Disc({ icon, tone = 'green', size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const p = useTheme()
  const pair = {
    green: [p.accentWash, p.leaf],
    blue: [p.blueWash, p.blue],
    purple: [p.purpleWash, p.purple],
    rose: [p.roseWash, p.rose],
    amber: [p.amberWash, p.amberInk],
  }[tone]
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: pair[0], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={Math.round(size * 0.55)} color={pair[1]} />
    </View>
  )
}

// The head of a card: a small disc beside its title on one line, and
// everything else full width below, so an icon never squeezes the words into
// a narrow column (Edwin, 2026-10-28).
export function CardHead({ icon, tone, title, v = 'h3', right }: { icon: IconName; tone?: Tone; title: ReactNode; v?: 'h2' | 'h3' | 'eyebrow'; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Disc icon={icon} tone={tone} size={32} />
      <T v={v} style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
  )
}

// A line icon for a question's topic, in place of the old emoji (Edwin,
// 2026-10-28: one icon set only). A few topics have their own; the rest take
// their area's.
const TOPIC_ICONS: Record<string, IconName> = {
  'work-career': 'briefcase',
  colleagues: 'briefcase',
  'sleep-health': 'moon',
  rest: 'moon',
  learning: 'bulb',
  school: 'bulb',
  money: 'insights',
  'wealth-luxury': 'insights',
  faith: 'leaf',
  plans: 'pin',
  'getting-around': 'pin',
  phone: 'chat',
  celebrations: 'star',
}
const AREA_ICONS: Record<string, IconName> = { everyday: 'sun', people: 'people', inner: 'heart', desire: 'star' }

export function themeIcon(slug?: string): IconName {
  if (!slug) return 'today'
  return TOPIC_ICONS[slug] ?? AREA_ICONS[THEMES[slug]?.area ?? ''] ?? 'today'
}

// Each part of life's icon and tint (Reflect and My Journey share them).
export const AREA_ICON: Record<ReflectionArea, IconName> = { work: 'briefcase', school: 'notebook', family: 'heart', culture: 'globe', social: 'people', health: 'leaf', money: 'bars', self: 'you' }
export const AREA_TONE: Record<ReflectionArea, Tone> = { work: 'blue', school: 'blue', family: 'rose', culture: 'blue', social: 'blue', health: 'green', money: 'amber', self: 'purple' }

// Initials on a pastel picked from the name. No photos.
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tintFor(name), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.4, color: '#12283a' }}>{letter}</Text>
    </View>
  )
}

// The progress ring: "1 of 5 today", a window's time left.
export function Ring({ part, big, small, size = 64, label, onDark }: { part: number; big: string; small?: string; size?: number; label: string; onDark?: boolean }) {
  const p = useTheme()
  const r = 26
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, part))
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute' }}>
        <Circle cx={32} cy={32} r={r} stroke={onDark ? 'rgba(255,255,255,0.18)' : p.surface3} strokeWidth={5} fill="none" />
        {filled > 0 && (
          <Circle
            cx={32}
            cy={32}
            r={r}
            stroke={onDark ? p.brandLime : p.lime}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * filled} ${c}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </Svg>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.3, lineHeight: size * 0.34, color: onDark ? p.onNavy : p.text }}>{big}</Text>
      {small ? (
        <Text style={{ fontFamily: font.bold, fontSize: Math.max(8, size * 0.09), color: onDark ? p.onNavy2 : p.muted }}>
          {small}
        </Text>
      ) : null}
    </View>
  )
}

// This week's seven tiles, Monday to Sunday, the last one the Sunday Mirror:
// woven where you answered, open where you didn't, and nothing resets
// (Edwin, 2026-10-28: a ninety-day grid makes people give up).
export function WeekTiles({ tiles, dark }: { tiles: Tile[]; dark?: boolean }) {
  const p = useTheme()
  const woven = tiles.filter((t) => t.state === 'woven').length
  return (
    <View accessibilityRole="image" accessibilityLabel={`This week: ${woven} of 7 days woven`} style={{ flexDirection: 'row', gap: 8 }}>
      {tiles.map((t, i) => (
        <View key={t.date} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <View
            style={{
              alignSelf: 'stretch',
              aspectRatio: 1,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                t.state === 'woven' ? (t.need ? NEED_TINTS[t.need] : p.lime) : t.state === 'ahead' ? 'transparent' : dark ? 'rgba(255,255,255,0.12)' : p.surface3,
              borderWidth: t.today ? 2 : t.state === 'ahead' ? 1 : 0,
              borderColor: t.today ? (dark ? p.brandLime : p.text) : dark ? 'rgba(255,255,255,0.18)' : p.line,
            }}
          >
            {i === 6 && t.state === 'ahead' && <Icon name="mirror" size={14} color={dark ? p.onNavy2 : p.muted} />}
          </View>
          <Text style={{ fontFamily: t.today ? font.bold : font.medium, fontSize: 12, color: dark ? (t.today ? p.onNavy : p.onNavy2) : t.today ? p.text : p.muted }}>
            {new Date(`${t.date}T00:00:00Z`).toLocaleDateString(locale(), { weekday: 'narrow', timeZone: 'UTC' })}
          </Text>
        </View>
      ))}
    </View>
  )
}
