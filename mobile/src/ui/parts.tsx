// Discs, initials, rings and the season tapestry.
import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { tintFor } from '@shared/avatarTint'
import { NEED_TINTS } from '@shared/needs'
import type { Season } from '@shared/tapestry'
import { font, useTheme } from '../theme'
import { Icon, type IconName } from './Icon'

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

// Ninety tiles, one a day. A missed day stays linen; nothing resets.
export function Tapestry({ s, cols = 15, dark, width }: { s: Season; cols?: number; dark?: boolean; width: number }) {
  const p = useTheme()
  const gap = 4
  const tile = Math.floor((width - gap * (cols - 1)) / cols)
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Season tapestry, day ${s.day} of 90: ${s.woven} ${s.woven === 1 ? 'day' : 'days'} woven`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap, width }}
    >
      {s.tiles.map((t) => (
        <View
          key={t.date}
          style={{
            width: tile,
            height: tile,
            borderRadius: 3,
            backgroundColor:
              t.state === 'woven' ? (t.need ? NEED_TINTS[t.need] : p.lime) : t.state === 'ahead' ? 'transparent' : dark ? 'rgba(255,255,255,0.12)' : p.surface3,
            borderWidth: t.today ? 2 : t.state === 'ahead' ? 1 : 0,
            borderColor: t.today ? (dark ? p.brandLime : p.text) : dark ? 'rgba(255,255,255,0.14)' : p.line,
          }}
        />
      ))}
    </View>
  )
}
