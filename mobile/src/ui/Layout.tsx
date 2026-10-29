// Layouts beyond the card (review, 2026-10-28: pages were stacks of the same
// card). A Section sits open on the page with no box; a Tile is a small,
// tappable square for the 2-up rows that lead elsewhere; a Spotlight is the
// one bold surface a page builds around. Today, Insights and Connect mix
// these with cards, the way the big apps vary their pages.
import { useId, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { tr } from '@shared/i18n'
import { brand, lift, radius, useTheme, typeScale } from '../theme'
import { Icon, type IconName } from './Icon'
import { feel, T } from './kit'
import { Disc } from './parts'

type Tone = 'green' | 'blue' | 'amber' | 'rose' | 'purple'

// Section: a title, an optional link on the right and its content, open on the page.
export function Section({ title, icon, action, children, style }: { title?: string; icon?: IconName; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  return (
    <View style={[{ gap: 12, marginTop: 16 }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitle}>
            {icon && <Icon name={icon} size={18} color={p.accentInk} />}
            {title ? <T v="h3">{title}</T> : null}
          </View>
          {action}
        </View>
      )}
      {children}
    </View>
  )
}

// TileRow: tiles side by side, each the same width.
export function TileRow({ children }: { children: ReactNode }) {
  return <View style={styles.tileRow}>{children}</View>
}

export function Tile({ icon, tone = 'blue', title, sub, onPress }: { icon: IconName; tone?: Tone; title: string; sub?: string; onPress: () => void }) {
  const p = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${tr(title)}. ${tr(sub)}` : tr(title)}
      onPress={() => {
        feel('tap')
        onPress()
      }}
      style={(s) => [styles.tile, { backgroundColor: p.surface, borderColor: p.line, borderWidth: p.dark ? 1 : 0, opacity: s.pressed ? 0.85 : 1 }, lift(p)]}
    >
      <View style={styles.tileTop}>
        <Disc icon={icon} tone={tone} size={34} />
        <Icon name="chevron" size={18} color={p.muted} />
      </View>
      <T v="h3" style={typeScale.body}>
        {title}
      </T>
      {sub ? (
        <T v="small" tone="muted" lines={2}>
          {sub}
        </T>
      ) : null}
    </Pressable>
  )
}

// Spotlight: the page's one bold surface, deep blue with light words and a
// low sun in the corner, in light and dark alike (in dark a brighter blue, so
// it never reads as just another card). Its children use the onNavy tones.
export function Spotlight({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = useTheme()
  const id = useId().replace(/:/g, '')
  // Measured, because a percentage size doesn't fill the box on iPhone.
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [top, bottom] = p.dark ? ['#1f5677', '#163f59'] : ['#0b4e70', '#013d5a']
  return (
    <View style={[styles.spotlight, { backgroundColor: bottom }, style]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={size.w} height={size.h}>
            <Defs>
              <LinearGradient id={`${id}sky`} x1="0" y1="0" x2="0.3" y2="1">
                <Stop offset="0" stopColor={top} />
                <Stop offset="1" stopColor={bottom} />
              </LinearGradient>
              <RadialGradient id={`${id}sun`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={brand.marigold} stopOpacity={0.32} />
                <Stop offset="1" stopColor={brand.marigold} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${id}sky)`} />
            <Circle cx={size.w - 36} cy={30} r={Math.min(130, size.w * 0.38)} fill={`url(#${id}sun)`} />
          </Svg>
        </View>
      )}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: radius.lg, padding: 16, gap: 6, minHeight: 112 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  spotlight: { borderRadius: radius.xl, padding: 20, gap: 14, overflow: 'hidden' },
})
